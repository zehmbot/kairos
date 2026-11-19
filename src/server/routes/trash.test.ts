import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FilmSummary, TrashEntry } from "../../shared/types.ts";
import { Studio } from "../studio.ts";
import { filmRoutes } from "./films.ts";
import { trashRoutes } from "./trash.ts";

const templatesDir = fileURLToPath(new URL("../../../templates/", import.meta.url));

let root: string;
let studio: Studio;
let app: FastifyInstance;
let rendering: Set<string>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-trash-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir });
  await studio.setWorkspace(join(root, "ws"));
  rendering = new Set();
  app = Fastify();
  filmRoutes(app, studio, { rendering: (id) => rendering.has(id) });
  trashRoutes(app, studio);
  for (const title of ["Intro", "Outro"]) {
    await app.inject({ method: "POST", url: "/api/films", payload: { title, shape: "wide" } });
  }
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const filmIds = async () =>
  ((await app.inject("/api/films")).json() as FilmSummary[]).map((film) => film.id).sort();
const trash = async () => (await app.inject("/api/trash")).json() as TrashEntry[];

describe("deleting films", () => {
  it("moves a film to the trash, and restores it", async () => {
    const answer = await app.inject({ method: "DELETE", url: "/api/films/intro" });
    expect(answer.statusCode).toBe(204);
    expect(await filmIds()).toEqual(["outro"]);
    const [item] = await trash();
    expect(item).toMatchObject({ id: "intro", title: "Intro" });

    const restored = await app.inject({
      method: "POST",
      url: `/api/trash/${item?.entry}/restore`,
    });
    expect(restored.json()).toEqual({ id: "intro" });
    expect(await filmIds()).toEqual(["intro", "outro"]);
    expect(await trash()).toEqual([]);
  });

  it("deletes a film for good", async () => {
    const answer = await app.inject({ method: "DELETE", url: "/api/films/intro?forever=true" });
    expect(answer.statusCode).toBe(204);
    expect(await readdir(join(root, "ws", "films"))).toEqual(["outro"]);
    expect(await trash()).toEqual([]);
  });

  it("refuses while a render of the film runs or waits", async () => {
    rendering.add("intro");
    const answer = await app.inject({ method: "DELETE", url: "/api/films/intro" });
    expect(answer.statusCode).toBe(409);
    expect(answer.json().message).toContain("Cancel it first");
    expect(await filmIds()).toEqual(["intro", "outro"]);
    expect((await app.inject({ method: "DELETE", url: "/api/films/nope" })).statusCode).toBe(404);
  });

  it("deletes trashed films for good, one or all", async () => {
    await app.inject({ method: "DELETE", url: "/api/films/intro" });
    await app.inject({ method: "DELETE", url: "/api/films/outro" });
    const [first] = await trash();
    const one = await app.inject({ method: "DELETE", url: `/api/trash/${first?.entry}` });
    expect(one.statusCode).toBe(204);
    expect(await trash()).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: "/api/trash" })).statusCode).toBe(204);
    expect(await trash()).toEqual([]);
    const gone = await app.inject({ method: "DELETE", url: `/api/trash/${first?.entry}` });
    expect(gone.statusCode).toBe(409);
    expect(gone.json().message).toBe("This film isn't in the trash (any more).");
  });
});
