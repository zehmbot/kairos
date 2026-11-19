import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportInfo, HubEvent } from "../shared/types.ts";
import { findBrowser } from "./camera.ts";
import { EventBus } from "./events.ts";
import { ffprobeNextTo, findFfmpeg, probeExport } from "./ffmpeg.ts";
import { buildFilmServer } from "./film-server.ts";
import { createFilm, type Film } from "./films.ts";
import { pickEncoder, planChunks, Renderer, workerCount } from "./renderer.ts";
import { listRenders } from "./renders.ts";

describe("planning", () => {
  it("splits frames into chunks of about 4 seconds", () => {
    expect(planChunks(300, 30)).toEqual([
      { index: 0, from: 0, to: 120 },
      { index: 1, from: 120, to: 240 },
      { index: 2, from: 240, to: 300 },
    ]);
    expect(planChunks(1, 30)).toEqual([{ index: 0, from: 0, to: 1 }]);
    // 29.97 fps: chunks of 120 frames, every frame covered once.
    const chunks = planChunks(150, 29.97);
    expect(chunks.at(-1)?.to).toBe(150);
    expect(chunks.reduce((sum, chunk) => sum + chunk.to - chunk.from, 0)).toBe(150);
  });

  it("uses about one worker per three cores, between 1 and 4", () => {
    expect(workerCount(1)).toBe(1);
    expect(workerCount(6)).toBe(2);
    expect(workerCount(12)).toBe(4);
    expect(workerCount(64)).toBe(4);
  });

  it("picks the graphics card when asked and one works", () => {
    const info: ExportInfo = {
      ffmpeg: { path: "ffmpeg", version: "9" },
      encoders: [
        { id: "h264_nvenc", name: "NVIDIA", gpu: true },
        { id: "libx264", name: "CPU", gpu: false },
      ],
    };
    expect(pickEncoder(info, true)).toBe("h264_nvenc");
    expect(pickEncoder(info, false)).toBe("libx264");
    expect(pickEncoder({ ...info, encoders: [] }, true)).toBeNull();
  });
});

const browser = findBrowser();
const ffmpeg = findFfmpeg();
const run = promisify(execFile);

describe.runIf(browser && ffmpeg)("Renderer (real browser and ffmpeg)", () => {
  const port = 7391;
  let filmsDir: string;
  let filmServer: FastifyInstance;
  let info: ExportInfo;
  const events = new EventBus();
  const seen: HubEvent[] = [];
  events.subscribe((event) => seen.push(event));

  beforeAll(async () => {
    filmsDir = await mkdtemp(join(tmpdir(), "kairos-render-"));
    const templateDir = fileURLToPath(new URL("../../templates/starter/", import.meta.url));
    await createFilm(filmsDir, templateDir, { title: "Render Test", shape: "wide", fps: 30 });
    // Small and short, so the test is quick: 320×180, 2 s (60 frames).
    const dir = join(filmsDir, "render-test");
    await writeFile(
      join(dir, "kairos.json"),
      JSON.stringify({ title: "Render Test", width: 320, height: 180, fps: 30, duration: 2 }),
    );
    filmServer = await buildFilmServer({ filmsDir: () => filmsDir, port, parentOrigins: [] });
    await filmServer.listen({ host: "127.0.0.1", port });
    info = await probeExport(ffmpeg);
  }, 60_000);

  afterAll(async () => {
    await filmServer?.close();
    await rm(filmsDir, { recursive: true, force: true });
  });

  const makeRenderer = () =>
    new Renderer({
      studio: {
        filmsDir,
        previewPath: (film: Film) => `/${film.id}/index.html`,
        events,
      },
      browser,
      filmServerUrl: `http://127.0.0.1:${port}`,
      exportInfo: async () => info,
      workers: 2,
      chunkSeconds: 0.5,
    });

  const waitFor = async (renderer: Renderer, id: string) => {
    for (let i = 0; i < 600; i++) {
      const job = renderer.jobs().find((entry) => entry.id === id);
      if (job?.endedAt) return job;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("render did not end");
  };

  it("makes an MP4 with every frame, at the film's size and rate", async () => {
    const renderer = makeRenderer();
    const started = await renderer.start("render-test", { quality: "small", gpu: false });
    const job = await waitFor(renderer, started.id);
    expect(job.error).toBeNull();
    expect(job.state).toBe("done");
    expect(job.done).toBe(60);
    expect(job.version).toBe(1);

    const [video] = await listRenders(join(filmsDir, "render-test"));
    expect(video).toMatchObject({ version: 1, file: "renders/render-test-v1.mp4", frames: 60 });
    const probe = await run(ffprobeNextTo(ffmpeg ?? ""), [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate,nb_read_frames,codec_name,pix_fmt",
      "-of",
      "json",
      join(filmsDir, "render-test", "renders", "render-test-v1.mp4"),
    ]);
    expect(JSON.parse(probe.stdout).streams[0]).toMatchObject({
      codec_name: "h264",
      width: 320,
      height: 180,
      r_frame_rate: "30/1",
      nb_read_frames: "60",
      pix_fmt: "yuv420p",
    });
    // The temporary chunks are gone.
    expect(await readdir(join(filmsDir, "render-test", "renders"))).toEqual(["render-test-v1.mp4"]);
    expect(seen.some((event) => event.type === "renders-changed")).toBe(true);
  }, 120_000);

  it("mixes the sound tracks into the video, as long as the film", async () => {
    const templateDir = fileURLToPath(new URL("../../templates/starter/", import.meta.url));
    await createFilm(filmsDir, templateDir, { title: "Sound Test", shape: "wide" });
    const dir = join(filmsDir, "sound-test");
    // Two tones: a short one from the start, a longer one from 0.5 s (cut at the film's end).
    const tone = (file: string, hz: number, seconds: number) =>
      run(ffmpeg ?? "", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${hz}:duration=${seconds}`,
        join(dir, file),
      ]);
    await tone("low.wav", 220, 1);
    await tone("high.wav", 880, 3);
    await writeFile(
      join(dir, "kairos.json"),
      JSON.stringify({
        title: "Sound Test",
        width: 320,
        height: 180,
        fps: 30,
        duration: 2,
        audio: [
          { file: "low.wav", volume: 0.5 },
          { file: "high.wav", start: 0.5 },
        ],
      }),
    );
    const renderer = makeRenderer();
    const job = await waitFor(
      renderer,
      (await renderer.start("sound-test", { quality: "small", gpu: false })).id,
    );
    expect(job.error).toBeNull();

    const probe = await run(ffprobeNextTo(ffmpeg ?? ""), [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,sample_rate,duration",
      "-of",
      "json",
      join(dir, "renders", "sound-test-v1.mp4"),
    ]);
    const streams = JSON.parse(probe.stdout).streams as {
      codec_type: string;
      codec_name: string;
      sample_rate?: string;
      duration: string;
    }[];
    const audio = streams.find((stream) => stream.codec_type === "audio");
    expect(streams.map((stream) => stream.codec_type).sort()).toEqual(["audio", "video"]);
    expect(audio).toMatchObject({ codec_name: "aac", sample_rate: "48000" });
    expect(Number(audio?.duration)).toBeGreaterThan(1.9);
    expect(Number(audio?.duration)).toBeLessThan(2.1);
  }, 120_000);

  it("reports the frame where the film breaks", async () => {
    const dir = join(filmsDir, "render-test");
    await writeFile(
      join(dir, "film.js"),
      "window.renderOut = (t) => { if (t > 1) throw new Error('boom'); };",
    );
    const renderer = makeRenderer();
    const started = await renderer.start("render-test", { quality: "small", gpu: false });
    const job = await waitFor(renderer, started.id);
    expect(job.state).toBe("failed");
    // Workers run in parallel, so the first broken frame found can be any frame after 1 s.
    expect(job.error).toMatch(/^The film could not draw frame \d+ \(1\.\d+ s\): .*boom/);
    expect(await readdir(join(dir, "renders"))).toEqual(["render-test-v1.mp4"]);
  }, 120_000);
});
