import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Skill } from "../../shared/types.ts";
import type { PickResult } from "../folder-picker.ts";
import { Skills } from "../skills.ts";
import { skillRoutes } from "./skills.ts";

let root: string;
let app: FastifyInstance;
let nextPick: PickResult;
let opened: string[];

async function writeSkill(dir: string, name: string) {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(
    join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: About ${name}.\n---\nBody\n`,
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-skill-routes-"));
  await writeSkill(join(root, "builtin"), "kairos");
  const skills = new Skills({
    builtinDir: join(root, "builtin"),
    userDir: join(root, "user"),
    claudeDir: join(root, "claude", "skills"),
  });
  nextPick = { status: "cancelled" };
  opened = [];
  app = Fastify();
  skillRoutes(app, skills, {
    pick: async () => nextPick,
    open: (path) => opened.push(path),
  });
});

afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const post = (url: string, payload?: object) => app.inject({ method: "POST", url, payload });
const stateOf = (list: Skill[], name: string) => list.find((skill) => skill.name === name)?.state;

describe("skill routes", () => {
  it("lists skills and turns them on and off", async () => {
    expect(stateOf((await app.inject("/api/skills")).json(), "kairos")).toBe("off");
    expect(stateOf((await post("/api/skills/kairos/on")).json(), "kairos")).toBe("on");
    expect(stateOf((await post("/api/skills/kairos/update")).json(), "kairos")).toBe("on");
    expect(stateOf((await post("/api/skills/kairos/off")).json(), "kairos")).toBe("off");
    expect((await post("/api/skills/nope/on")).statusCode).toBe(409);
    expect((await post("/api/skills/Bad..Name/on")).statusCode).toBe(404);
  });

  it("writes a new skill, with checks", async () => {
    const created = await post("/api/skills", {
      name: "my-style",
      description: "Use for my films.",
      instructions: "Warm colors.",
    });
    expect(created.statusCode).toBe(201);
    expect(stateOf(created.json(), "my-style")).toBe("on");

    const again = await post("/api/skills", {
      name: "my-style",
      description: "x",
      instructions: "y",
    });
    expect(again.statusCode).toBe(409);
    const badName = await post("/api/skills", {
      name: "My Style!",
      description: "x",
      instructions: "y",
    });
    expect(badName.statusCode).toBe(400);
    expect(badName.json().message).toContain("small letters");
    const reserved = await post("/api/skills", {
      name: "synced",
      description: "x",
      instructions: "y",
    });
    expect(reserved.json().message).toContain("keeps this name");
  });

  it("adds a skill folder picked in the system window", async () => {
    await writeSkill(join(root, "downloads"), "found-skill");
    nextPick = { status: "picked", path: join(root, "downloads", "found-skill") };
    expect((await post("/api/skills/pick")).json()).toEqual({ status: "picked" });
    expect(stateOf((await app.inject("/api/skills")).json(), "found-skill")).toBe("on");

    nextPick = { status: "cancelled" };
    expect((await post("/api/skills/pick")).json()).toEqual({ status: "cancelled" });

    nextPick = { status: "picked", path: join(root, "downloads") };
    const notSkill = await post("/api/skills/pick");
    expect(notSkill.statusCode).toBe(409);
    expect(notSkill.json().message).toContain("no SKILL.md");
  });

  it("opens a skill's folder and deletes the user's own", async () => {
    await post("/api/skills", { name: "mine", description: "x", instructions: "y" });
    expect((await post("/api/skills/mine/open-folder")).statusCode).toBe(204);
    expect(opened).toEqual([join(root, "user", "mine")]);

    const deleted = await app.inject({ method: "DELETE", url: "/api/skills/mine" });
    expect(deleted.json().some((skill: Skill) => skill.name === "mine")).toBe(false);
    expect((await app.inject({ method: "DELETE", url: "/api/skills/kairos" })).statusCode).toBe(
      409,
    );
  });
});
