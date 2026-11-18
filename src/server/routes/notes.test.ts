import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HubEvent, Note } from "../../shared/types.ts";
import type { CaptureRequest } from "../camera.ts";
import { createFilm } from "../films.ts";
import { Studio } from "../studio.ts";
import { noteRoutes } from "./notes.ts";

const templateDir = fileURLToPath(new URL("../../../templates/starter/", import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

let root: string;
let studio: Studio;
let app: FastifyInstance;
let filmDir: string;
let captures: CaptureRequest[];
let events: HubEvent[];
let cameraFails: boolean;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-note-routes-"));
  studio = await Studio.open({ home: join(root, "home"), templateDir });
  await studio.setWorkspace(join(root, "ws"));
  const filmsDir = studio.filmsDir ?? "";
  await createFilm(filmsDir, templateDir, { title: "Intro", shape: "wide" });
  filmDir = join(filmsDir, "intro");
  captures = [];
  events = [];
  cameraFails = false;
  studio.events.subscribe((event) => events.push(event));
  app = Fastify();
  noteRoutes(app, {
    studio,
    filmServerUrl: "http://127.0.0.1:7342",
    camera: {
      browser: { name: "Test browser", path: "/test" },
      capture: async (request) => {
        captures.push(request);
        if (cameraFails) throw new Error("camera broke");
        return PNG;
      },
    },
  });
});

afterEach(async () => {
  studio.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const post = (body: unknown, film = "intro") =>
  app.inject({ method: "POST", url: `/api/films/${film}/notes`, payload: body as object });
const list = async () =>
  (await app.inject({ method: "GET", url: "/api/films/intro/notes" })).json() as Note[];
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("notes API", () => {
  it("adds a note, then takes its picture in the background", async () => {
    const shapes = [{ type: "arrow", x1: 0, y1: 0, x2: 50, y2: 50 }];
    const response = await post({ text: "Move this", t: 2, shapes });
    expect(response.statusCode).toBe(201);
    const note = response.json() as Note;
    expect(note).toMatchObject({ text: "Move this", t: 2, image: null, status: "open" });

    await settle();
    expect(captures).toEqual([
      {
        url: "http://127.0.0.1:7342/intro/index.html",
        width: 1920,
        height: 1080,
        t: 2,
        shapes,
      },
    ]);
    expect((await list())[0]?.image).toBe(`notes/${note.id}.png`);
    expect(events.filter((event) => event.type === "notes-changed")).toEqual([
      { type: "notes-changed", id: "intro" },
      { type: "notes-changed", id: "intro" },
    ]);

    const image = await app.inject({
      method: "GET",
      url: `/api/films/intro/notes/${note.id}/image`,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.rawPayload.equals(PNG)).toBe(true);
  });

  it("keeps the note when the camera fails", async () => {
    cameraFails = true;
    const note = (await post({ text: "Still saved", t: 0 })).json() as Note;
    await settle();
    expect((await list()).map((n) => [n.id, n.image])).toEqual([[note.id, null]]);
    const image = await app.inject({
      method: "GET",
      url: `/api/films/intro/notes/${note.id}/image`,
    });
    expect(image.statusCode).toBe(404);
  });

  it("checks the note against the film", async () => {
    expect((await post({ text: "", t: 0 })).json().message).toBe("Write what should change.");
    expect((await post({ text: "Too late", t: 6 })).json().message).toBe(
      "That time is past the end of the film.",
    );
    expect((await post({ text: "Range", t: 1, until: 9 })).statusCode).toBe(400);
    expect((await post({ text: "Last frame", t: 5 })).statusCode).toBe(201);
    expect((await post({ text: "x", t: 0 }, "missing")).statusCode).toBe(404);
  });

  it("marks notes fixed, edits and deletes them", async () => {
    const note = (await post({ text: "Fix me", t: 1 })).json() as Note;
    const url = `/api/films/intro/notes/${note.id}`;

    const fixed = await app.inject({ method: "PATCH", url, payload: { status: "fixed" } });
    expect(fixed.json()).toMatchObject({ status: "fixed", text: "Fix me" });
    const edited = await app.inject({ method: "PATCH", url, payload: { text: "Fixed it" } });
    expect(edited.json()).toMatchObject({ status: "fixed", text: "Fixed it" });

    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(404);
    expect(await list()).toEqual([]);
  });

  it("explains a broken notes file instead of failing", async () => {
    await mkdir(join(filmDir, ".kairos"), { recursive: true });
    await writeFile(join(filmDir, ".kairos", "notes.json"), "not json");
    const response = await app.inject({ method: "GET", url: "/api/films/intro/notes" });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("notes file");
  });

  it("refuses odd note ids", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/films/intro/notes/..%2F..%2Fx/image",
    });
    expect(response.statusCode).toBe(404);
  });

  it("says which browser takes the pictures", async () => {
    const response = await app.inject({ method: "GET", url: "/api/camera" });
    expect(response.json()).toEqual({ browser: { name: "Test browser", path: "/test" } });
  });
});
