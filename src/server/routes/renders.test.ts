import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExportInfo, FilmShape, RenderJob, RendersOverview } from "../../shared/types.ts";
import { createFilm } from "../films.ts";
import { RenderError } from "../renderer.ts";
import { addRender } from "../renders.ts";
import { Studio } from "../studio.ts";
import { renderRoutes } from "./renders.ts";

const templateDir = fileURLToPath(new URL("../../../templates/starter/", import.meta.url));
const VIDEO = Buffer.from("0123456789abcdefghij"); // 20 bytes, enough to test ranges

let root: string;
let studio: Studio;
let app: FastifyInstance;
let jobs: RenderJob[];
let refuse: string | null;
let opened: string[];

const info: ExportInfo = {
  ffmpeg: { path: "ffmpeg", version: "9.0.2" },
  encoders: [{ id: "libx264", name: "CPU (x264)", gpu: false }],
};

const fakeRenderer = {
  jobs: () => jobs,
  start: async (
    filmId: string,
    input: { quality: "high" | "small"; gpu: boolean; shape?: FilmShape; fit?: "bars" | "crop" },
  ) => {
    if (refuse) throw new RenderError(refuse);
    const job: RenderJob = {
      id: `r_${jobs.length + 1}`,
      filmId,
      title: filmId,
      state: "queued",
      quality: input.quality,
      encoder: input.gpu ? "h264_nvenc" : "libx264",
      gpu: input.gpu,
      shape: input.shape ?? null,
      fit: input.fit ?? "bars",
      done: 0,
      total: 150,
      queuedAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      error: null,
      version: null,
    };
    jobs.push(job);
    return job;
  },
  cancel: (id: string) => jobs.some((job) => job.id === id),
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-render-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir: join(templateDir, "..") });
  await studio.setWorkspace(join(root, "ws"));
  await createFilm(studio.filmsDir ?? "", templateDir, { title: "Intro", shape: "wide" });
  const filmDir = join(root, "ws", "films", "intro");
  await mkdir(join(filmDir, "renders"));
  await writeFile(join(filmDir, "renders", "intro-v1.mp4"), VIDEO);
  await addRender(filmDir, {
    version: 1,
    file: "renders/intro-v1.mp4",
    createdAt: "2026-11-19T10:00:00.000Z",
    quality: "high",
    encoder: "libx264",
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 5,
    frames: 150,
    bytes: VIDEO.length,
    seconds: 4,
  });
  jobs = [];
  refuse = null;
  opened = [];
  app = Fastify();
  renderRoutes(app, {
    studio,
    renderer: fakeRenderer,
    exportInfo: async () => info,
    open: (path) => opened.push(path),
  });
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe("render routes", () => {
  it("reports the export tools, jobs and videos", async () => {
    expect((await app.inject("/api/export")).json()).toEqual(info);
    const overview = (await app.inject("/api/renders")).json() as RendersOverview;
    expect(overview.jobs).toEqual([]);
    expect(overview.videos).toEqual([
      expect.objectContaining({ filmId: "intro", title: "Intro", version: 1 }),
    ]);
  });

  it("starts and cancels renders", async () => {
    const started = await app.inject({
      method: "POST",
      url: "/api/films/intro/renders",
      payload: { quality: "small", gpu: false },
    });
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({ filmId: "intro", quality: "small", encoder: "libx264" });
    // Defaults: high quality, graphics card when there is one.
    const defaults = await app.inject({ method: "POST", url: "/api/films/intro/renders" });
    expect(defaults.json()).toMatchObject({ quality: "high", encoder: "h264_nvenc", shape: null });
    // For another shape, fitted in or cropped; a shape that isn't one is refused.
    const tall = await app.inject({
      method: "POST",
      url: "/api/films/intro/renders",
      payload: { shape: "tall", fit: "crop" },
    });
    expect(tall.json()).toMatchObject({ shape: "tall", fit: "crop" });
    const round = await app.inject({
      method: "POST",
      url: "/api/films/intro/renders",
      payload: { shape: "round" },
    });
    expect(round.statusCode).toBe(400);

    expect((await app.inject({ method: "POST", url: "/api/renders/r_1/cancel" })).statusCode).toBe(
      204,
    );
    expect((await app.inject({ method: "POST", url: "/api/renders/nope/cancel" })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: "POST", url: "/api/films/nope/renders" })).statusCode).toBe(
      404,
    );
  });

  it("explains why a film can't render", async () => {
    refuse = "Kairos needs ffmpeg to make videos.";
    const response = await app.inject({ method: "POST", url: "/api/films/intro/renders" });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("needs ffmpeg");
  });

  it("streams a video, in parts when asked", async () => {
    const whole = await app.inject("/api/films/intro/renders/1/video");
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["content-type"]).toBe("video/mp4");
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    expect(whole.rawPayload.equals(VIDEO)).toBe(true);

    const part = await app.inject({
      url: "/api/films/intro/renders/1/video",
      headers: { range: "bytes=5-9" },
    });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 5-9/20");
    expect(part.body).toBe("56789");

    const tail = await app.inject({
      url: "/api/films/intro/renders/1/video",
      headers: { range: "bytes=-4" },
    });
    expect(tail.body).toBe("ghij");
    const outside = await app.inject({
      url: "/api/films/intro/renders/1/video",
      headers: { range: "bytes=50-" },
    });
    expect(outside.statusCode).toBe(416);
    expect((await app.inject("/api/films/intro/renders/9/video")).statusCode).toBe(404);
  });

  it("opens the folder and deletes a video", async () => {
    expect(
      (await app.inject({ method: "POST", url: "/api/films/intro/renders/1/open-folder" }))
        .statusCode,
    ).toBe(204);
    expect(opened).toEqual([join(root, "ws", "films", "intro", "renders")]);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/films/intro/renders/1" })).statusCode,
    ).toBe(204);
    expect(((await app.inject("/api/renders")).json() as RendersOverview).videos).toEqual([]);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/films/intro/renders/1" })).statusCode,
    ).toBe(404);
  });
});
