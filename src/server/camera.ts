/**
 * The frame camera: takes a picture of any frame of a film, using the Chrome or Edge already on the
 * computer, hidden (headless). Note pictures use it now; the renderer will build on it later.
 */
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { marksSvg } from "../shared/marks.ts";
import type { NoteShape } from "../shared/types.ts";

declare global {
  interface Window {
    /** Added by the Kairos bridge (src/film/bridge.js). */
    __kairos?: { render(t: number): Promise<void> };
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

export interface CaptureRequest {
  /** Address of the film page on the film server. */
  url: string;
  width: number;
  height: number;
  t: number;
  shapes?: readonly NoteShape[];
  /** Longest side of the picture, in pixels. Pictures are never bigger than the film. */
  maxSide?: number;
}

export class Camera {
  readonly browser: BrowserInfo | null;
  readonly #idleMs: number;
  #running: Promise<Browser> | null = null;
  #idleTimer: NodeJS.Timeout | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(browser: BrowserInfo | null, idleMs = 60_000) {
    this.browser = browser;
    this.#idleMs = idleMs;
  }

  /** Takes a PNG picture of frame `t`, with the marks drawn on top. Pictures are taken one at a time. */
  capture(request: CaptureRequest): Promise<Buffer> {
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
      const launching = puppeteer.launch({
        executablePath: this.browser.path,
        headless: true,
        args: [
          "--no-first-run",
          "--no-default-browser-check",
          "--hide-scrollbars",
          "--mute-audio",
          // 3D films (WebGL): fall back to software drawing when the GPU can't be used. Only the
          // user's own films are opened here, so the warning about untrusted pages doesn't apply.
          "--enable-unsafe-swiftshader",
        ],
      });
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

  async #capture(request: CaptureRequest): Promise<Buffer> {
    clearTimeout(this.#idleTimer);
    const browser = await this.#launch();
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push((error as Error).message));
    try {
      const scale = Math.min(
        1,
        (request.maxSide ?? 1280) / Math.max(request.width, request.height),
      );
      await page.setViewport({
        width: request.width,
        height: request.height,
        deviceScaleFactor: scale,
      });
      await page.goto(request.url, { waitUntil: "load", timeout: 30_000 });
      try {
        await page.waitForFunction(() => typeof window.__kairos?.render === "function", {
          timeout: 10_000,
        });
        await page.evaluate((t) => window.__kairos?.render(t), request.t);
      } catch (error) {
        const reason = pageErrors[0] ?? (error as Error).message;
        throw new Error(`The film could not draw this frame: ${reason}`);
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
      return Buffer.from(await page.screenshot({ type: "png" }));
    } finally {
      await page.close().catch(() => undefined);
      this.#idleTimer = setTimeout(() => void this.close(), this.#idleMs);
      this.#idleTimer.unref();
    }
  }
}
