import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LAYOUTS } from "../../templates/blocky/blocky/layouts.js";
import { planStory } from "../../templates/blocky/blocky/timing.js";
import { voiceLinesFrom } from "../../templates/blocky/blocky/voice.js";
import { clipBox } from "../shared/clips.ts";
import { showingQuery, withQuery } from "../shared/export.ts";
import { FilmConfigSchema } from "../shared/types.ts";
import { Camera, CannotReshape, findBrowser, launchHeadless, openFilm } from "./camera.ts";
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
    const template = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      template,
      { title: "Blocky Voices", shape: "wide" },
      { size: { width: 640, height: 360 }, duration: 18 },
    );
    const dir = join(filmsDir, id);
    const { SHOTS } = await import(pathToFileURL(join(dir, "story.js")).href);
    // The whole narration in one voice line, said slowly: a word every 0.6 s.
    const text = (SHOTS as { say?: string }[])
      .map((shot) => (shot.say ?? "").replaceAll("*", ""))
      .filter(Boolean)
      .join(" ");
    const words = text
      .split(/\s+/)
      .map((word, i) => ({ text: word, start: 0.1 + i * 0.6, end: 0.5 + i * 0.6 }));
    const made = [
      {
        id: "v1",
        speaker: "narrator",
        voiceId: "voice-narrator",
        voiceName: "Narrator",
        text,
        speed: 1,
        model: "s1",
        file: "voice/narrator-1.mp3",
        duration: words.length * 0.6 + 0.5,
        words,
        createdAt: "2026-11-20T00:00:00.000Z",
      },
    ];
    const script = {
      version: 1,
      lines: [{ id: "all", speaker: "narrator", text, start: 0, line: "v1" }],
    };
    const audio = [{ file: "voice/narrator-1.mp3", start: 0 }];
    await mkdir(join(dir, "voice"));
    await writeFile(join(dir, "voice", "narrator-1.mp3"), "");
    await writeFile(
      join(dir, "voice", "lines.json"),
      JSON.stringify({ version: 1, lines: made, next: {} }),
    );
    await writeFile(join(dir, "voice", "script.json"), JSON.stringify(script));
    const config = JSON.parse(await readFile(join(dir, "kairos.json"), "utf8"));
    await writeFile(join(dir, "kairos.json"), JSON.stringify({ ...config, audio }));

    const plain = planStory(SHOTS).duration;
    const expected = planStory(SHOTS, voiceLinesFrom({ audio }, script, made)).duration;
    // The voice is slower than the words would be without it: the story gets longer.
    expect(expected).toBeGreaterThan(plain + 3);

    const { length } = await camera.captureFrame({
      url: `http://127.0.0.1:${port}/${id}/index.html`,
      width: 640,
      height: 360,
      t: 5,
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

  it("catches a prop without a real size and a pose past a joint's limit on the sheets", async () => {
    const template = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      template,
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

  it("catches a wrong effect and a walk to nowhere on the effects and moves sheets", async () => {
    const template = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
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
    const storyFile = join(dir, "story.js");
    const story = await readFile(storyFile, "utf8");
    const punch = 'act: { theo: { punch: "milo", at: "all.", hard: true } },';
    expect(story).toContain(punch);
    await writeFile(
      storyFile,
      story.replace(punch, `${punch} fx: [{ sparkle: true }, { punch: true, at: "everything" }],`),
    );
    expect((await sheet("effects")).checks).toEqual([
      expect.stringContaining('Shot 4: "sparkle" isn\'t an effect.'),
      expect.stringContaining(
        'Shot 4: punch is on "everything", but the shot doesn\'t say that word.',
      ),
    ]);
    // A walk to a spot the place doesn't have.
    await writeFile(
      storyFile,
      story.replace('go: { milo: "pillow" },', 'go: { milo: "kitchen" },'),
    );
    expect((await sheet("moves")).checks).toEqual([
      expect.stringContaining('Shot 6: Milo can\'t go to "kitchen": home has center, left, right'),
      // What depended on the walk says so too.
      expect.stringContaining("Shot 6: Milo is too far from the pillow to pick it up"),
      expect.stringContaining("Shot 7: Milo throws, but holds nothing"),
    ]);
  }, 240_000);

  it("draws Blocky's sheets without problems, and the same frames in any order in any browser", async () => {
    const template = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      template,
      { title: "Blocky check", shape: "tall" },
      { size: { width: 360, height: 640 } },
    );
    // Every sheet, and the Places sheet for every place (each in day, evening and night, with its physics checked).
    const pages = [
      ...["cast", "poses", "props", "effects", "moves"].map((name) => `sheet=${name}`),
      ...Object.keys(LAYOUTS).map((place) => `sheet=places&place=${place}`),
    ];
    for (const name of pages) {
      const { checks } = await camera.captureFrame({
        url: `http://127.0.0.1:${port}/${id}/sheet.html?${name}`,
        width: 1920,
        height: 1080,
        t: 0,
        maxSide: 960,
      });
      expect({ name, checks }).toEqual({ name, checks: [] });
    }
    // Two render workers: separate browsers, the same frames drawn in different orders, one page each (as a
    // worker draws its chunk). The physics, the falls and the camera's choices come out the same: the pictures match
    // to within 2 levels out of 255 (the graphics card's own rounding at a few edges).
    const times = [3.4, 10.5, 12.4, 19.3];
    const drawIn = async (order: number[]) => {
      const browserInfo = findBrowser();
      if (!browserInfo) throw new Error("no browser");
      const worker = await launchHeadless(browserInfo);
      try {
        const page = await worker.newPage();
        const film = await openFilm(page, `http://127.0.0.1:${port}/${id}/`, 360, 640);
        const pictures = new Map<number, number[]>();
        for (const t of order) {
          await film.draw(t);
          // The 3D picture and the captions over it, as numbers.
          const pixels = await page.evaluate(() => {
            const out = document.createElement("canvas");
            out.width = 360;
            out.height = 640;
            const ctx = out.getContext("2d") as CanvasRenderingContext2D;
            for (const layer of document.querySelectorAll("canvas"))
              ctx.drawImage(layer, 0, 0, 360, 640);
            return Array.from(ctx.getImageData(0, 0, 360, 640).data);
          });
          pictures.set(t, pixels);
        }
        return pictures;
      } finally {
        await worker.close();
      }
    };
    const forward = await drawIn(times);
    const backward = await drawIn([...times].reverse());
    for (const t of times) {
      const a = forward.get(t) as number[];
      const b = backward.get(t) as number[];
      let most = 0;
      for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
      expect({ t, most }).toEqual({ t, most: expect.any(Number) });
      expect(most, `frame at ${t} s`).toBeLessThanOrEqual(2);
    }
  }, 300_000);

  it("shows a Blocky film in another shape, and refuses a film that can't reframe itself", async () => {
    const blocky = fileURLToPath(new URL("../../templates/blocky/", import.meta.url));
    const id = await createFilm(
      filmsDir,
      blocky,
      { title: "Shape check", shape: "tall" },
      { size: { width: 360, height: 640 } },
    );
    // Asked for wide, the tall film draws itself wide: both its layers at 640 × 360.
    const browserInfo = findBrowser();
    if (!browserInfo) throw new Error("no browser");
    const worker = await launchHeadless(browserInfo);
    /** How much the 2D layer (captions and extras) covers, and the film's caption words. */
    const look = () => {
      const layer = document.querySelector(".film-2d") as HTMLCanvasElement;
      const data = (layer.getContext("2d") as CanvasRenderingContext2D).getImageData(
        0,
        0,
        layer.width,
        layer.height,
      ).data;
      let covered = 0;
      for (let i = 3; i < data.length; i += 4) covered += (data[i] ?? 0) > 0 ? 1 : 0;
      const words = (window as { KAIROS_CAPTIONS?: { text: string }[] }).KAIROS_CAPTIONS;
      return { covered, words: words?.length ?? 0 };
    };
    try {
      const page = await worker.newPage();
      const url = withQuery(
        `http://127.0.0.1:${port}/${id}/`,
        showingQuery({ size: { width: 640, height: 360 } }),
      );
      const film = await openFilm(page, url, 640, 360);
      await film.draw(3.4);
      expect(
        await page.evaluate(() => ({
          reshape: (window as { KAIROS_RESHAPE?: unknown }).KAIROS_RESHAPE,
          size: window.__kairos?.size,
          layers: [...document.querySelectorAll("canvas")].map((c) => [c.width, c.height]),
        })),
      ).toEqual({
        reshape: true,
        size: { width: 640, height: 360 },
        layers: [
          [640, 360],
          [640, 360],
        ],
      });
      // It gives its caption words (for subtitles), and leaves the captions out of the picture when asked.
      const shown = await page.evaluate(look);
      const bare = await worker.newPage();
      const off = await openFilm(
        bare,
        withQuery(`http://127.0.0.1:${port}/${id}/`, showingQuery({ captions: false })),
        360,
        640,
      );
      await off.draw(3.4);
      const left = await bare.evaluate(look);
      expect(shown.words).toBeGreaterThan(10);
      expect(left.words).toBe(shown.words);
      expect(shown.covered).toBeGreaterThan(500);
      expect(left.covered).toBeLessThan(shown.covered / 4);
    } finally {
      await worker.close();
    }
    // The camera takes it in that shape.
    const png = await camera.capture({
      url: withQuery(
        `http://127.0.0.1:${port}/${id}/`,
        showingQuery({ size: { width: 640, height: 360 } }),
      ),
      width: 640,
      height: 360,
      t: 3.4,
      maxSide: 640,
      reshaped: true,
    });
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([640, 360]);

    // A film that doesn't say it reframes itself is refused, in plain words.
    const starter = fileURLToPath(new URL("../../templates/starter/", import.meta.url));
    const plain = await createFilm(filmsDir, starter, { title: "Plain shape", shape: "wide" });
    await expect(
      camera.capture({
        url: withQuery(
          `http://127.0.0.1:${port}/${plain}/`,
          showingQuery({ size: { width: 1080, height: 1920 } }),
        ),
        width: 360,
        height: 640,
        t: 0,
        reshaped: true,
      }),
    ).rejects.toThrow(CannotReshape);
  }, 240_000);

  it("draws with the processor when the graphics card is turned off", async () => {
    const browserInfo = findBrowser();
    if (!browserInfo) throw new Error("no browser");
    const drawer = async (gpu: boolean) => {
      const hidden = await launchHeadless(browserInfo, { gpu });
      try {
        const page = await hidden.newPage();
        return await page.evaluate(() => {
          const gl = document.createElement("canvas").getContext("webgl2");
          const info = gl?.getExtension("WEBGL_debug_renderer_info");
          return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "none";
        });
      } finally {
        await hidden.close();
      }
    };
    // Off: software drawing (Blocky then picks its draft look).
    expect(await drawer(false)).toMatch(/swiftshader/i);
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
