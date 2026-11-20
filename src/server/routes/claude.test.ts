import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaudeStatus } from "../../shared/types.ts";
import type { Camera } from "../camera.ts";
import { ClaudeCliError, type ClaudeTools } from "../claude-cli.ts";
import { createFilm } from "../films.ts";
import { Studio } from "../studio.ts";
import { claudeRoutes } from "./claude.ts";
import { frameRoutes } from "./frames.ts";

const templateDir = fileURLToPath(new URL("../../../templates/starter/", import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

let root: string;
let studio: Studio;
let app: FastifyInstance;
let installed: boolean;
let connected: boolean;
let openedIn: string[];
let captureError: string | null;
let skillsTurnedOn: number;
let skillsFail: boolean;

class FakeClaude implements ClaudeTools {
  async status(): Promise<ClaudeStatus> {
    return {
      cli: installed ? { path: "/bin/claude", version: "2.1.327" } : null,
      connected,
    };
  }
  #need() {
    if (!installed) throw new ClaudeCliError("Claude Code isn't installed on this computer.");
  }
  async connect() {
    this.#need();
    connected = true;
    return this.status();
  }
  async disconnect() {
    this.#need();
    connected = false;
    return this.status();
  }
  async openHere(dir: string) {
    this.#need();
    openedIn.push(dir);
  }
}

let storyLength: number | null = null;
const camera: Pick<Camera, "browser" | "capture" | "captureFrame"> = {
  browser: { name: "Test browser", path: "/test" },
  capture: async () => {
    if (captureError) throw new Error(captureError);
    return PNG;
  },
  captureFrame: async () => {
    if (captureError) throw new Error(captureError);
    return { png: PNG, length: storyLength, checks: null };
  },
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-claude-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir: join(templateDir, "..") });
  await studio.setWorkspace(join(root, "ws"));
  await createFilm(studio.filmsDir ?? "", templateDir, { title: "Intro", shape: "wide" });
  installed = true;
  connected = false;
  openedIn = [];
  captureError = null;
  skillsTurnedOn = 0;
  skillsFail = false;
  app = Fastify();
  claudeRoutes(app, studio, new FakeClaude(), async () => {
    if (skillsFail) throw new Error("disk full");
    skillsTurnedOn++;
  });
  frameRoutes(app, { studio, camera, filmServerUrl: "http://127.0.0.1:7342" });
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe("Claude routes", () => {
  it("reports, connects and disconnects", async () => {
    expect((await app.inject("/api/claude")).json()).toEqual({
      cli: { path: "/bin/claude", version: "2.1.327" },
      connected: false,
    });
    expect(
      (await app.inject({ method: "POST", url: "/api/claude/connect" })).json().connected,
    ).toBe(true);
    expect(
      (await app.inject({ method: "POST", url: "/api/claude/disconnect" })).json().connected,
    ).toBe(false);
  });

  it("turns on the Kairos skills after connecting, without failing because of them", async () => {
    await app.inject({ method: "POST", url: "/api/claude/connect" });
    expect(skillsTurnedOn).toBe(1);
    skillsFail = true;
    const response = await app.inject({ method: "POST", url: "/api/claude/connect" });
    expect(response.statusCode).toBe(200);
    expect(response.json().connected).toBe(true);
  });

  it("explains when Claude Code isn't installed", async () => {
    installed = false;
    expect((await app.inject("/api/claude")).json()).toEqual({ cli: null, connected: false });
    const response = await app.inject({ method: "POST", url: "/api/claude/connect" });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("isn't installed");
  });

  it("opens Claude in the film folder", async () => {
    const response = await app.inject({ method: "POST", url: "/api/films/intro/open-claude" });
    expect(response.statusCode).toBe(204);
    expect(openedIn).toEqual([join(root, "ws", "films", "intro")]);
    expect(
      (await app.inject({ method: "POST", url: "/api/films/nope/open-claude" })).statusCode,
    ).toBe(404);
  });
});

describe("frame route", () => {
  it("returns a picture of the frame", async () => {
    const response = await app.inject("/api/films/intro/frame?t=2.5");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.rawPayload.equals(PNG)).toBe(true);
    expect(response.headers["x-kairos-story-length"]).toBeUndefined();

    // A film that times itself says how long its story lasts.
    storyLength = 6.4251;
    const timed = await app.inject("/api/films/intro/frame?t=2.5");
    expect(timed.headers["x-kairos-story-length"]).toBe("6.425");
    storyLength = null;
  });

  it("draws sheets only for films that have them", async () => {
    const none = await app.inject("/api/films/intro/sheet?name=props");
    expect(none.statusCode).toBe(404);
    expect(none.json().message).toContain("Blocky template");
  });

  it("checks the time", async () => {
    expect((await app.inject("/api/films/intro/frame")).statusCode).toBe(400);
    expect((await app.inject("/api/films/intro/frame?t=-1")).statusCode).toBe(400);
    const late = await app.inject("/api/films/intro/frame?t=9");
    expect(late.statusCode).toBe(400);
    expect(late.json().message).toContain("lasts 5 s");
  });

  it("passes on the film's own error", async () => {
    captureError = "The film could not draw this frame: boom is not defined";
    const response = await app.inject("/api/films/intro/frame?t=1");
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain("boom is not defined");
  });
});
