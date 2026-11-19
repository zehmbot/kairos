import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BriefFile, FilmSummary, TemplateSummary } from "../../shared/types.ts";
import type { Camera } from "../camera.ts";
import { Studio } from "../studio.ts";
import { filmRoutes } from "./films.ts";
import { filmPicture, frameRoutes } from "./frames.ts";
import { templateRoutes } from "./templates.ts";

const templatesDir = fileURLToPath(new URL("../../../templates/", import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

let root: string;
let studio: Studio;
let app: FastifyInstance;
let captures: number;

const camera: Pick<Camera, "browser" | "capture"> = {
  browser: { name: "Test browser", path: "/test" },
  capture: async () => {
    captures++;
    return PNG;
  },
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-template-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templatesDir });
  await studio.setWorkspace(join(root, "ws"));
  // One template of the user's own, with a required question.
  const story = join(root, "ws", "templates", "story");
  await mkdir(story, { recursive: true });
  await writeFile(
    join(story, "template.json"),
    JSON.stringify({
      name: "Story",
      defaults: { shape: "tall", duration: 8 },
      kinds: [
        {
          id: "tale",
          name: "Tale",
          fields: [{ id: "script", label: "Script", type: "longtext", required: true }],
        },
      ],
    }),
  );
  await writeFile(join(story, "index.html"), "<canvas></canvas>");
  await writeFile(join(story, "film.js"), "window.renderOut = () => {};");
  await writeFile(join(story, "preview.png"), PNG);
  captures = 0;
  app = Fastify();
  const frames = { studio, camera, filmServerUrl: "http://127.0.0.1:7342" };
  filmRoutes(app, studio, { picture: filmPicture(frames) });
  templateRoutes(app, studio);
  frameRoutes(app, frames);
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const post = (url: string, payload: object) => app.inject({ method: "POST", url, payload });

describe("templates", () => {
  it("lists them, shows their pictures, and deletes only the user's", async () => {
    const list = (await app.inject("/api/templates")).json() as TemplateSummary[];
    expect(list.map((template) => [template.id, template.source])).toEqual([
      ["starter", "kairos"],
      ["story", "yours"],
    ]);
    const preview = await app.inject("/api/templates/story/preview");
    expect(preview.headers["content-type"]).toBe("image/png");
    expect((await app.inject("/api/templates/nope/preview")).statusCode).toBe(404);

    expect((await app.inject({ method: "DELETE", url: "/api/templates/starter" })).statusCode).toBe(
      409,
    );
    expect((await app.inject({ method: "DELETE", url: "/api/templates/story" })).statusCode).toBe(
      204,
    );
    expect(((await app.inject("/api/templates")).json() as TemplateSummary[]).length).toBe(1);
  });
});

describe("films from templates", () => {
  it("asks for the required answers, then keeps the brief", async () => {
    const missing = await post("/api/films", { title: "Moon", shape: "wide", template: "story" });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toBe("Please answer: Script");

    const created = await post("/api/films", {
      title: "Moon",
      shape: "wide",
      template: "story",
      brief: { script: "The moon answers." },
    });
    expect(created.statusCode).toBe(201);
    const film = created.json() as FilmSummary;
    // The template's length; its own files only.
    expect(film).toMatchObject({ id: "moon", hasBrief: true, config: { duration: 8 } });
    const dir = join(root, "ws", "films", "moon");
    expect(await readFile(join(dir, "brief.md"), "utf8")).toContain("The moon answers.");

    const brief = (await app.inject("/api/films/moon/brief")).json() as BriefFile;
    expect(brief).toMatchObject({
      template: "story",
      kind: "tale",
      answers: { script: "The moon answers." },
    });
    const edited = await app.inject({
      method: "PUT",
      url: "/api/films/moon/brief",
      payload: { answers: { script: "The moon whispers." } },
    });
    expect(edited.json().answers).toEqual({ script: "The moon whispers." });
    expect(await readFile(join(dir, "brief.md"), "utf8")).toContain("The moon whispers.");
    expect(
      (await app.inject({ method: "PUT", url: "/api/films/moon/brief", payload: { answers: {} } }))
        .statusCode,
    ).toBe(400);
  });

  it("refuses unknown templates and kinds, and skips an empty optional form", async () => {
    expect(
      (await post("/api/films", { title: "X", shape: "wide", template: "nope" })).statusCode,
    ).toBe(400);
    expect(
      (await post("/api/films", { title: "X", shape: "wide", template: "story", kind: "nope" }))
        .statusCode,
    ).toBe(400);
    const plain = (
      await post("/api/films", { title: "Plain", shape: "wide" })
    ).json() as FilmSummary;
    expect(plain.hasBrief).toBe(false);
    expect((await app.inject("/api/films/plain/brief")).statusCode).toBe(404);
  });

  it("saves a film as a template, with its picture", async () => {
    await post("/api/films", { title: "Idea", shape: "square", brief: { idea: "Bubbles" } });
    const saved = await post("/api/films/idea/save-as-template", {
      name: "Bubbles",
      description: "Round.",
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({
      id: "bubbles",
      source: "yours",
      hasPreview: true,
      defaults: { shape: "square" },
    });
    expect((saved.json() as TemplateSummary).kinds[0]?.fields[0]?.id).toBe("idea");
    expect((await post("/api/films/idea/save-as-template", { name: " " })).statusCode).toBe(400);
  });
});

describe("film card pictures", () => {
  it("takes the picture once, and again after the film changes", async () => {
    await post("/api/films", { title: "Card", shape: "wide" });
    const first = await app.inject("/api/films/card/thumbnail");
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    await app.inject("/api/films/card/thumbnail");
    expect(captures).toBe(1);

    // A newer film file makes the cached picture old.
    const later = new Date(Date.now() + 60_000);
    await utimes(join(root, "ws", "films", "card", "film.js"), later, later);
    await app.inject("/api/films/card/thumbnail");
    expect(captures).toBe(2);
    expect((await app.inject("/api/films/nope/thumbnail")).statusCode).toBe(404);
  });
});
