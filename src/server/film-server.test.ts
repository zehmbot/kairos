import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BRIDGE_PATH,
  buildFilmServer,
  injectBridge,
  RAPIER_PATH,
  THREE_PATH,
} from "./film-server.ts";

const PORT = 7342;
const HOST = `127.0.0.1:${PORT}`;
const PARENTS = ["http://127.0.0.1:7340", "http://localhost:7340"];

let filmsDir: string;
let app: FastifyInstance;

beforeAll(async () => {
  filmsDir = await mkdtemp(join(tmpdir(), "kairos-film-server-"));
  const dir = join(filmsDir, "my-intro");
  await mkdir(join(dir, "assets"), { recursive: true });
  await mkdir(join(dir, ".kairos"), { recursive: true });
  await writeFile(join(dir, "kairos.json"), JSON.stringify({ title: "Intro", duration: 2 }));
  await writeFile(
    join(dir, "index.html"),
    "<!doctype html><html><head><title>x</title></head></html>",
  );
  await writeFile(join(dir, "film.js"), "window.renderOut = () => {};");
  await writeFile(join(dir, "assets", "page.html"), "<html><head></head></html>");
  await writeFile(join(dir, "sheet.html"), "<html><head></head></html>");
  await writeFile(join(dir, ".kairos", "notes.json"), "[]");
  await writeFile(join(filmsDir, "secret.txt"), "secret");

  app = await buildFilmServer({ filmsDir: () => filmsDir, port: PORT, parentOrigins: PARENTS });
});

afterAll(async () => {
  await app.close();
  await rm(filmsDir, { recursive: true, force: true });
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url, headers: { host: HOST, ...headers } });

describe("injectBridge", () => {
  it("puts the bridge right after <head>", () => {
    const html = injectBridge('<html lang="en"><head><title>x</title></head></html>', PARENTS);
    expect(html).toBe(
      `<html lang="en"><head><script src="${BRIDGE_PATH}" data-parents="${PARENTS.join(" ")}"></script><title>x</title></head></html>`,
    );
  });

  it("works without a <head>", () => {
    expect(injectBridge("<p>hi</p>", PARENTS).startsWith("<script")).toBe(true);
    expect(injectBridge("<!doctype html><p>hi</p>", PARENTS)).toMatch(/^<!doctype html><script/);
  });

  it("does not mistake <header> for <head>", () => {
    const html = injectBridge("<html><body><header></header></body></html>", PARENTS);
    expect(html.indexOf("<script")).toBe("<html>".length);
  });
});

describe("film server", () => {
  it("serves the film page with the bridge added", async () => {
    const response = await get("/my-intro/index.html");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain(`<script src="${BRIDGE_PATH}"`);
  });

  it("adds the bridge to the film's other top-level pages (a template's sheets)", async () => {
    expect((await get("/my-intro/sheet.html")).body).toContain(BRIDGE_PATH);
  });

  it("serves the page for the bare film folder too", async () => {
    expect((await get("/my-intro/")).body).toContain(BRIDGE_PATH);
    expect((await get("/my-intro")).statusCode).toBe(302);
  });

  it("serves other files untouched", async () => {
    const script = await get("/my-intro/film.js");
    expect(script.statusCode).toBe(200);
    expect(script.body).toBe("window.renderOut = () => {};");
    const other = await get("/my-intro/assets/page.html");
    expect(other.body).not.toContain(BRIDGE_PATH);
  });

  it("serves the bridge script", async () => {
    const response = await get(BRIDGE_PATH);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("renderOut");
  });

  it("never caches and only lets Kairos embed films", async () => {
    const response = await get("/my-intro/index.html");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-security-policy"]).toBe(
      `frame-ancestors ${PARENTS.join(" ")}`,
    );
  });

  it("refuses paths outside the film and hidden files", async () => {
    for (const url of [
      "/my-intro/../secret.txt",
      "/my-intro/%2e%2e/secret.txt",
      "/my-intro/assets/..%2F..%2Fsecret.txt",
      "/my-intro/.kairos/notes.json",
      "/..%2Fsecret.txt/x",
      "/missing/index.html",
    ]) {
      expect((await get(url)).statusCode, url).toBe(404);
    }
  });

  it("refuses foreign hosts and cross-site requests", async () => {
    expect((await get("/my-intro/index.html", { host: "evil.example:7342" })).statusCode).toBe(403);
    expect((await get("/my-intro/index.html", { "sec-fetch-site": "cross-site" })).statusCode).toBe(
      403,
    );
  });
});

describe("three.js for 3D films", () => {
  it("serves the pinned three.js build and its addons as JavaScript", async () => {
    const core = await get(`${THREE_PATH}build/three.module.js`);
    expect(core.statusCode).toBe(200);
    expect(core.headers["content-type"]).toContain("javascript");
    const addon = await get(`${THREE_PATH}examples/jsm/geometries/RoundedBoxGeometry.js`);
    expect(addon.statusCode).toBe(200);
  });

  it("serves nothing else from the package", async () => {
    for (const path of [
      "package.json",
      "src/Three.js",
      "build/../package.json",
      "build/%2e%2e/package.json",
      "examples/jsm/../../package.json",
      "build/..%5c..%5cpackage.json",
    ]) {
      expect((await get(`${THREE_PATH}${path}`)).statusCode, path).toBe(404);
    }
  });
});

describe("Rapier for physics", () => {
  it("serves the deterministic build, one file, as JavaScript", async () => {
    const rapier = await get(RAPIER_PATH);
    expect(rapier.statusCode).toBe(200);
    expect(rapier.headers["content-type"]).toContain("javascript");
    expect(rapier.body).toContain("WebAssembly");
    for (const path of ["rapier.cjs", "package.json", "../package.json", "rapier_wasm3d.js"]) {
      expect((await get(`/__kairos/lib/rapier/${path}`)).statusCode, path).toBe(404);
    }
  });
});
