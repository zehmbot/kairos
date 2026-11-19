import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  it("takes pictures of 3D films made with three.js", async () => {
    const dir = join(filmsDir, "three-test");
    await mkdir(dir);
    await writeFile(
      join(dir, "kairos.json"),
      JSON.stringify({ title: "Three", width: 640, height: 360, duration: 2 }),
    );
    await writeFile(
      join(dir, "index.html"),
      `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/__kairos/lib/three/build/three.module.js"}}</script></head><body style="margin:0"><script type="module" src="film.js"></script></body></html>`,
    );
    await writeFile(
      join(dir, "film.js"),
      `import * as THREE from "three";
const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
renderer.setSize(640, 360, false);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1a1c2c");
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 50);
camera.position.z = 4;
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshNormalMaterial());
scene.add(cube);
window.renderOut = (t) => { cube.rotation.set(t, t * 1.3, 0); renderer.render(scene, camera); };`,
    );
    const shot = (t: number) =>
      camera.capture({
        url: `http://127.0.0.1:${port}/three-test/index.html`,
        width: 640,
        height: 360,
        t,
      });
    const [first, second] = [await shot(1), await shot(1.5)];
    expect(first.readUInt32BE(16)).toBe(640);
    // A blank picture is a few hundred bytes, and stays the same whatever the time; the turning cube isn't.
    expect(first.length).toBeGreaterThan(1_500);
    expect(first.equals(second)).toBe(false);
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
