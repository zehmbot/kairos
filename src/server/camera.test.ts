import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planShots } from "../../templates/blocky/blocky/timing.js";
import { voiceLinesFrom } from "../../templates/blocky/blocky/voice.js";
import { clipBox } from "../shared/clips.ts";
import { FilmConfigSchema } from "../shared/types.ts";
import { Camera, findBrowser } from "./camera.ts";
import { findFfmpeg } from "./ffmpeg.ts";
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

  it("plays a Blocky film to its voices, and says how long its story lasts", async () => {
    const blocky = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      blocky,
      { title: "Blocky Voices", shape: "wide" },
      { size: { width: 640, height: 360 }, duration: 18 },
    );
    const dir = join(filmsDir, id);
    // Grandpa Bo's "Made you look!" (the demo's `look` shot) is said from 20 s to 24 s.
    const made = [
      {
        id: "v1",
        speaker: "bo",
        voiceId: "voice-bo",
        voiceName: "Bo",
        text: "Made you look",
        speed: 1,
        model: "s1",
        file: "voice/bo-1.mp3",
        duration: 4,
        words: [
          { text: "Made", start: 0.1, end: 0.6 },
          { text: "you", start: 0.7, end: 1.1 },
          { text: "look!", start: 1.2, end: 3.6 },
        ],
        createdAt: "2026-11-20T00:00:00.000Z",
      },
    ];
    const script = {
      version: 1,
      lines: [{ id: "look", speaker: "bo", text: "Made you look!", start: 20, line: "v1" }],
    };
    const audio = [{ file: "voice/bo-1.mp3", start: 20 }];
    await mkdir(join(dir, "voice"));
    await writeFile(join(dir, "voice", "bo-1.mp3"), "");
    await writeFile(
      join(dir, "voice", "lines.json"),
      JSON.stringify({ version: 1, lines: made, next: {} }),
    );
    await writeFile(join(dir, "voice", "script.json"), JSON.stringify(script));
    const config = JSON.parse(await readFile(join(dir, "kairos.json"), "utf8"));
    await writeFile(join(dir, "kairos.json"), JSON.stringify({ ...config, audio }));

    const { SHOTS } = await import(pathToFileURL(join(dir, "story.js")).href);
    const plain = planShots(SHOTS).duration;
    const expected = planShots(SHOTS, voiceLinesFrom({ audio }, script, made)).duration;
    // The voice comes later than the shot would: the story gets longer.
    expect(expected).toBeGreaterThan(plain + 3);

    const { length } = await camera.captureFrame({
      url: `http://127.0.0.1:${port}/${id}/index.html`,
      width: 640,
      height: 360,
      t: 21,
    });
    expect(length).toBeCloseTo(expected, 3);
  }, 120_000);

  it.runIf(findFfmpeg())(
    "puts the film's video clips over the frame",
    async () => {
      const ffmpeg = findFfmpeg() ?? "";
      const dir = join(filmsDir, "clip-camera");
      await mkdir(dir);
      await writeFile(
        join(dir, "index.html"),
        `<!doctype html><html><body style="margin:0;background:#000"><script>window.renderOut = () => {};</script></body></html>`,
      );
      // A red picture in the top-right corner, from 1 s to 2 s.
      await new Promise<void>((resolve, reject) =>
        execFile(
          ffmpeg,
          [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=64x64",
            "-frames:v",
            "1",
          ].concat(join(dir, "red.png")),
          (error) => (error ? reject(error) : resolve()),
        ),
      );
      const config = FilmConfigSchema.parse({
        title: "Clips",
        width: 320,
        height: 180,
        duration: 3,
        video: [{ file: "red.png", start: 1, length: 1, size: 0.25, x: 0.8, y: 0.2 }],
      });
      await writeFile(join(dir, "kairos.json"), JSON.stringify(config));
      const shot = (t: number) =>
        camera.capture({
          url: `http://127.0.0.1:${port}/clip-camera/index.html`,
          width: 320,
          height: 180,
          t,
          film: { dir, config },
        });
      /** The color at (x, y) of a PNG, read with ffmpeg. */
      const pixel = (png: Buffer, x: number, y: number) =>
        new Promise<number[]>((resolve, reject) => {
          const child = execFile(
            ffmpeg,
            ["-v", "error", "-i", "-", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            { encoding: "buffer", maxBuffer: 1 << 24 },
            (error, stdout) => {
              if (error) return reject(error);
              const at = (y * 320 + x) * 3;
              resolve([stdout[at] ?? 0, stdout[at + 1] ?? 0, stdout[at + 2] ?? 0]);
            },
          );
          child.stdin?.end(png);
        });
      const box = clipBox({ size: 0.25, x: 0.8, y: 0.2 }, 320, 180);
      const [cx, cy] = [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
      const red = ([r, g, b]: number[]) => (r ?? 0) > 200 && (g ?? 0) < 50 && (b ?? 0) < 50;
      expect(red(await pixel(await shot(1.5), cx, cy))).toBe(true);
      expect(red(await pixel(await shot(0.5), cx, cy))).toBe(false);
      expect(red(await pixel(await shot(1.5), 20, 160))).toBe(false);
    },
    60_000,
  );

  it("draws Blocky sheets and their checks catch sizes and joints", async () => {
    const blocky = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      blocky,
      { title: "Sheets", shape: "wide" },
      { size: { width: 640, height: 360 } },
    );
    const dir = join(filmsDir, id);
    const sheet = (name: string) =>
      camera.captureFrame({
        url: `http://127.0.0.1:${port}/${id}/sheet.html?sheet=${name}`,
        width: 1920,
        height: 1080,
        t: 0,
        maxSide: 960,
      });
    // The template's own sheets have no problems.
    for (const name of ["cast", "poses", "props", "places"]) {
      const { png, checks } = await sheet(name);
      expect(png.readUInt32BE(16)).toBe(960);
      expect({ name, checks }).toEqual({ name, checks: [] });
    }

    // A prop without a real size, and a pose that bends an elbow past its limit, are caught.
    const props = join(dir, "blocky", "props.js");
    const propsCode = await readFile(props, "utf8");
    await writeFile(
      props,
      propsCode.replace(
        "export const PROPS = {",
        'export const PROPS = {\n  rock: () => block(4, 4, 4, "#888888"),',
      ),
    );
    const poses = join(dir, "blocky", "poses.js");
    const posesCode = await readFile(poses, "utf8");
    await writeFile(
      poses,
      posesCode.replace(
        "export const POSES = {",
        "export const POSES = {\n  bend: (u, p) => ({ ...base(u, p), elbowR: 3.1 }),",
      ),
    );
    expect((await sheet("props")).checks).toEqual([
      expect.stringContaining("rock has no real size in sizes.js"),
    ]);
    expect((await sheet("poses")).checks).toEqual([
      expect.stringContaining("bend: elbowR asks 3.10, past the joint's limit (0 to 2.6)"),
    ]);
  }, 180_000);

  it("draws Blocky Story's sheets, effects and moves included, and catches a wrong effect and walk", async () => {
    const template = fileURLToPath(new URL("../../templates/blocky-story/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      template,
      { title: "Story sheets", shape: "tall" },
      { size: { width: 360, height: 640 } },
    );
    const dir = join(filmsDir, id);
    const sheet = (name: string) =>
      camera.captureFrame({
        url: `http://127.0.0.1:${port}/${id}/sheet.html?sheet=${name}`,
        width: 1920,
        height: 1080,
        t: 0,
        maxSide: 960,
      });
    for (const name of ["cast", "poses", "props", "places", "effects", "moves"]) {
      const { checks } = await sheet(name);
      expect({ name, checks }).toEqual({ name, checks: [] });
    }
    // The film itself: it times its story and places its effect sounds.
    const frame = await camera.captureFrame({
      url: `http://127.0.0.1:${port}/${id}/`,
      width: 360,
      height: 640,
      t: 3,
    });
    expect(frame.length).toBeGreaterThan(20);

    const storyFile = join(dir, "story.js");
    const story = await readFile(storyFile, "utf8");
    await writeFile(
      storyFile,
      story.replace(
        'fx: [{ punch: true, at: "secret" }],',
        'fx: [{ sparkle: true }, { punch: true, at: "secrets" }],',
      ),
    );
    expect((await sheet("effects")).checks).toEqual([
      expect.stringContaining('Shot 2: "sparkle" isn\'t an effect.'),
      expect.stringContaining(
        'Shot 2: punch is on "secrets", but the shot doesn\'t say that word.',
      ),
    ]);
    // A walk to a spot the place doesn't have.
    await writeFile(storyFile, story.replace('go: { milo: "sofaR" },', 'go: { milo: "kitchen" },'));
    expect((await sheet("moves")).checks).toEqual([
      expect.stringContaining('Shot 4: Milo can\'t go to "kitchen": home has center, left, right'),
    ]);
  }, 240_000);

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
