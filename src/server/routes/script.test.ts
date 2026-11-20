import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FilmSummary, HubEvent, Script, WriterState } from "../../shared/types.ts";
import { forgetPools } from "../casting.ts";
import { installFakeClaude } from "../fake-claude.ts";
import { FAKE_FISH_KEY, type FakeFish, startFakeFish } from "../fake-fish.ts";
import { Studio } from "../studio.ts";
import { Writers } from "../writer.ts";
import { filmRoutes } from "./films.ts";
import { scriptRoutes } from "./script.ts";
import { voiceRoutes } from "./voice.ts";

const templatesDir = fileURLToPath(new URL("../../../templates/", import.meta.url));

let fake: FakeFish;
let fakeClaude: string;
let claudeDir: string;
let root: string;
let studio: Studio;
let app: FastifyInstance;
let events: HubEvent[];

beforeAll(async () => {
  fake = await startFakeFish();
  claudeDir = await mkdtemp(join(tmpdir(), "kairos-fake-claude-"));
  fakeClaude = await installFakeClaude(claudeDir);
});
afterAll(async () => {
  await fake.close();
  await rm(claudeDir, { recursive: true, force: true });
});

beforeEach(async () => {
  delete process.env.FISH_AUDIO_API_KEY;
  delete process.env.FAKE_CLAUDE_MODE;
  delete process.env.FAKE_CLAUDE_ANSWER;
  process.env.FAKE_CLAUDE_LOG = join(claudeDir, "log.jsonl");
  forgetPools();
  root = await mkdtemp(join(tmpdir(), "kairos-script-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir });
  await studio.setWorkspace(join(root, "ws"));
  events = [];
  studio.events.subscribe((event) => events.push(event));
  app = Fastify();
  filmRoutes(app, studio);
  voiceRoutes(app, studio, { fishUrl: fake.url });
  const writers = new Writers({
    claudePath: () => fakeClaude,
    mcp: { node: process.execPath, script: "server.ts", hubPort: 1 },
    onChange: (id, writer) => studio.events.publish({ type: "writer-progress", id, writer }),
    limitMs: 20_000,
  });
  scriptRoutes(app, studio, writers, { fishUrl: fake.url });
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
const clips = async () => (await film()).config?.audio.map((t) => [t.file, t.start]);

/** Waits until the writer is no longer running. */
async function finished(): Promise<WriterState> {
  for (let i = 0; i < 200; i++) {
    const state = (await app.inject("/api/films/intro/script/writer")).json() as WriterState;
    if (state.state !== "running") return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the writer never finished");
}

describe("New film", () => {
  it("puts the Voices choice in the brief, even without other answers", async () => {
    await app.inject({
      method: "POST",
      url: "/api/films",
      payload: { title: "Voiced", shape: "tall", voices: "make" },
    });
    const brief = await readFile(join(root, "ws", "films", "voiced", "brief.md"), "utf8");
    expect(brief).toContain("## Voices");
    expect(brief).toContain("Make them with the film");
    // Without voices and answers, no brief at all (as before).
    await expect(stat(join(filmDir(), "brief.md"))).rejects.toThrow();
  });
});

describe("casting a film", () => {
  it("casts speakers by type without a key, and gives another voice on request", async () => {
    const cast = await json("POST", "/api/films/intro/cast", {
      speakers: [
        { speaker: "narrator", type: "narrator" },
        { speaker: "mom", type: "woman" },
      ],
    });
    expect(cast.statusCode).toBe(200);
    const { voices, problems } = cast.json();
    expect(problems).toEqual([]);
    expect(voices.mom).toMatchObject({ type: "woman", auto: true });
    expect((await film()).config?.voices?.narrator?.type).toBe("narrator");
    // Mom keeps her voice in the next films; the narrator doesn't.
    expect(Object.keys(studio.voiceSettings.remembered)).toEqual(["mom"]);

    const another = await json("POST", "/api/films/intro/cast/mom/another");
    expect(another.json().mom.id).not.toBe(voices.mom.id);
    expect(another.json().mom.type).toBe("woman");
    expect(studio.voiceSettings.remembered.mom?.id).toBe(another.json().mom.id);
  });
});

describe("the script", () => {
  const twoLines = {
    lines: [
      { speaker: "narrator", text: "Once upon a time", start: 0 },
      { speaker: "narrator", text: "the end", start: 1 },
    ],
  };

  it("makes the voices at their times, never talking over each other, then reuses them", async () => {
    await setKey();
    await json("POST", "/api/films/intro/cast", {
      speakers: [{ speaker: "narrator", type: "narrator" }],
    });
    const saved = (await json("PUT", "/api/films/intro/script", twoLines)).json().script as Script;
    expect(saved.lines.map((l) => l.id).every(Boolean)).toBe(true);

    const made = (await json("POST", "/api/films/intro/script/make")).json();
    expect(made).toMatchObject({ made: 2, reused: 0 });
    // "Once upon a time" lasts 2.3 s, so "the end" waits until 2.4 s.
    expect(await clips()).toEqual([
      ["voice/narrator-1.mp3", 0],
      ["voice/narrator-2.mp3", 2.4],
    ]);
    expect(made.warnings[0]).toContain('"the end" starts at 2.4 s instead of 1 s');

    const again = (await json("POST", "/api/films/intro/script/make")).json();
    expect(again).toMatchObject({ made: 0, reused: 2 });
    expect(await clips()).toHaveLength(2);
  });

  it("takes out the clips and files of lines the script no longer has", async () => {
    await setKey();
    await json("POST", "/api/films/intro/cast", {
      speakers: [{ speaker: "narrator", type: "narrator" }],
    });
    await json("PUT", "/api/films/intro/script", twoLines);
    await json("POST", "/api/films/intro/script/make");
    const { script } = (await app.inject("/api/films/intro/script")).json() as { script: Script };
    const [first] = script.lines;
    await json("PUT", "/api/films/intro/script", { lines: first ? [first] : [] });
    await json("POST", "/api/films/intro/script/make");
    expect(await clips()).toEqual([["voice/narrator-1.mp3", 0]]);
    await expect(stat(join(filmDir(), "voice", "narrator-2.mp3"))).rejects.toThrow();
  });

  it("says when a speaker has no voice, and when the voices run past the film's end", async () => {
    await setKey();
    await json("POST", "/api/films/intro/cast", {
      speakers: [{ speaker: "narrator", type: "narrator" }],
    });
    await json("PUT", "/api/films/intro/script", {
      lines: [
        { speaker: "narrator", text: "one two three four five six", start: 3.5 },
        { speaker: "zed", text: "hello", start: 0 },
      ],
    });
    const made = (await json("POST", "/api/films/intro/script/make")).json();
    expect(made.warnings).toEqual([
      'zed has no voice yet, so "hello" wasn\'t made.',
      "The voices end at 6.2 s, after the end of the film (5 s). Make the film longer.",
    ]);
  });
});

describe("writing the narration in the background", () => {
  it("runs Claude, saves its script, casts and makes the voices", async () => {
    await setKey();
    const started = await json("POST", "/api/films/intro/script/writer", { style: "funny" });
    expect(started.json().state).toBe("running");
    const done = await finished();
    expect(done.state).toBe("done");
    expect(done.message).toBe("Wrote 2 lines. Made 2 voices.");
    expect(done.warnings[0]).toContain('"Wait for me" starts at 2.4 s');

    const { script } = (await app.inject("/api/films/intro/script")).json() as { script: Script };
    expect(script).toMatchObject({ writtenBy: "claude", style: "funny" });
    expect((await film()).config?.voices?.ruby?.type).toBe("girl");
    expect(await clips()).toHaveLength(2);
    const progress = events.flatMap((e) => (e.type === "writer-progress" ? [e.writer.detail] : []));
    expect(progress).toContain("Looking at 1.5 s");
    expect(progress).toContain("Making the voices");

    // Claude only looks: read-only tools, the Kairos tools only, in the film's folder.
    const log = (await readFile(join(claudeDir, "log.jsonl"), "utf8")).trim().split("\n");
    const run = JSON.parse(log.at(-1) ?? "{}");
    expect(run.args).toEqual(
      expect.arrayContaining(["-p", "--strict-mcp-config", "Read,Glob,Grep"]),
    );
    expect(run.prompt).toContain("Style: funny");
    expect(run.cwd).toBe(filmDir());
  });

  it("saves the script and the cast without a key, and says the voices wait for it", async () => {
    const done = await (async () => {
      await json("POST", "/api/films/intro/script/writer", {});
      return finished();
    })();
    expect(done.state).toBe("done");
    expect(done.message).toBe("Wrote 2 lines.");
    expect(done.warnings).toContain(
      "Add your fish.audio key in Settings → Voice, then press Make the voices.",
    );
    expect(Object.keys((await film()).config?.voices ?? {}).sort()).toEqual(["narrator", "ruby"]);
    expect(await clips()).toEqual([]);
  });

  it("explains problems in plain words, and can be stopped", async () => {
    process.env.FAKE_CLAUDE_MODE = "login";
    await json("POST", "/api/films/intro/script/writer", {});
    expect((await finished()).message).toContain("Claude Code needs you to sign in");

    process.env.FAKE_CLAUDE_MODE = "crash";
    await json("POST", "/api/films/intro/script/writer", {});
    expect((await finished()).message).toContain("Something broke inside");

    process.env.FAKE_CLAUDE_MODE = "slow";
    await json("POST", "/api/films/intro/script/writer", {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const twice = await json("POST", "/api/films/intro/script/writer", {});
    expect(twice.json().message).toContain("already writing");
    const stopped = (await json("DELETE", "/api/films/intro/script/writer")).json() as WriterState;
    expect(stopped.state).toBe("stopped");
    expect((await app.inject("/api/films/intro/script")).json().script).toBeNull();
  });
});
