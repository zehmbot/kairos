import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clipBox, placeAt } from "../shared/clips.ts";
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

  it("uses about one worker per three cores, between 1 and 4, and fewer with little memory", () => {
    const plenty = 64 * 1024 ** 3;
    expect(workerCount(1, plenty)).toBe(1);
    expect(workerCount(6, plenty)).toBe(2);
    expect(workerCount(12, plenty)).toBe(4);
    expect(workerCount(64, plenty)).toBe(4);
    // A computer with 3.5 GB free gets two workers; with almost nothing free, still one.
    expect(workerCount(12, 3.5 * 1024 ** 3)).toBe(2);
    expect(workerCount(12, 0.2 * 1024 ** 3)).toBe(1);
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
/** Runs a program and keeps its output as bytes (a raw frame). */
const execBuffer = (file: string, args: string[]) =>
  new Promise<{ stdout: Buffer }>((resolve, reject) =>
    execFile(file, args, { encoding: "buffer", maxBuffer: 1 << 24 }, (error, stdout) =>
      error ? reject(error) : resolve({ stdout }),
    ),
  );

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

  it("draws video clips and pictures over the film, with a video's sound", async () => {
    const templateDir = fileURLToPath(new URL("../../templates/starter/", import.meta.url));
    await createFilm(filmsDir, templateDir, { title: "Clip Test", shape: "wide" });
    const dir = join(filmsDir, "clip-test");
    const make = (args: string[]) =>
      run(ffmpeg ?? "", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    // A red picture, and a blue video with a tone.
    await make([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x64",
      "-frames:v",
      "1",
      join(dir, "red.png"),
    ]);
    await make([
      ...["-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1:r=30"],
      ...["-f", "lavfi", "-i", "sine=frequency=440:duration=1"],
      ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"],
      join(dir, "blue.mp4"),
    ]);
    const corner = placeAt("top-right", 0.25, 320, 180);
    await writeFile(
      join(dir, "kairos.json"),
      JSON.stringify({
        title: "Clip Test",
        width: 320,
        height: 180,
        fps: 30,
        duration: 2,
        video: [
          { file: "red.png", start: 1, length: 1, size: 0.25, ...corner },
          { file: "blue.mp4", start: 0, length: 0.8, size: 0.5, x: 0.25, y: 0.75 },
        ],
      }),
    );
    const renderer = makeRenderer();
    const job = await waitFor(
      renderer,
      (await renderer.start("clip-test", { quality: "high", gpu: false })).id,
    );
    expect(job.error).toBeNull();
    const output = join(dir, "renders", "clip-test-v1.mp4");

    /** The color at (x, y) of the frame at `t`. */
    const pixel = async (t: number, x: number, y: number) => {
      const { stdout } = await execBuffer(ffmpeg ?? "", [
        ...["-v", "error", "-ss", String(t), "-i", output, "-frames:v", "1"],
        ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      ]);
      const at = (y * 320 + x) * 3;
      return [stdout[at] ?? 0, stdout[at + 1] ?? 0, stdout[at + 2] ?? 0];
    };
    const red = ([r, g, b]: number[]) => (r ?? 0) > 180 && (g ?? 0) < 90 && (b ?? 0) < 90;
    const blue = ([r, g, b]: number[]) => (b ?? 0) > 180 && (r ?? 0) < 90 && (g ?? 0) < 90;
    const box = clipBox({ size: 0.25, ...corner }, 320, 180);
    const cx = Math.round(box.left + box.width / 2);
    const cy = Math.round(box.top + box.height / 2);
    // The picture shows in the top-right corner from 1 s only; the video in the bottom-left until 0.8 s.
    expect(red(await pixel(1.5, cx, cy))).toBe(true);
    expect(red(await pixel(0.5, cx, cy))).toBe(false);
    expect(blue(await pixel(0.4, 80, 135))).toBe(true);
    expect(blue(await pixel(1.2, 80, 135))).toBe(false);
    // Outside the clips, the film shows.
    expect(red(await pixel(1.5, 10, 170))).toBe(false);

    // The video's sound is in the mix, though the film has no sound tracks.
    const probe = await run(ffprobeNextTo(ffmpeg ?? ""), [
      ...["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", output],
    ]);
    const types = (JSON.parse(probe.stdout).streams as { codec_type: string }[]).map(
      (stream) => stream.codec_type,
    );
    expect(types.sort()).toEqual(["audio", "video"]);
  }, 120_000);

  it("goes out in another shape: drawn at that size by a film that reframes, else fitted in", async () => {
    // A green film that draws at the size it's asked (window.__kairos.size), saying so or not.
    const page = (reshape: boolean) => `<!doctype html>
<html><body style="margin:0;background:#000"><canvas id="c" style="display:block"></canvas><script>
  const size = window.__kairos?.size ?? { width: 320, height: 180 };
  const canvas = document.getElementById("c");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  window.KAIROS_RESHAPE = ${reshape};
  window.renderOut = () => { ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, size.width, size.height); };
</script></body></html>`;
    for (const [id, reshape] of [
      ["reframes", true],
      ["fits", false],
    ] as const) {
      const dir = join(filmsDir, id);
      await mkdir(dir, { recursive: true });
      const config = { title: id, width: 320, height: 180, fps: 30, duration: 0.5 };
      await writeFile(join(dir, "kairos.json"), JSON.stringify(config));
      await writeFile(join(dir, "index.html"), page(reshape));
    }
    const renderer = makeRenderer();
    const render = async (id: string, shape: "wide" | "tall", fit: "bars" | "crop" = "bars") => {
      const started = await renderer.start(id, { quality: "small", gpu: false, shape, fit });
      const job = await waitFor(renderer, started.id);
      expect(job.error).toBeNull();
      const [video] = await listRenders(join(filmsDir, id));
      if (!video) throw new Error("no video");
      return video;
    };
    /** The color at (x, y) of a video's frame at 0.2 s. */
    const pixel = async (id: string, file: string, width: number, x: number, y: number) => {
      const { stdout } = await execBuffer(ffmpeg ?? "", [
        ...["-v", "error", "-ss", "0.2", "-i", join(filmsDir, id, file), "-frames:v", "1"],
        ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      ]);
      const at = (y * width + x) * 3;
      return [stdout[at] ?? 0, stdout[at + 1] ?? 0, stdout[at + 2] ?? 0];
    };
    const green = ([r, g, b]: number[]) => (g ?? 0) > 180 && (r ?? 0) < 90 && (b ?? 0) < 90;
    const black = (color: number[]) => color.every((value) => value < 40);

    // The film that reframes is drawn tall: green to the top.
    const reframed = await render("reframes", "tall");
    expect(reframed).toMatchObject({
      file: "renders/reframes-v1-tall.mp4",
      width: 1080,
      height: 1920,
      shape: "tall",
      fit: "reframe",
    });
    expect(green(await pixel("reframes", reframed.file, 1080, 540, 20))).toBe(true);

    // The other one gets bars above and below, or is cropped to fill the frame.
    const bars = await render("fits", "tall");
    expect(bars).toMatchObject({ width: 1080, height: 1920, shape: "tall", fit: "bars" });
    expect(black(await pixel("fits", bars.file, 1080, 540, 20))).toBe(true);
    expect(green(await pixel("fits", bars.file, 1080, 540, 960))).toBe(true);
    const crop = await render("fits", "tall", "crop");
    expect(crop).toMatchObject({ file: "renders/fits-v2-tall.mp4", fit: "crop" });
    expect(green(await pixel("fits", crop.file, 1080, 540, 20))).toBe(true);

    // Its own shape: its own size, and no shape in the name.
    expect(await render("fits", "wide")).toMatchObject({
      file: "renders/fits-v3.mp4",
      width: 320,
      height: 180,
      shape: "wide",
      fit: "own",
    });
  }, 180_000);

  it("writes subtitles next to the video: the captions the film gives, else what its voices say", async () => {
    // A film that gives its captions, and draws red when asked to leave them out (green otherwise).
    const captioned = join(filmsDir, "captioned");
    await mkdir(captioned, { recursive: true });
    const config = { width: 320, height: 180, fps: 30, duration: 1 };
    await writeFile(join(captioned, "kairos.json"), JSON.stringify({ title: "C", ...config }));
    await writeFile(
      join(captioned, "index.html"),
      `<!doctype html><html><body style="margin:0"><canvas id="c" width="320" height="180"></canvas><script>
  const ctx = document.getElementById("c").getContext("2d");
  window.KAIROS_CAPTIONS = [
    { text: "Hello", start: 0.1, end: 0.3 },
    { text: "there.", start: 0.3, end: 0.45 },
  ];
  window.renderOut = () => {
    ctx.fillStyle = window.__kairos.captions ? "#00ff00" : "#ff0000";
    ctx.fillRect(0, 0, 320, 180);
  };
</script></body></html>`,
    );
    // A film with a voice clip whose words are timed, placed at 0.2 s.
    const voiced = join(filmsDir, "voiced");
    await mkdir(join(voiced, "voice"), { recursive: true });
    await run(ffmpeg ?? "", [
      ...["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi"],
      ...["-i", "anullsrc=r=44100:cl=mono", "-t", "1", join(voiced, "voice", "narrator-1.wav")],
    ]);
    await writeFile(
      join(voiced, "voice", "narrator-1.words.json"),
      JSON.stringify({
        version: 1,
        text: "Hi friend.",
        duration: 1,
        source: "speech",
        words: [
          { text: "Hi", start: 0.1, end: 0.3 },
          { text: "friend.", start: 0.35, end: 0.7 },
        ],
      }),
    );
    await writeFile(
      join(voiced, "kairos.json"),
      JSON.stringify({
        title: "V",
        ...config,
        audio: [{ file: "voice/narrator-1.wav", start: 0.2 }],
      }),
    );
    await writeFile(
      join(voiced, "index.html"),
      "<!doctype html><script>window.renderOut = () => {};</script>",
    );

    const renderer = makeRenderer();
    const render = async (id: string, options: { subtitles: boolean; captions?: boolean }) => {
      const started = await renderer.start(id, { quality: "small", gpu: false, ...options });
      const job = await waitFor(renderer, started.id);
      expect(job.error).toBeNull();
      const [video] = await listRenders(join(filmsDir, id));
      if (!video) throw new Error("no video");
      return video;
    };

    const left = await render("captioned", { subtitles: true, captions: false });
    expect(left).toMatchObject({ subtitles: "renders/captioned-v1.srt", captions: false });
    expect(await readFile(join(captioned, "renders", "captioned-v1.srt"), "utf8")).toBe(
      "1\r\n00:00:00,100 --> 00:00:00,900\r\nHello there.\r\n",
    );
    // The page was asked to leave its captions out: it drew red.
    const { stdout } = await execBuffer(ffmpeg ?? "", [
      ...["-v", "error", "-ss", "0.5", "-i", join(captioned, left.file), "-frames:v", "1"],
      ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    ]);
    expect(stdout[0] ?? 0).toBeGreaterThan(180);
    expect(stdout[1] ?? 255).toBeLessThan(90);

    const spoken = await render("voiced", { subtitles: true });
    expect(spoken.subtitles).toBe("renders/voiced-v1.srt");
    expect(spoken.captions).toBeUndefined();
    expect(await readFile(join(voiced, "renders", "voiced-v1.srt"), "utf8")).toBe(
      "1\r\n00:00:00,300 --> 00:00:01,200\r\nHi friend.\r\n",
    );
    // Without subtitles asked for, none.
    expect((await render("voiced", { subtitles: false })).subtitles).toBeUndefined();
  }, 180_000);

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
