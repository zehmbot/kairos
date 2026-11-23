/**
 * The frame camera: takes a picture of any frame of a film, using the Chrome or Edge already on the
 * computer, hidden (headless). The renderer uses the same launch and the same way of drawing a frame.
 */
import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { marksSvg } from "../shared/marks.ts";
import type { FilmConfig, NoteShape } from "../shared/types.ts";
import { clipImagesAt } from "./clips.ts";

declare global {
  interface Window {
    /**
     * Added by the Kairos bridge (src/film/bridge.js): draws a frame, and says the size the film is asked to draw
     * at (null: its own) and whether to draw its captions (src/shared/export.ts).
     */
    __kairos?: {
      render(t: number): Promise<void>;
      size: { width: number; height: number } | null;
      captions: boolean;
    };
  }
}

export interface BrowserInfo {
  name: string;
  path: string;
}

/** Where Chrome, Edge and Chromium usually live, in the order Kairos prefers them. */
export function browserCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): BrowserInfo[] {
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(
      (root): root is string => Boolean(root),
    );
    return [
      ...roots.map((root) => ({
        name: "Google Chrome",
        path: `${root}\\Google\\Chrome\\Application\\chrome.exe`,
      })),
      ...roots.map((root) => ({
        name: "Microsoft Edge",
        path: `${root}\\Microsoft\\Edge\\Application\\msedge.exe`,
      })),
    ];
  }
  if (platform === "darwin") {
    return [
      {
        name: "Google Chrome",
        path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      {
        name: "Microsoft Edge",
        path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      },
      { name: "Chromium", path: "/Applications/Chromium.app/Contents/MacOS/Chromium" },
    ];
  }
  return [
    { name: "Google Chrome", path: "/usr/bin/google-chrome" },
    { name: "Google Chrome", path: "/usr/bin/google-chrome-stable" },
    { name: "Chromium", path: "/usr/bin/chromium" },
    { name: "Chromium", path: "/usr/bin/chromium-browser" },
    { name: "Chromium", path: "/snap/bin/chromium" },
    { name: "Microsoft Edge", path: "/usr/bin/microsoft-edge" },
  ];
}

/** The browser to use: `KAIROS_BROWSER` if set, else the first one installed. */
export function findBrowser(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): BrowserInfo | null {
  if (env.KAIROS_BROWSER) {
    return exists(env.KAIROS_BROWSER) ? { name: "Custom browser", path: env.KAIROS_BROWSER } : null;
  }
  return browserCandidates(platform, env).find((candidate) => exists(candidate.path)) ?? null;
}

/**
 * Starts the browser hidden. The camera and the renderer each start their own. `gpu: false` turns the graphics card
 * off: everything is drawn by the processor (a render where you chose not to use the card).
 */
export function launchHeadless(
  browser: BrowserInfo,
  { gpu = true }: { gpu?: boolean } = {},
): Promise<Browser> {
  return puppeteer.launch({
    executablePath: browser.path,
    headless: true,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--mute-audio",
      // 3D films (WebGL): fall back to software drawing when the GPU can't be used. Only the
      // user's own films are opened here, so the warning about untrusted pages doesn't apply.
      "--enable-unsafe-swiftshader",
      ...(gpu ? [] : ["--disable-gpu"]),
    ],
  });
}

/** A film page opened in the hidden browser, ready to draw frames. */
export interface OpenFilm {
  /** Draws the frame at `t` seconds. Throws "The film could not draw this frame: ..." on film errors. */
  draw(t: number): Promise<void>;
}

/**
 * Opens a film page at its exact size (`scale` shrinks the picture, not the page) and waits for the
 * Kairos bridge. Drawing goes through `window.__kairos.render(t)`, like the preview.
 */
export async function openFilm(
  page: Page,
  url: string,
  width: number,
  height: number,
  scale = 1,
): Promise<OpenFilm> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push((error as Error).message));
  const failed = (error: unknown) => {
    const reason = pageErrors[0] ?? (error as Error).message;
    return new Error(`The film could not draw this frame: ${reason}`);
  };
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  try {
    await page.waitForFunction(() => typeof window.__kairos?.render === "function", {
      timeout: 10_000,
    });
  } catch (error) {
    throw failed(error);
  }
  return {
    async draw(t) {
      try {
        await page.evaluate((time) => window.__kairos?.render(time), t);
      } catch (error) {
        throw failed(error);
      }
    },
  };
}

export interface CaptureRequest {
  /** Address of the film page on the film server. */
  url: string;
  width: number;
  height: number;
  t: number;
  shapes?: readonly NoteShape[];
  /** Longest side of the picture, in pixels. Pictures are never bigger than the film. */
  maxSide?: number;
  /** The film's folder and settings: its video clips are put over the frame (under the marks). */
  film?: { dir: string; config: Pick<FilmConfig, "video" | "width" | "height"> };
  /**
   * The address asks the film for another shape (`kairos-size`, src/shared/export.ts): only a film that reframes
   * itself (`window.KAIROS_RESHAPE`) can, and the picture is refused otherwise.
   */
  reshaped?: boolean;
}

/** The film can't draw itself in another shape. The message is shown as-is. */
export class CannotReshape extends Error {
  constructor() {
    super(
      "This film can't show itself in another shape: only a film that reframes itself (window.KAIROS_RESHAPE, like Blocky films) can. Its render in another shape gets bars or a crop.",
    );
  }
}

export class Camera {
  /** The browser pictures are taken with; Check again (the setup card) can find one later. */
  browser: BrowserInfo | null;
  readonly #idleMs: number;
  #running: Promise<Browser> | null = null;
  #idleTimer: NodeJS.Timeout | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  readonly #ffmpeg: () => Promise<string | null>;

  /** `ffmpeg` finds ffmpeg, for the frames of video clips (pictures need none). */
  constructor(
    browser: BrowserInfo | null,
    idleMs = 60_000,
    options: { ffmpeg?: () => Promise<string | null> } = {},
  ) {
    this.browser = browser;
    this.#idleMs = idleMs;
    this.#ffmpeg = options.ffmpeg ?? (async () => null);
  }

  /** Takes a PNG picture of frame `t`, with the marks drawn on top. Pictures are taken one at a time. */
  async capture(request: CaptureRequest): Promise<Buffer> {
    return (await this.captureFrame(request)).png;
  }

  /**
   * A picture, how long the film says its story lasts (`window.KAIROS_LENGTH`, null when it doesn't say) and the
   * problems the page found (`window.KAIROS_CHECKS`: a template's sheets).
   */
  captureFrame(
    request: CaptureRequest,
  ): Promise<{ png: Buffer; length: number | null; checks: string[] | null }> {
    const result = this.#queue.then(() => this.#capture(request));
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async close(): Promise<void> {
    clearTimeout(this.#idleTimer);
    const running = this.#running;
    this.#running = null;
    const browser = await running?.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  #launch(): Promise<Browser> {
    if (!this.browser) {
      return Promise.reject(new Error("Kairos could not find Chrome or Edge to take pictures."));
    }
    if (!this.#running) {
      const launching = launchHeadless(this.browser);
      this.#running = launching;
      launching.then(
        (browser) =>
          browser.on("disconnected", () => {
            if (this.#running === launching) this.#running = null;
          }),
        () => {
          if (this.#running === launching) this.#running = null;
        },
      );
    }
    return this.#running;
  }

  async #capture(
    request: CaptureRequest,
  ): Promise<{ png: Buffer; length: number | null; checks: string[] | null }> {
    clearTimeout(this.#idleTimer);
    const browser = await this.#launch();
    const page = await browser.newPage();
    try {
      const scale = Math.min(
        1,
        (request.maxSide ?? 1280) / Math.max(request.width, request.height),
      );
      const film = await openFilm(page, request.url, request.width, request.height, scale);
      if (request.reshaped) {
        const reframes = await page.evaluate(
          () => (window as { KAIROS_RESHAPE?: unknown }).KAIROS_RESHAPE === true,
        );
        if (!reframes) throw new CannotReshape();
      }
      await film.draw(request.t);
      const { length, checks } = await page.evaluate(() => {
        const page = window as { KAIROS_LENGTH?: unknown; KAIROS_CHECKS?: unknown };
        const value = Number(page.KAIROS_LENGTH);
        const list = page.KAIROS_CHECKS;
        return {
          length: Number.isFinite(value) && value > 0 ? value : null,
          checks: Array.isArray(list) ? list.slice(0, 200).map(String) : null,
        };
      });
      // Video clips over the film, as the preview and the render show them (the marks go over them).
      const clips = request.film?.config.video.length
        ? await clipImagesAt(
            request.film.dir,
            // Placed in the picture's own size (another shape places them as the preview does).
            { ...request.film.config, width: request.width, height: request.height },
            request.t,
            await this.#ffmpeg().catch(() => null),
          )
        : [];
      if (clips.length > 0) {
        await page.evaluate(async (list) => {
          const layer = document.createElement("div");
          layer.style.cssText =
            "position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:hidden;pointer-events:none;z-index:2147483646";
          for (const clip of list) {
            const img = document.createElement("img");
            img.src = clip.src;
            img.style.cssText = `position:absolute;left:${clip.box.left}px;top:${clip.box.top}px;width:${clip.box.width}px;height:${clip.box.height}px;object-fit:${clip.fit === "fill" ? "cover" : "contain"};opacity:${clip.opacity}`;
            layer.appendChild(img);
          }
          document.documentElement.appendChild(layer);
          await Promise.all(
            [...layer.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)),
          );
        }, clips);
      }
      if (request.shapes && request.shapes.length > 0) {
        const svg = marksSvg(request.shapes, request.width, request.height);
        await page.evaluate((markup) => {
          const holder = document.createElement("div");
          holder.innerHTML = markup;
          const layer = holder.firstElementChild;
          if (layer) document.documentElement.appendChild(layer);
        }, svg);
      }
      return { png: Buffer.from(await page.screenshot({ type: "png" })), length, checks };
    } finally {
      await page.close().catch(() => undefined);
      this.#idleTimer = setTimeout(() => void this.close(), this.#idleMs);
      this.#idleTimer.unref();
    }
  }
}
