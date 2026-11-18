import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Camera, findBrowser } from "./camera.ts";
import { buildFilmServer } from "./film-server.ts";
import { createFilm } from "./films.ts";

describe("findBrowser", () => {
  const env = {
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\you\\AppData\\Local",
  };

  it("prefers Chrome, then Edge, on Windows", () => {
    const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    const chrome = "C:\\Users\\you\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
    expect(findBrowser("win32", env, (path) => path === edge)).toEqual({
      name: "Microsoft Edge",
      path: edge,
    });
    expect(findBrowser("win32", env, (path) => path === edge || path === chrome)).toEqual({
      name: "Google Chrome",
      path: chrome,
    });
  });

  it("knows the macOS and Linux places", () => {
    expect(findBrowser("darwin", {}, (path) => path.includes("Microsoft Edge.app"))?.name).toBe(
      "Microsoft Edge",
    );
    expect(findBrowser("linux", {}, (path) => path === "/usr/bin/chromium")?.name).toBe("Chromium");
    expect(findBrowser("linux", {}, () => false)).toBeNull();
  });

  it("uses KAIROS_BROWSER when it is set", () => {
    const custom = { KAIROS_BROWSER: "/opt/browser" };
    expect(findBrowser("linux", custom, () => true)).toEqual({
      name: "Custom browser",
      path: "/opt/browser",
    });
    expect(findBrowser("linux", custom, () => false)).toBeNull();
  });
});

const browser = findBrowser();

describe.runIf(browser)("Camera (real browser)", () => {
  const port = 7389;
  let filmsDir: string;
  let filmServer: FastifyInstance;
  let camera: Camera;

  beforeAll(async () => {
    filmsDir = await mkdtemp(join(tmpdir(), "kairos-camera-"));
    const templateDir = fileURLToPath(new URL("../../templates/starter/", import.meta.url));
    await createFilm(filmsDir, templateDir, { title: "Camera Test", shape: "wide" });
    filmServer = await buildFilmServer({ filmsDir: () => filmsDir, port, parentOrigins: [] });
    await filmServer.listen({ host: "127.0.0.1", port });
    camera = new Camera(browser, 5_000);
  });

  afterAll(async () => {
    await camera?.close();
    await filmServer?.close();
    await rm(filmsDir, { recursive: true, force: true });
  });

  it("takes a picture of a frame with the marks on top", async () => {
    const png = await camera.capture({
      url: `http://127.0.0.1:${port}/camera-test/index.html`,
      width: 1920,
      height: 1080,
      t: 2,
      shapes: [{ type: "box", x: 100, y: 100, w: 400, h: 300 }],
    });
    // A PNG, scaled so its longest side is 1280 px.
    expect([...png.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join("")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1280);
    expect(png.readUInt32BE(20)).toBe(720);
    expect(png.length).toBeGreaterThan(5_000);
  }, 60_000);

  it("explains when the film can't be drawn", async () => {
    await expect(
      camera.capture({
        url: `http://127.0.0.1:${port}/missing/index.html`,
        width: 640,
        height: 360,
        t: 0,
      }),
    ).rejects.toThrow("The film could not draw this frame");
  }, 60_000);
});
