import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset, FilmSummary } from "../../shared/types.ts";
import { Studio } from "../studio.ts";
import { acceptUploads } from "../uploads.ts";
import { assetRoutes } from "./assets.ts";
import { filmRoutes } from "./films.ts";
import { soundRoutes } from "./sounds.ts";

const templatesDir = fileURLToPath(new URL("../../../templates/", import.meta.url));

let root: string;
let studio: Studio;
let app: FastifyInstance;
let opened: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-media-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir });
  await studio.setWorkspace(join(root, "ws"));
  opened = [];
  app = Fastify();
  acceptUploads(app);
  filmRoutes(app, studio);
  assetRoutes(app, studio, { open: (path) => opened.push(path) });
  soundRoutes(app, studio);
  await app.inject({
    method: "POST",
    url: "/api/films",
    payload: { title: "Intro", shape: "wide" },
  });
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const upload = (url: string, bytes = "RIFF....fake sound") =>
  app.inject({
    method: "POST",
    url,
    headers: { "content-type": "application/octet-stream" },
    payload: Buffer.from(bytes),
  });
const film = async () => (await app.inject("/api/films/intro")).json() as FilmSummary;
const filmDir = () => join(root, "ws", "films", "intro");

describe("sounds", () => {
  it("adds an uploaded sound as a track at the given time", async () => {
    const answer = await upload("/api/films/intro/sounds?name=My%20Rain.MP3&start=2.5");
    expect(answer.statusCode).toBe(201);
    expect(answer.json().track).toMatchObject({ file: "audio/my-rain.mp3", start: 2.5, volume: 1 });
    expect(await readFile(join(filmDir(), "audio", "my-rain.mp3"), "utf8")).toBe(
      "RIFF....fake sound",
    );
    expect((await film()).config?.audio).toMatchObject([
      { file: "audio/my-rain.mp3", start: 2.5, volume: 1 },
    ]);
    // Other kairos.json fields are kept, and the track is written short (no default values).
    const config = JSON.parse(await readFile(join(filmDir(), "kairos.json"), "utf8"));
    expect(config.title).toBe("Intro");
    expect(config.audio).toEqual([{ file: "audio/my-rain.mp3", start: 2.5, volume: 1, lane: 0 }]);
    // The next sound gets the next timeline track, unless it was dropped on one.
    await upload("/api/films/intro/sounds?name=b.mp3");
    await upload("/api/films/intro/sounds?name=c.mp3&lane=0&start=8");
    expect(
      (await film()).config?.audio.map((track) => [track.file, track.lane, track.start]),
    ).toEqual([
      ["audio/my-rain.mp3", 0, 2.5],
      ["audio/b.mp3", 1, 0],
      ["audio/c.mp3", 0, 8],
    ]);

    // The app reads the sound back for the timeline's waveform; nothing else in the film.
    const file = await app.inject("/api/films/intro/sounds/file?path=audio/my-rain.mp3");
    expect(file.headers["content-type"]).toBe("audio/mpeg");
    expect(file.body).toBe("RIFF....fake sound");
    expect((await app.inject("/api/films/intro/sounds/file?path=kairos.json")).statusCode).toBe(
      404,
    );
    expect((await app.inject("/api/films/intro/sounds/file?path=../../x.mp3")).statusCode).toBe(
      404,
    );

    const wrong = await upload("/api/films/intro/sounds?name=clip.mp4");
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().message).toBe("Kairos can't use this kind of file here. Add a sound file.");
  });

  it("changes the whole list, but only with files inside the film", async () => {
    await upload("/api/films/intro/sounds?name=a.mp3");
    const put = (audio: object[]) =>
      app.inject({ method: "PUT", url: "/api/films/intro/audio", payload: { audio } });
    const changed = await put([{ file: "audio/a.mp3", start: 1, volume: 0.5 }]);
    expect(changed.statusCode).toBe(200);
    expect((await film()).config?.audio).toMatchObject([
      { file: "audio/a.mp3", start: 1, volume: 0.5 },
    ]);
    // The timeline fields are kept.
    await put([{ file: "audio/a.mp3", start: 1, from: 0.5, length: 2, lane: 1, muted: true }]);
    expect((await film()).config?.audio).toEqual([
      { file: "audio/a.mp3", start: 1, volume: 1, from: 0.5, length: 2, lane: 1, muted: true },
    ]);
    expect((await put([])).statusCode).toBe(200);
    expect((await film()).config?.audio).toEqual([]);

    const outside = await put([{ file: "../../secret.mp3" }]);
    expect(outside.statusCode).toBe(400);
    expect(outside.json().message).toContain("isn't in this film's folder");
    expect((await put([{ file: "audio/a.mp3", volume: 3 }])).statusCode).toBe(400);
  });
});

describe("sheets", () => {
  it("knows which films have sheets (a Blocky template's sheet.html)", async () => {
    expect((await film()).hasSheets).toBe(false);
    const made = await app.inject({
      method: "POST",
      url: "/api/films",
      payload: {
        title: "Toy",
        shape: "wide",
        template: "blocky",
        brief: { story: "A test." },
      },
    });
    expect(made.json().hasSheets).toBe(true);
  });
});

describe("video clips", () => {
  it("puts an uploaded video or picture on the timeline, written short", async () => {
    const video = await upload("/api/films/intro/clips?name=Intro%20Clip.mp4&start=1.5");
    expect(video.statusCode).toBe(201);
    expect(video.json().clip).toMatchObject({
      file: "assets/videos/intro-clip.mp4",
      start: 1.5,
      lane: 0,
      size: 1,
      fit: "fill",
    });
    // A picture shows for 3 s at first; dropped on a track, it goes there.
    await upload("/api/films/intro/clips?name=logo.png&start=0&lane=0");
    const config = JSON.parse(await readFile(join(filmDir(), "kairos.json"), "utf8"));
    expect(config.video).toEqual([
      { file: "assets/videos/intro-clip.mp4", start: 1.5, lane: 0 },
      { file: "assets/images/logo.png", start: 0, lane: 0, length: 3 },
    ]);
    // Only videos and pictures.
    expect((await upload("/api/films/intro/clips?name=a.mp3")).statusCode).toBe(400);
  });

  it("saves sound tracks and clips together, only with files inside the film", async () => {
    await upload("/api/films/intro/clips?name=logo.png");
    await upload("/api/films/intro/sounds?name=rain.mp3");
    const { audio, video } = (await film()).config ?? { audio: [], video: [] };
    const saved = await app.inject({
      method: "PUT",
      url: "/api/films/intro/tracks",
      payload: {
        audio: audio.map((track) => ({ ...track, start: 2 })),
        video: video.map((clip) => ({ ...clip, size: 0.25, x: 0.8, y: 0.2, opacity: 0.5 })),
      },
    });
    expect(saved.statusCode).toBe(200);
    expect((await film()).config?.audio[0]?.start).toBe(2);
    expect((await film()).config?.video[0]).toMatchObject({ size: 0.25, opacity: 0.5 });
    const outside = await app.inject({
      method: "PUT",
      url: "/api/films/intro/tracks",
      payload: { audio, video: [{ file: "../secret.png", start: 0 }] },
    });
    expect(outside.statusCode).toBe(400);
    expect(outside.json().message).toContain("isn't in this film's folder");
  });

  it("reports a missing clip file as the film's problem", async () => {
    await upload("/api/films/intro/clips?name=logo.png");
    await rm(join(filmDir(), "assets", "images", "logo.png"));
    expect((await film()).problem).toBe('The video clip "assets/images/logo.png" is missing.');
  });

  it("puts a library video on the timeline from a time", async () => {
    await upload("/api/assets?name=wave.mp4");
    const added = await app.inject({
      method: "POST",
      url: "/api/films/intro/clips/from-asset",
      payload: { asset: "videos/wave.mp4", start: 4 },
    });
    expect(added.statusCode).toBe(201);
    expect((await film()).config?.video).toMatchObject([
      { file: "assets/videos/wave.mp4", start: 4 },
    ]);
    // Through "use" (Claude's kairos_use_asset) with a start, too.
    await app.inject({
      method: "POST",
      url: "/api/assets/videos/wave.mp4/use",
      payload: { film: "intro", start: 1 },
    });
    expect((await film()).config?.video.map((clip) => clip.start)).toEqual([4, 1]);
  });
});

describe("assets", () => {
  it("imports files into the folder of their kind and lists them", async () => {
    const song = await upload("/api/assets?name=Theme.mp3");
    expect(song.statusCode).toBe(201);
    expect(song.json()).toMatchObject({ id: "sounds/theme.mp3", kind: "sound", name: "theme.mp3" });
    await upload("/api/assets?name=logo.png", "png bytes");
    const list = (await app.inject("/api/assets")).json() as Asset[];
    expect(list.map((asset) => asset.id).sort()).toEqual(["images/logo.png", "sounds/theme.mp3"]);
    expect((await upload("/api/assets?name=notes.txt")).statusCode).toBe(400);

    const file = await app.inject("/api/assets/images/logo.png/file");
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.body).toBe("png bytes");
    expect((await app.inject("/api/assets/images/..%2Fsecret.png/file")).statusCode).toBe(404);
    expect((await app.inject("/api/assets/sounds/logo.png/file")).statusCode).toBe(404);
  });

  it("copies an asset into a film; a sound becomes a track", async () => {
    await upload("/api/assets?name=theme.mp3");
    await upload("/api/assets?name=logo.png", "png bytes");
    const use = (id: string, body: object) =>
      app.inject({ method: "POST", url: `/api/assets/${id}/use`, payload: body });

    const picture = await use("images/logo.png", { film: "intro" });
    expect(picture.json()).toEqual({ path: "assets/images/logo.png" });
    expect(await readFile(join(filmDir(), "assets", "images", "logo.png"), "utf8")).toBe(
      "png bytes",
    );
    // Used twice: the same file, not a copy.
    expect((await use("images/logo.png", { film: "intro" })).json()).toEqual({
      path: "assets/images/logo.png",
    });

    const sound = await use("sounds/theme.mp3", { film: "intro", start: 3 });
    expect(sound.json()).toEqual({ path: "audio/theme.mp3" });
    expect((await film()).config?.audio).toMatchObject([
      { file: "audio/theme.mp3", start: 3, volume: 1 },
    ]);
    expect((await use("sounds/theme.mp3", { film: "nope" })).statusCode).toBe(404);
  });

  it("saves a picture, video or font straight into a film", async () => {
    const saved = await upload("/api/films/intro/files?name=Logo%20Big.PNG", "png bytes");
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toEqual({ path: "assets/images/logo-big.png" });
    expect(await readFile(join(filmDir(), "assets", "images", "logo-big.png"), "utf8")).toBe(
      "png bytes",
    );
    expect((await upload("/api/films/intro/files?name=title.woff2")).json()).toEqual({
      path: "assets/fonts/title.woff2",
    });
    // Sounds go through the Sound panel instead.
    expect((await upload("/api/films/intro/files?name=a.mp3")).statusCode).toBe(400);
    expect((await upload("/api/films/nope/files?name=a.png")).statusCode).toBe(404);
  });

  it("deletes assets and opens the library folder", async () => {
    await upload("/api/assets?name=theme.mp3");
    const deleted = await app.inject({ method: "DELETE", url: "/api/assets/sounds/theme.mp3" });
    expect(deleted.statusCode).toBe(204);
    await expect(stat(join(root, "ws", "assets", "sounds", "theme.mp3"))).rejects.toThrow();
    expect(
      (await app.inject({ method: "DELETE", url: "/api/assets/sounds/x.exe" })).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/assets/open-folder" })).statusCode).toBe(
      204,
    );
    expect(opened).toEqual([join(root, "ws", "assets")]);
  });
});
