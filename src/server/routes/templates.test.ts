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

const camera: Pick<Camera, "browser" | "capture" | "captureFrame"> = {
  browser: { name: "Test browser", path: "/test" },
  capture: async () => {
    captures++;
    return PNG;
  },
  captureFrame: async () => {
    captures++;
    return { png: PNG, length: null, checks: null };
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
      ["blocky", "kairos"],
      ["blocky-cinema", "kairos"],
      ["blocky-story", "kairos"],
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
    const left = (await app.inject("/api/templates")).json() as TemplateSummary[];
    expect(left.map((template) => template.id)).toEqual([
      "starter",
      "blocky",
      "blocky-cinema",
      "blocky-story",
    ]);
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

describe("the Blocky template", () => {
  it("is valid and makes a vertical film with its engine, font and story questions", async () => {
    const blocky = ((await app.inject("/api/templates")).json() as TemplateSummary[]).find(
      (template) => template.id === "blocky",
    );
    expect(blocky).toMatchObject({ source: "kairos", hasPreview: true, problem: null });
    expect(blocky?.defaults).toMatchObject({ shape: "tall", fps: 30 });
    expect(blocky?.kinds.map((kind) => kind.id)).toEqual(["story"]);
    const fields = blocky?.kinds[0]?.fields ?? [];
    expect(fields.map((field) => field.id)).toEqual([
      "story",
      "characters",
      "hero",
      "place",
      "mood",
    ]);
    expect(fields[1]?.options?.[0]).toBe("Keep the Blocky cast");

    const made = await post("/api/films", {
      title: "Snow day",
      shape: "tall",
      template: "blocky",
      kind: "story",
      brief: { story: "It snowed all night.", characters: "Keep the Blocky cast" },
    });
    expect(made.statusCode).toBe(201);
    const dir = join(root, "ws", "films", "snow-day");
    expect(await readFile(join(dir, "film.js"), "utf8")).toContain('Number("1080")');
    expect(await readFile(join(dir, "blocky", "engine.js"), "utf8")).toContain("createEngine");
    const font = await readFile(join(dir, "assets", "fonts", "Poppins-ExtraBoldItalic.ttf"));
    expect(font.length).toBeGreaterThan(100_000);
    expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toMatch(/^# Snow day/);
    expect(await readFile(join(dir, "brief.md"), "utf8")).toContain("Keep the Blocky cast");
  });
});

describe("making and changing templates", () => {
  const settings = {
    name: "Quiz",
    description: "A question a day.",
    defaults: { shape: "square", fps: 60, duration: 12 },
    kinds: [
      {
        id: "default",
        name: "Default",
        fields: [
          { id: "topic", label: "Topic", type: "text", required: true },
          { id: "mood", label: "Mood", type: "choice", options: ["Calm", "Fun"] },
        ],
      },
    ],
  };
  const put = (url: string, payload: object) => app.inject({ method: "PUT", url, payload });

  it("makes a new one from the blank film, and films start from it", async () => {
    const made = await post("/api/templates", settings);
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({ id: "quiz", source: "yours", hasPreview: false });
    const dir = join(root, "ws", "templates", "quiz");
    // The blank film's files, without its template.json or picture.
    expect(await readFile(join(dir, "film.js"), "utf8")).toContain("renderOut");
    const file = JSON.parse(await readFile(join(dir, "template.json"), "utf8"));
    expect(file.name).toBe("Quiz");
    expect((await post("/api/templates", settings)).json()).toMatchObject({ id: "quiz-2" });

    const film = await post("/api/films", {
      title: "Day one",
      shape: "square",
      template: "quiz",
      brief: { topic: "Moons", mood: "Fun" },
    });
    expect(film.statusCode).toBe(201);
  });

  it("refuses broken settings with the reason", async () => {
    const noName = await post("/api/templates", { ...settings, name: "  " });
    expect(noName.statusCode).toBe(400);
    expect(noName.json().message).toBe("Give the template a name.");
    const noChoices = await post("/api/templates", {
      ...settings,
      kinds: [{ id: "a", name: "A", fields: [{ id: "x", label: "X", type: "choice" }] }],
    });
    expect(noChoices.json().message).toBe("A choice question needs at least one choice.");
    const twice = await post("/api/templates", {
      ...settings,
      kinds: [
        {
          id: "a",
          name: "A",
          fields: [
            { id: "x", label: "X", type: "text" },
            { id: "x", label: "Y", type: "text" },
          ],
        },
      ],
    });
    expect(twice.json().message).toBe("Two questions have the same id.");
  });

  it("changes the user's own, but not Kairos' ones", async () => {
    const changed = await put("/api/templates/story", settings);
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ id: "story", name: "Quiz" });
    // Its files stay as they were.
    const filmJs = await readFile(join(root, "ws", "templates", "story", "film.js"), "utf8");
    expect(filmJs).toContain("renderOut");
    expect((await put("/api/templates/starter", settings)).statusCode).toBe(409);
    expect((await put("/api/templates/nope", settings)).statusCode).toBe(404);
    expect((await put("/api/templates/story", { name: "" })).statusCode).toBe(400);
  });

  it("duplicates a template into one of the user's", async () => {
    const copy = await post("/api/templates/starter/duplicate", {});
    expect(copy.statusCode).toBe(201);
    expect(copy.json()).toMatchObject({
      id: "starter-copy",
      name: "Starter copy",
      source: "yours",
    });
    const again = await post("/api/templates/story/duplicate", {});
    expect(again.json()).toMatchObject({ id: "story-copy", name: "Story copy", hasPreview: true });
    expect((again.json() as TemplateSummary).kinds[0]?.fields[0]?.id).toBe("script");
  });

  it("opens a template's folder", async () => {
    const opened: string[] = [];
    const other = Fastify();
    templateRoutes(other, studio, { open: (path) => opened.push(path) });
    const answer = await other.inject({ method: "POST", url: "/api/templates/story/open-folder" });
    expect(answer.statusCode).toBe(204);
    expect(opened).toEqual([join(root, "ws", "templates", "story")]);
    await other.close();
  });
});
