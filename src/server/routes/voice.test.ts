import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FilmSummary, VoiceLine, VoiceStatus } from "../../shared/types.ts";
import { FAKE_FISH_KEY, type FakeFish, startFakeFish } from "../fake-fish.ts";
import { Studio } from "../studio.ts";
import { acceptUploads } from "../uploads.ts";
import { filmRoutes } from "./films.ts";
import { soundRoutes } from "./sounds.ts";
import { voiceRoutes } from "./voice.ts";

const templatesDir = fileURLToPath(new URL("../../../templates/", import.meta.url));

let fake: FakeFish;
let root: string;
let studio: Studio;
let app: FastifyInstance;

beforeAll(async () => {
  fake = await startFakeFish();
});
afterAll(() => fake.close());

beforeEach(async () => {
  delete process.env.FISH_AUDIO_API_KEY;
  root = await mkdtemp(join(tmpdir(), "kairos-voice-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir });
  await studio.setWorkspace(join(root, "ws"));
  app = Fastify();
  acceptUploads(app);
  filmRoutes(app, studio);
  soundRoutes(app, studio);
  voiceRoutes(app, studio, { fishUrl: fake.url });
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

const json = (method: "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, payload });
const filmDir = () => join(root, "ws", "films", "intro");
const film = async () => (await app.inject("/api/films/intro")).json() as FilmSummary;
const setKey = () => json("PUT", "/api/voice/key", { key: FAKE_FISH_KEY });
const setNarrator = () =>
  json("PUT", "/api/films/intro/voices", { narrator: { id: "voice-calm", name: "Calm Narrator" } });

describe("the fish.audio key", () => {
  it("saves only a key fish.audio accepts, and never shows it", async () => {
    const before = (await app.inject("/api/voice/status")).json() as VoiceStatus;
    expect(before).toMatchObject({ key: null, hint: null, model: "s2.1-pro-free" });

    const wrong = await json("PUT", "/api/voice/key", { key: "wrong-key-0000" });
    expect(wrong.statusCode).toBe(502);
    expect(wrong.json().message).toContain("didn't accept this key");

    const saved = await setKey();
    expect(saved.json()).toMatchObject({ key: "settings", hint: "…1234" });
    expect(saved.body).not.toContain(FAKE_FISH_KEY);
    expect(await readFile(join(root, "home", ".env"), "utf8")).toBe(
      `FISH_AUDIO_API_KEY=${FAKE_FISH_KEY}\n`,
    );
    expect((await json("POST", "/api/voice/check")).json()).toEqual({ ok: true });

    const model = await json("PUT", "/api/voice/model", { model: "s2.1-pro" });
    expect(model.json().model).toBe("s2.1-pro");
    expect((await json("DELETE", "/api/voice/key")).json()).toMatchObject({ key: null });
    expect((await json("POST", "/api/voice/check")).json().message).toContain(
      "Add your fish.audio key",
    );
  });

  it("searches the voice library", async () => {
    await setKey();
    const voices = (await app.inject("/api/voice/library?query=calm")).json();
    expect(voices.map((v: { id: string }) => v.id)).toEqual(["voice-calm"]);
  });
});

describe("lines", () => {
  it("needs a voice for the speaker, then makes lines and places them back-to-back", async () => {
    await setKey();
    const none = await json("POST", "/api/films/intro/lines", { lines: ["Hello there"] });
    expect(none.json().message).toContain('Choose a voice for "narrator" first');

    await setNarrator();
    const made = await json("POST", "/api/films/intro/lines", {
      lines: ["Once upon a time", "the end"],
      start: 2,
      gap: 0.5,
    });
    expect(made.statusCode).toBe(201);
    const { lines, placed } = made.json() as { lines: VoiceLine[]; placed: { start: number }[] };
    expect(lines.map((l) => l.file)).toEqual(["voice/narrator-1.mp3", "voice/narrator-2.mp3"]);
    // "Once upon a time": 2 words per chunk, the second chunk at 1.5 s.
    expect(lines[0]?.words.map((w) => w.start)).toEqual([0, 0.4, 1.5, 1.9]);
    expect(placed.map((p) => p.start)).toEqual([2, 2 + (lines[0]?.duration ?? 0) + 0.5]);
    expect(await readFile(join(filmDir(), "voice", "narrator-1.mp3"), "utf8")).toContain(
      "audio-0-a",
    );
    const words = JSON.parse(
      await readFile(join(filmDir(), "voice", "narrator-1.words.json"), "utf8"),
    );
    expect(words).toMatchObject({ text: "Once upon a time", source: "speech" });
    expect((await film()).config?.audio.map((t) => [t.file, t.lane])).toEqual([
      ["voice/narrator-1.mp3", 0],
      ["voice/narrator-2.mp3", 0],
    ]);
    // Remembered as a recent voice.
    expect(((await app.inject("/api/voice/status")).json() as VoiceStatus).recent[0]?.id).toBe(
      "voice-calm",
    );
  });

  it("reuses a line asked for again (not paid twice), and deletes lines with their clips", async () => {
    await setKey();
    await setNarrator();
    await json("POST", "/api/films/intro/lines", { lines: ["Same words"], start: 0 });
    const calls = fake.speechCalls();
    const again = await json("POST", "/api/films/intro/lines", { lines: ["Same words"] });
    expect(fake.speechCalls()).toBe(calls);
    const [line] = again.json().lines as VoiceLine[];
    expect(line?.file).toBe("voice/narrator-1.mp3");

    expect((await app.inject("/api/films/intro/lines")).json()).toHaveLength(1);
    const gone = await json("DELETE", `/api/films/intro/lines/${line?.id}`);
    expect(gone.statusCode).toBe(204);
    await expect(stat(join(filmDir(), "voice", "narrator-1.mp3"))).rejects.toThrow();
    await expect(stat(join(filmDir(), "voice", "narrator-1.words.json"))).rejects.toThrow();
    expect((await film()).config?.audio).toEqual([]);
  });

  it("gives a new take a new file name, never reusing one", async () => {
    await setKey();
    await setNarrator();
    const first = (await json("POST", "/api/films/intro/lines", { lines: ["Take one"] })).json();
    await json("DELETE", `/api/films/intro/lines/${first.lines[0].id}`);
    const again = (await json("POST", "/api/films/intro/lines", { lines: ["Take one"] })).json();
    expect(again.lines[0].file).toBe("voice/narrator-2.mp3");
    // A file already in voice/ is never overwritten.
    await writeFile(join(filmDir(), "voice", "narrator-3.mp3"), "mine");
    const third = (await json("POST", "/api/films/intro/lines", { lines: ["Another"] })).json();
    expect(third.lines[0].file).toBe("voice/narrator-4.mp3");
    expect(await readFile(join(filmDir(), "voice", "narrator-3.mp3"), "utf8")).toBe("mine");
  });

  it("says plainly when fish.audio refuses", async () => {
    await setKey();
    await setNarrator();
    const refused = await json("POST", "/api/films/intro/lines", { lines: ["no credit here"] });
    expect(refused.statusCode).toBe(502);
    expect(refused.json().message).toContain("no credit");
  });
});

describe("word timings for any sound", () => {
  it("transcribes a recording once and keeps the timings next to it", async () => {
    await setKey();
    await app.inject({
      method: "POST",
      url: "/api/films/intro/sounds?name=take.mp3",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("fake recording"),
    });
    expect((await app.inject("/api/films/intro/words?file=audio/take.mp3")).statusCode).toBe(404);
    const heard = await json("POST", "/api/films/intro/words", { file: "audio/take.mp3" });
    expect(heard.json()).toMatchObject({ text: "hello from a recording", source: "transcript" });
    expect(
      (await app.inject("/api/films/intro/words?file=audio/take.mp3")).json().words,
    ).toHaveLength(4);
    expect((await json("POST", "/api/films/intro/words", { file: "kairos.json" })).statusCode).toBe(
      400,
    );
  });
});
