import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FilmClaude, HubEvent } from "../../shared/types.ts";
import { ActivityBoard } from "../activity.ts";
import { HOOK_PATH, HOOKS_FILE, HooksFileError, installHooks } from "../claude-hooks.ts";
import { ClaudeJobs, JOB_ALLOWED } from "../claude-jobs.ts";
import { installFakeClaude } from "../fake-claude.ts";
import { Studio } from "../studio.ts";
import { claudeWorkRoutes, hookCall } from "./claude-work.ts";
import { filmRoutes } from "./films.ts";

const templatesDir = fileURLToPath(new URL("../../../templates/", import.meta.url));

let claudeDir: string;
let fakeClaude: string;
let root: string;
let studio: Studio;
let app: FastifyInstance;
let events: HubEvent[];
let installed: boolean;
let activity: ActivityBoard;

beforeAll(async () => {
  claudeDir = await mkdtemp(join(tmpdir(), "kairos-fake-claude-"));
  fakeClaude = await installFakeClaude(claudeDir);
});
afterAll(async () => {
  await rm(claudeDir, { recursive: true, force: true });
});

beforeEach(async () => {
  delete process.env.FAKE_CLAUDE_MODE;
  delete process.env.FAKE_CLAUDE_TEXT;
  delete process.env.FAKE_CLAUDE_DELAY;
  process.env.FAKE_CLAUDE_LOG = join(claudeDir, "log.jsonl");
  installed = true;
  root = await mkdtemp(join(tmpdir(), "kairos-claude-work-"));
  // Where Claude Code keeps conversations (the fake one too), never the real ~/.claude.
  process.env.KAIROS_CLAUDE_DIR = join(root, "claude");
  studio = await Studio.open({ home: join(root, "home"), templatesDir });
  await studio.setWorkspace(join(root, "ws"));
  events = [];
  studio.events.subscribe((event) => events.push(event));
  app = Fastify();
  activity = new ActivityBoard({
    publish: (id, now, ended) =>
      studio.events.publish({ type: "claude-activity", id, activity: now, ended }),
  });
  const jobs = new ClaudeJobs({
    claudePath: () => (installed ? fakeClaude : null),
    mcp: { node: process.execPath, script: "server.ts", hubPort: 1 },
    activity,
    limits: { make: 20_000, ask: 20_000 },
  });
  claudeWorkRoutes(app, studio, { jobs, activity });
  filmRoutes(app, studio, {
    afterCreate: async (film, { make }) => {
      await installHooks(film.path, 7340);
      if (make) await jobs.startOrNote({ id: film.id, dir: film.path }, { kind: "make" });
    },
  });
});

afterEach(async () => {
  delete process.env.KAIROS_CLAUDE_DIR;
  activity.close();
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const filmDir = (id = "intro") => join(root, "ws", "films", id);
const newFilm = (make: boolean, idea = "A cat finds a hat.") =>
  app.inject({
    method: "POST",
    url: "/api/films",
    payload: { title: "Intro", shape: "wide", brief: { idea }, make },
  });
const claudeOf = async (id = "intro") =>
  (await app.inject(`/api/films/${id}/claude`)).json() as FilmClaude;

/** Waits until Kairos' run on the film has ended. */
async function finished(id = "intro"): Promise<FilmClaude> {
  for (let i = 0; i < 200; i++) {
    const state = await claudeOf(id);
    if (state.turns[0] && state.turns[0].outcome !== "running" && !activity.busy(id)) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Claude never finished");
}
const lastRun = async () => {
  const log = (await readFile(join(claudeDir, "log.jsonl"), "utf8")).trim().split("\n");
  return JSON.parse(log.at(-1) ?? "{}") as { args: string[]; prompt: string; cwd: string };
};
const activityEvents = () =>
  events.flatMap((event) => (event.type === "claude-activity" ? [event] : []));
const hook = (body: object, notice?: string) =>
  app.inject({
    method: "POST",
    url: `${HOOK_PATH}${notice ? `?notice=${notice}` : ""}`,
    payload: body,
  });

describe("Claude makes the film in the background", () => {
  it("starts on Create film, says each step and keeps Claude's answer", async () => {
    expect((await newFilm(true)).statusCode).toBe(201);
    const state = await finished();
    expect(state.turns[0]).toMatchObject({
      kind: "make",
      outcome: "done",
      answer: "I made a short story in the park with Milo.",
    });
    expect(state.conversation).toBe(true);
    expect(existsSync(join(filmDir(), "made-by-claude.txt"))).toBe(true);

    const steps = activityEvents().map((event) => event.activity?.detail ?? null);
    expect(steps).toEqual(
      expect.arrayContaining(["Reading the brief", "Reading the Blocky guide", "Writing story.js"]),
    );
    const end = activityEvents().at(-1);
    expect(end?.activity).toBeNull();
    expect(end?.ended).toEqual({
      source: "make",
      outcome: "done",
      summary: "I made a short story in the park with Milo.",
    });

    // Edits only in the film's folder, no shell, no web; the conversation is kept.
    const run = await lastRun();
    expect(run.cwd).toBe(filmDir());
    expect(run.prompt).toContain("Make the Kairos film in this folder from its brief.");
    expect(run.args).toEqual(expect.arrayContaining(["-p", "--permission-mode", "acceptEdits"]));
    const tools = run.args[run.args.indexOf("--tools") + 1] ?? "";
    expect(tools.split(",")).not.toContain("Bash");
    expect(tools.split(",")).not.toContain("WebFetch");
    expect(run.args[run.args.indexOf("--allowedTools") + 1]).toBe(JOB_ALLOWED.join(","));
    expect(JOB_ALLOWED).not.toContain("Read");
    expect(run.args).not.toContain("--no-session-persistence");
    expect(run.args).not.toContain("--continue");
    expect(run.args).not.toContain("--resume");
  });

  it("doesn't start without the choice, or without a brief", async () => {
    await newFilm(false);
    expect((await claudeOf()).turns).toEqual([]);
    await app.inject({
      method: "POST",
      url: "/api/films",
      payload: { title: "Empty", shape: "wide", make: true },
    });
    expect((await claudeOf("empty")).turns).toEqual([]);
    const refused = await app.inject({
      method: "POST",
      url: "/api/films/empty/claude",
      payload: { kind: "make" },
    });
    expect(refused.statusCode).toBe(409);
  });

  it("notes why it couldn't start when Claude Code is missing", async () => {
    installed = false;
    await newFilm(true);
    const [turn] = (await claudeOf()).turns;
    expect(turn).toMatchObject({ kind: "make", outcome: "failed" });
    expect(turn?.message).toContain("isn't installed");
  });
});

describe("asking Claude from the film page", () => {
  it("continues the film's conversation and keeps the history newest first", async () => {
    await newFilm(true);
    await finished();
    process.env.FAKE_CLAUDE_TEXT = "I made the cat orange.";
    const asked = await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "Make the cat orange" },
    });
    expect(asked.statusCode).toBe(202);
    const state = await finished();
    expect(state.turns.map((turn) => [turn.kind, turn.text, turn.answer])).toEqual([
      ["ask", "Make the cat orange", "I made the cat orange."],
      ["make", undefined, "I made a short story in the park with Milo."],
    ]);
    // By its id: `--continue` skips conversations that ran in the background.
    const run = await lastRun();
    expect(run.args[run.args.indexOf("--resume") + 1]).toBe("fake-session");
    expect(run.args).not.toContain("--continue");
    expect(run.prompt).toContain("> Make the cat orange");
  });

  it("starts a new conversation when Claude Code no longer has the film's", async () => {
    await newFilm(true);
    await finished();
    await rm(join(root, "claude", "projects"), { recursive: true, force: true });
    await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "Make the cat orange" },
    });
    await finished();
    expect((await lastRun()).args).not.toContain("--resume");
  });

  it("runs one at a time, can be stopped, and says problems in plain words", async () => {
    await newFilm(false);
    process.env.FAKE_CLAUDE_MODE = "slow";
    await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "Slow down" },
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const twice = await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "Again" },
    });
    expect(twice.statusCode).toBe(409);
    expect(twice.json().message).toContain("already working");
    expect(
      (await app.inject({ method: "DELETE", url: "/api/films/intro/claude" })).statusCode,
    ).toBe(204);
    expect((await claudeOf()).turns[0]?.outcome).toBe("stopped");
    expect(activityEvents().at(-1)?.ended?.outcome).toBe("stopped");

    process.env.FAKE_CLAUDE_MODE = "login";
    await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "Try" },
    });
    const failed = (await finished()).turns[0];
    expect(failed?.outcome).toBe("failed");
    expect(failed?.message).toContain("needs you to sign in");

    const empty = await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "  " },
    });
    expect(empty.statusCode).toBe(400);
  });
});

describe("Claude in your terminal (hooks)", () => {
  it("puts the hooks in new films, keeping your own settings", async () => {
    await newFilm(false);
    const settings = JSON.parse(await readFile(join(filmDir(), HOOKS_FILE), "utf8"));
    expect(Object.keys(settings.hooks)).toEqual([
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "Notification",
      "Stop",
      "SessionEnd",
    ]);
    expect(settings.hooks.Stop[0].hooks[0]).toEqual({
      type: "http",
      url: `http://127.0.0.1:7340${HOOK_PATH}`,
      timeout: 2,
    });

    // Your own settings and hooks stay; Kairos' old entries (another port) are replaced; no change, no write.
    const mine = { type: "command", command: "echo done" };
    settings.permissions = { allow: ["Bash(npm test)"] };
    settings.hooks.Stop.unshift({ hooks: [mine] });
    await writeFile(join(filmDir(), HOOKS_FILE), JSON.stringify(settings));
    expect(await installHooks(filmDir(), 7399)).toBe(true);
    const again = JSON.parse(await readFile(join(filmDir(), HOOKS_FILE), "utf8"));
    expect(again.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(again.hooks.Stop).toEqual([
      { hooks: [mine] },
      { hooks: [{ type: "http", url: `http://127.0.0.1:7399${HOOK_PATH}`, timeout: 2 }] },
    ]);
    expect(JSON.stringify(again)).not.toContain(":7340");
    expect(await installHooks(filmDir(), 7399)).toBe(false);

    // A broken file is left alone.
    await writeFile(join(filmDir(), HOOKS_FILE), "{ not json");
    await expect(installHooks(filmDir(), 7399)).rejects.toThrow(HooksFileError);
    expect(await readFile(join(filmDir(), HOOKS_FILE), "utf8")).toBe("{ not json");
  });

  it("follows a session: working, each step, waiting for you, done", async () => {
    await newFilm(false);
    const base = { session_id: "s1", cwd: join(filmDir(), "assets"), transcript_path: "x" };
    await hook({ ...base, hook_event_name: "UserPromptSubmit", prompt: "my secret plan" });
    await hook({
      ...base,
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: join(filmDir(), "story.js"), content: "secret words" },
    });
    await hook({ ...base, hook_event_name: "Notification", message: "Allow?" }, "waiting");
    expect((await claudeOf()).activity).toMatchObject({ source: "terminal", stage: "waiting" });
    await hook({ ...base, hook_event_name: "PostToolUse", tool_name: "Write" });
    await hook({ ...base, hook_event_name: "Stop", last_assistant_message: "All done." });

    const seen = activityEvents().map((event) => [
      event.activity?.stage ?? null,
      event.activity?.detail ?? null,
    ]);
    expect(seen).toEqual([
      ["thinking", "Thinking"],
      ["writing", "Writing story.js"],
      ["waiting", "Answer it in your terminal"],
      ["thinking", "Thinking"],
      [null, null],
    ]);
    expect(activityEvents().at(-1)?.ended).toEqual({
      source: "terminal",
      outcome: "done",
      summary: "All done.",
    });
    // Your prompt and the files' contents never go anywhere.
    expect(JSON.stringify(events)).not.toContain("secret");
    expect((await app.inject("/api/claude/activity")).json()).toEqual({});
  });

  it("ignores folders that aren't films, and its own runs' hooks", async () => {
    await newFilm(false);
    await hook({ hook_event_name: "UserPromptSubmit", session_id: "s", cwd: root });
    await hook({ hook_event_name: "UserPromptSubmit", session_id: "s", cwd: tmpdir() });
    expect(activityEvents()).toEqual([]);

    process.env.FAKE_CLAUDE_DELAY = "1500";
    await app.inject({
      method: "POST",
      url: "/api/films/intro/claude",
      payload: { kind: "ask", text: "Hi" },
    });
    await hook({ hook_event_name: "UserPromptSubmit", session_id: "s", cwd: filmDir() });
    expect(activityEvents().every((event) => event.activity?.source !== "terminal")).toBe(true);
    await finished();
  });

  it("reads only a few small fields of a hook", () => {
    expect(
      hookCall(
        {
          hook_event_name: "PreToolUse",
          session_id: "s",
          tool_name: "Bash",
          tool_input: { command: "cat ~/.env", file_path: "a.js", content: "x" },
          prompt: "hello",
        },
        "nope",
      ),
    ).toEqual({
      event: "PreToolUse",
      session: "s",
      tool: "Bash",
      input: { file_path: "a.js" },
      notice: undefined,
      message: undefined,
    });
    expect(hookCall({ nothing: true }, undefined)).toBeNull();
  });
});

describe("hooks in a folder that has none yet", () => {
  it("writes the file and the .claude folder", async () => {
    const dir = join(tmpdir(), `kairos-hooks-${process.pid}`);
    await mkdir(dir, { recursive: true });
    try {
      expect(await installHooks(dir, 7340)).toBe(true);
      expect(existsSync(join(dir, HOOKS_FILE))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
