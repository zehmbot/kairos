import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PickResult } from "../folder-picker.ts";
import { Studio } from "../studio.ts";
import { PICKER_TITLE, workspaceRoutes } from "./workspace.ts";

let root: string;
let studio: Studio;
let app: FastifyInstance;
/** What the fake folder window answers next. */
let answer: () => Promise<PickResult>;
let asked: { title: string; start: string | null }[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-workspace-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templateDir: root });
  asked = [];
  answer = async () => ({ status: "cancelled" });
  app = Fastify();
  workspaceRoutes(app, studio, async (title, start) => {
    asked.push({ title, start });
    return answer();
  });
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const pick = () => app.inject({ method: "POST", url: "/api/workspace/pick" });

describe("POST /api/workspace/pick", () => {
  it("switches to the folder chosen in the window", async () => {
    const chosen = join(root, "My Films");
    answer = async () => ({ status: "picked", path: chosen });

    const response = await pick();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "picked", workspace: { path: chosen } });
    expect(studio.workspace).toBe(chosen);
    expect((await stat(join(chosen, "films"))).isDirectory()).toBe(true);
    expect(asked[0]?.title).toBe(PICKER_TITLE);
  });

  it("opens the window in the current workspace", async () => {
    const current = join(root, "current");
    await studio.setWorkspace(current);
    await pick();
    expect(asked[0]?.start).toBe(current);
  });

  it("changes nothing when the window is cancelled", async () => {
    const response = await pick();
    expect(response.json()).toMatchObject({ status: "cancelled", workspace: { path: null } });
    expect(studio.workspace).toBeNull();
  });

  it("says when this computer has no folder window", async () => {
    answer = async () => ({ status: "unsupported" });
    expect((await pick()).json()).toMatchObject({ status: "unsupported" });
  });

  it("explains when the window fails to open", async () => {
    answer = async () => {
      throw new Error("no display");
    };
    const response = await pick();
    expect(response.statusCode).toBe(500);
    expect(response.json().message).toBe("Kairos could not open the folder window: no display");
  });

  it("only opens one window at a time", async () => {
    let close: (result: PickResult) => void = () => {};
    answer = () =>
      new Promise((resolve) => {
        close = resolve;
      });

    const first = pick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await pick();
    expect(second.statusCode).toBe(409);

    close({ status: "cancelled" });
    expect((await first).statusCode).toBe(200);
    answer = async () => ({ status: "cancelled" });
    expect((await pick()).statusCode).toBe(200);
  });
});
