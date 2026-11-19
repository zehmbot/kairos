import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FilmSummary } from "../../shared/types.ts";
import { Studio } from "../studio.ts";
import { filmRoutes } from "./films.ts";

const templateDir = fileURLToPath(new URL("../../../templates/starter/", import.meta.url));

let root: string;
let studio: Studio;
let app: FastifyInstance;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-film-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir: join(templateDir, "..") });
  await studio.setWorkspace(join(root, "ws"));
  app = Fastify();
  filmRoutes(app, studio);
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const create = (body: object) => app.inject({ method: "POST", url: "/api/films", payload: body });
const patch = (id: string, body: object) =>
  app.inject({ method: "PATCH", url: `/api/films/${id}`, payload: body });

describe("film routes", () => {
  it("makes a film at the chosen frame rate", async () => {
    const response = await create({ title: "Fast", shape: "wide", fps: 60 });
    expect(response.statusCode).toBe(201);
    expect((response.json() as FilmSummary).config?.fps).toBe(60);
    expect((await create({ title: "Plain", shape: "wide" })).json().config.fps).toBe(30);
    const tooFast = await create({ title: "Too fast", shape: "wide", fps: 500 });
    expect(tooFast.statusCode).toBe(400);
    expect(tooFast.json().message).toContain("at most 120");
  });

  it("changes a film's frame rate", async () => {
    await create({ title: "Intro", shape: "wide" });
    const response = await patch("intro", { fps: 24 });
    expect(response.statusCode).toBe(200);
    expect((response.json() as FilmSummary).config?.fps).toBe(24);
    const saved = JSON.parse(
      await readFile(join(root, "ws", "films", "intro", "kairos.json"), "utf8"),
    );
    expect(saved.fps).toBe(24);
  });

  it("refuses bad rates, unknown films and broken kairos.json", async () => {
    await create({ title: "Intro", shape: "wide" });
    expect((await patch("intro", { fps: 0 })).statusCode).toBe(400);
    expect((await patch("intro", { fps: "fast" })).statusCode).toBe(400);
    expect((await patch("nope", { fps: 24 })).statusCode).toBe(404);

    const file = join(root, "ws", "films", "intro", "kairos.json");
    await writeFile(file, "{ broken");
    const broken = await patch("intro", { fps: 24 });
    expect(broken.statusCode).toBe(409);
    expect(broken.json().message).toContain("won't change it");
    expect(await readFile(file, "utf8")).toBe("{ broken");
  });
});
