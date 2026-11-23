/**
 * The render queue: turns films into MP4 files, one film at a time.
 *
 * A film's frames are split into chunks of a few seconds. A few workers, each with its own hidden browser
 * at the film's exact size, take chunks from a shared list: for every frame they call
 * `window.__kairos.render(t)` (the same path as the preview), take a PNG and stream it into their own
 * ffmpeg process, which writes one video chunk. At the end ffmpeg joins the chunks without encoding again.
 * Frames stream straight through, so memory stays flat however long the film is.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { cpus, freemem } from "node:os";
import { dirname, join } from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { clipBox, clipLength, drawOrder, isPicture } from "../shared/clips.ts";
import { duckExpression, talkSpans, voiceSpans } from "../shared/duck.ts";
import { exportSize, isReshaped, shapeOf, showingQuery, withQuery } from "../shared/export.ts";
import { frameCount, timeOf } from "../shared/frames.ts";
import { subtitleCues, type TimedWord, timelineWords, toSrt } from "../shared/subtitles.ts";
import type {
  ExportInfo,
  FilmShape,
  RenderEncoder,
  RenderFit,
  RenderJob,
  RenderQuality,
} from "../shared/types.ts";
import { type BrowserInfo, launchHeadless, type OpenFilm, openFilm } from "./camera.ts";
import {
  chunkArgs,
  concatLine,
  FfmpegStuck,
  joinArgs,
  type OverlayClip,
  probeMedia,
  runFfmpeg,
  type SoundTrack,
} from "./ffmpeg.ts";
import { type Film, readFilm } from "./films.ts";
import { addRender, nextVersion, RENDERS_DIR, subtitlesFileOf, videoName } from "./renders.ts";
import type { Studio } from "./studio.ts";
import { readLines, readWords } from "./voices.ts";
import { resolveInside } from "./workspace.ts";

/** A render can't start. The message is shown to the user as-is. */
export class RenderError extends Error {}

export interface Chunk {
  index: number;
  /** First frame (from 0). */
  from: number;
  /** One past the last frame. */
  to: number;
}

/** Splits frames [0, total) into chunks of about `seconds`. */
export function planChunks(total: number, fps: number, seconds = 4): Chunk[] {
  const size = Math.max(1, Math.round(fps * seconds));
  const chunks: Chunk[] = [];
  for (let from = 0; from < total; from += size) {
    chunks.push({ index: chunks.length, from, to: Math.min(total, from + size) });
  }
  return chunks;
}

/** Free memory each worker needs: a whole hidden browser drawing the film, and its encoder. */
const WORKER_MEMORY = 1.5 * 1024 ** 3;

/**
 * About one worker per three CPU cores and one per 1.5 GB of free memory, between 1 and 4: each one runs its own
 * hidden browser and encoder, so a computer with little memory gets fewer.
 */
export const workerCount = (cores = cpus().length, free = freemem()) =>
  Math.max(1, Math.min(4, Math.floor(cores / 3), Math.floor(free / WORKER_MEMORY)));

/** The encoder to use: the first working one (graphics cards come first), or the CPU one only. */
export function pickEncoder(info: ExportInfo, gpu: boolean): RenderEncoder | null {
  return info.encoders.find((encoder) => gpu || !encoder.gpu)?.id ?? null;
}

const chunkFile = (chunk: Chunk) => `chunk-${String(chunk.index).padStart(5, "0")}.mp4`;

/** Keep this many ended jobs on the Renders page (failures need to stay readable). */
const KEEP_ENDED = 20;
const PROGRESS_EVERY_MS = 250;
/** Putting the video together normally takes seconds: when its output doesn't go forward for this long, it's stuck. */
const JOIN_STALL_MS = 60_000;

export interface RendererOptions {
  studio: Pick<Studio, "filmsDir" | "previewPath" | "events">;
  browser: BrowserInfo | null;
  /** Address of the film server, like `http://127.0.0.1:7342`. */
  filmServerUrl: string;
  /** ffmpeg and the encoders that work (probed once by the hub). */
  exportInfo: () => Promise<ExportInfo>;
  workers?: number;
  chunkSeconds?: number;
  /** The film's effect sounds (`window.KAIROS_SOUNDS`), read once its page is open: the Effects lane follows. */
  syncSounds?: (filmDir: string, sounds: unknown) => Promise<unknown>;
}

interface Active {
  job: RenderJob;
  cancelled: boolean;
  browsers: Set<Browser>;
  children: Set<ChildProcess>;
}

/** How a film's page is opened for a render: its address and the size it draws at. */
interface Showing {
  url: string;
  width: number;
  height: number;
}

/** The captions a film gives (`window.KAIROS_CAPTIONS`), checked: `[{ text, start, end }]`, or null. */
export function filmCaptions(raw: unknown): TimedWord[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(
      (word): word is TimedWord =>
        typeof word?.text === "string" && Number.isFinite(word.start) && Number.isFinite(word.end),
    )
    .slice(0, 50_000)
    .map((word) => ({ text: word.text.slice(0, 200), start: word.start, end: word.end }));
}

/** The words the film's sounds say on its clock (every unmuted sound on the timeline with word timings). */
async function soundWords(
  filmDir: string,
  tracks: readonly { file: string; start: number; muted?: boolean; sfx?: boolean }[],
): Promise<TimedWord[]> {
  const words = new Map<string, TimedWord[]>();
  for (const track of tracks) {
    if (track.muted || track.sfx || words.has(track.file)) continue;
    const file = await readWords(filmDir, track.file).catch(() => null);
    if (file) words.set(track.file, file.words);
  }
  return timelineWords(tracks, (file) => words.get(file));
}

/** How long each voice clip's file is: from the film's voice lines, else measured with ffprobe. */
async function voiceLengths(
  filmDir: string,
  tracks: readonly { file: string; length?: number; muted?: boolean }[],
  ffmpeg: string,
): Promise<{ file: string; duration: number }[]> {
  const lines = await readLines(filmDir).catch(() => []);
  const known = new Map(lines.map((line) => [line.file, line.duration]));
  for (const track of tracks) {
    if (track.muted || track.length !== undefined || known.has(track.file)) continue;
    if (!track.file.startsWith("voice/")) continue;
    const path = resolveInside(filmDir, track.file);
    const media = path ? await probeMedia(ffmpeg, path).catch(() => null) : null;
    if (media?.duration) known.set(track.file, media.duration);
  }
  return [...known].map(([file, duration]) => ({ file, duration }));
}

export class Renderer {
  readonly #options: RendererOptions;
  #jobs: RenderJob[] = [];
  #active: Active | null = null;
  #pumping = false;
  #lastProgress = 0;

  constructor(options: RendererOptions) {
    this.#options = options;
  }

  /** Queued, running and recently ended renders, oldest first. */
  jobs(): RenderJob[] {
    return this.#jobs.map((job) => ({ ...job }));
  }

  /** Puts a film in the queue. Throws RenderError when it can't be rendered. */
  async start(
    filmId: string,
    input: {
      quality: RenderQuality;
      gpu: boolean;
      shape?: FilmShape;
      fit?: "bars" | "crop";
      subtitles?: boolean;
      captions?: boolean;
    },
  ): Promise<RenderJob> {
    const info = await this.#options.exportInfo();
    if (!info.ffmpeg) {
      throw new RenderError(
        "Kairos needs ffmpeg to make videos, and it isn't installed. Install it (on Windows: winget install Gyan.FFmpeg), then restart Kairos.",
      );
    }
    const encoder = pickEncoder(info, input.gpu);
    if (!encoder) throw new RenderError("ffmpeg can't encode H.264 video on this computer.");
    if (!this.#options.browser) {
      throw new RenderError("Kairos could not find Chrome or Edge to draw the frames.");
    }
    const film = await this.#film(filmId);
    const config = film.config;
    if (!config) throw new RenderError(film.problem ?? "This film can't be read.");

    const job: RenderJob = {
      id: `r_${randomBytes(4).toString("hex")}`,
      filmId,
      title: config.title,
      state: "queued",
      quality: input.quality,
      encoder,
      gpu: input.gpu,
      shape: input.shape ?? null,
      fit: input.fit ?? "bars",
      subtitles: input.subtitles ?? false,
      captions: input.captions ?? true,
      done: 0,
      total: frameCount(config.duration, config.fps),
      queuedAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      error: null,
      version: null,
    };
    this.#jobs.push(job);
    this.#publish(job);
    void this.#pump();
    return { ...job };
  }

  /** Stops a render (or takes it out of the queue). Returns false for unknown or ended jobs. */
  cancel(jobId: string): boolean {
    const job = this.#jobs.find((entry) => entry.id === jobId);
    if (!job) return false;
    if (job.state === "queued") {
      this.#end(job, "cancelled", null);
      return true;
    }
    const active = this.#active;
    if (active?.job.id !== jobId || (job.state !== "running" && job.state !== "joining")) {
      return false;
    }
    active.cancelled = true;
    for (const child of active.children) child.kill();
    for (const browser of active.browsers) void browser.close().catch(() => undefined);
    return true;
  }

  /** Stops everything (when the hub shuts down). */
  async close(): Promise<void> {
    for (const job of this.#jobs) if (job.state === "queued") this.#end(job, "cancelled", null);
    if (this.#active) this.cancel(this.#active.job.id);
  }

  async #film(filmId: string): Promise<Film> {
    const dir = this.#options.studio.filmsDir;
    const film = dir ? await readFilm(dir, filmId) : null;
    if (!film) throw new RenderError("This film doesn't exist (any more).");
    if (film.problem) throw new RenderError(`Fix the film first: ${film.problem}`);
    return film;
  }

  async #pump(): Promise<void> {
    if (this.#pumping) return;
    this.#pumping = true;
    try {
      for (;;) {
        const job = this.#jobs.find((entry) => entry.state === "queued");
        if (!job) break;
        await this.#run(job);
      }
    } finally {
      this.#pumping = false;
    }
  }

  #publish(job: RenderJob): void {
    this.#lastProgress = Date.now();
    this.#options.studio.events.publish({ type: "render-progress", job: { ...job } });
  }

  #progress(job: RenderJob): void {
    if (Date.now() - this.#lastProgress >= PROGRESS_EVERY_MS) this.#publish(job);
  }

  #end(job: RenderJob, state: "done" | "failed" | "cancelled", error: string | null): void {
    job.state = state;
    job.error = error;
    job.endedAt = new Date().toISOString();
    this.#publish(job);
    const ended = this.#jobs.filter((entry) => entry.endedAt);
    for (const old of ended.slice(0, Math.max(0, ended.length - KEEP_ENDED))) {
      this.#jobs.splice(this.#jobs.indexOf(old), 1);
    }
  }

  async #run(job: RenderJob): Promise<void> {
    const active: Active = { job, cancelled: false, browsers: new Set(), children: new Set() };
    this.#active = active;
    const startedAt = Date.now();
    job.state = "running";
    job.startedAt = new Date(startedAt).toISOString();
    this.#publish(job);
    let partsDir: string | null = null;
    try {
      const film = await this.#film(job.filmId);
      const config = film.config;
      const path = this.#options.studio.previewPath(film);
      if (!config || !path) throw new RenderError("This film can't be read.");
      const info = await this.#options.exportInfo();
      const ffmpeg = info.ffmpeg?.path;
      if (!ffmpeg || !this.#options.browser)
        throw new RenderError("ffmpeg or the browser went missing.");

      job.total = frameCount(config.duration, config.fps);
      partsDir = join(film.path, RENDERS_DIR, ".parts", job.id);
      await mkdir(partsDir, { recursive: true });
      const chunks = planChunks(job.total, config.fps, this.#options.chunkSeconds);
      const url = `${this.#options.filmServerUrl}${path}`;
      const browserInfo = this.#options.browser;

      // The size it goes out at. In another shape, a film that reframes itself (window.KAIROS_RESHAPE) draws at that
      // size; any other film draws at its own and is fitted into it when the chunks are joined.
      const size = exportSize(config, job.shape);
      // Captions left out of the picture (their words go in the subtitles file) are asked for in the address too.
      const captions = job.captions;
      const own: Showing = {
        url: withQuery(url, showingQuery({ captions })),
        width: config.width,
        height: config.height,
      };
      const asked: Showing = { url: withQuery(url, showingQuery({ size, captions })), ...size };
      const reshaped = isReshaped(config, size);
      // The first page to open finds out which, and the other workers open theirs once it knows.
      let decide: (showing: Showing) => void = () => undefined;
      let undecided: (error: unknown) => void = () => undefined;
      const decided: Promise<Showing> = reshaped
        ? new Promise((resolve, reject) => {
            decide = resolve;
            undecided = reject;
          })
        : Promise.resolve(own);
      decided.catch(() => undefined);
      let showing = own;

      // Workers take chunks from a shared list. The first failure stops the others.
      let next = 0;
      // The first page open says which effect sounds the film places (before the sound is mixed), and the words
      // its captions show (for the subtitles).
      let soundsRead: Promise<unknown> | null = null;
      let captionsRead: Promise<TimedWord[] | null> | null = null;
      let failure: unknown = null;
      const dir = partsDir;
      const worker = async (index: number) => {
        // Each worker gets its own browser: one browser takes its screenshots one at a time,
        // so separate browsers render about 3x faster than windows of one browser.
        // Without the graphics card, the browser draws with the processor (films pick a lighter look).
        const browser = await launchHeadless(browserInfo, { gpu: job.gpu }).catch((error) => {
          if (index === 0) undecided(error);
          throw error;
        });
        active.browsers.add(browser);
        try {
          if (active.cancelled) return;
          const page = await browser.newPage();
          let view: OpenFilm;
          if (index === 0 && reshaped) {
            view = await openFilm(page, asked.url, asked.width, asked.height, 1);
            const reframes = await page
              .evaluate(() => (window as { KAIROS_RESHAPE?: unknown }).KAIROS_RESHAPE === true)
              .catch(() => false);
            showing = reframes ? asked : own;
            if (!reframes) view = await openFilm(page, own.url, own.width, own.height, 1);
            decide(showing);
          } else {
            const how = await decided;
            view = await openFilm(page, how.url, how.width, how.height, 1);
          }
          soundsRead ??= page
            .evaluate(() => (window as { KAIROS_SOUNDS?: unknown }).KAIROS_SOUNDS ?? null)
            .then((sounds) =>
              Array.isArray(sounds) ? this.#options.syncSounds?.(film.path, sounds) : null,
            )
            .catch(() => null);
          captionsRead ??= page
            .evaluate(() => (window as { KAIROS_CAPTIONS?: unknown }).KAIROS_CAPTIONS ?? null)
            .then(filmCaptions)
            .catch(() => null);
          for (;;) {
            const chunk = chunks[next++];
            if (!chunk || active.cancelled) break;
            await this.#renderChunk(active, page, view, chunk, {
              ffmpeg,
              output: join(dir, chunkFile(chunk)),
              fps: config.fps,
              width: showing.width,
              height: showing.height,
            });
          }
        } catch (error) {
          if (!failure && !active.cancelled) failure = error;
          active.cancelled = true;
          for (const child of active.children) child.kill();
        } finally {
          // Workers waiting on the first page never wait for nothing (after it decided, this does nothing).
          if (index === 0) undecided(new RenderError("The render stopped."));
          await browser.close().catch(() => undefined);
          active.browsers.delete(browser);
        }
      };
      const count = Math.min(this.#options.workers ?? workerCount(), chunks.length);
      await Promise.all(Array.from({ length: count }, (_, index) => worker(index)));
      if (failure) throw failure;
      if (active.cancelled) {
        this.#end(job, "cancelled", null);
        return;
      }

      // Join the chunks into the final video.
      job.state = "joining";
      this.#publish(job);
      const list = join(dir, "chunks.txt");
      await writeFile(
        list,
        chunks.map((chunk) => concatLine(join(dir, chunkFile(chunk)))).join("\n"),
      );
      const joined = join(dir, "joined.mp4");
      // The film's sound tracks are mixed in here (readFilm already checked they exist). Muted ones are left out.
      // Read again: the effect sounds may have just been brought in step.
      await soundsRead;
      const sound =
        (await readFilm(this.#options.studio.filmsDir ?? "", job.filmId))?.config ?? config;
      // Music under the narration gets quieter while the voices talk (the same curve as the preview).
      const duck = sound.audio.some((track) => track.duck && !track.muted)
        ? duckExpression(
            talkSpans(voiceSpans(sound.audio, await voiceLengths(film.path, sound.audio, ffmpeg))),
          )
        : undefined;
      const tracks: SoundTrack[] = sound.audio.flatMap((track) => {
        const file = track.muted ? null : resolveInside(film.path, track.file);
        return file
          ? [
              {
                path: file,
                start: track.start,
                volume: track.volume,
                from: track.from,
                length: track.length,
                loop: track.loop,
                duck: track.duck ? duck : undefined,
              },
            ]
          : [];
      });
      // How the video got its shape; a film that didn't reframe is fitted into the size asked for.
      const fit: RenderFit = !reshaped ? "own" : showing === asked ? "reframe" : job.fit;
      const frame = fit === "bars" || fit === "crop" ? { ...size, fit } : undefined;
      // Video clips are drawn over the film (at the size it was drawn), in track order; a video's own sound joins
      // the mix.
      const clips: OverlayClip[] = [];
      for (const clip of drawOrder(config.video)) {
        const path = resolveInside(film.path, clip.file);
        if (!path) continue;
        const picture = isPicture(clip.file);
        const media = picture ? null : await probeMedia(ffmpeg, path);
        const length = clipLength(clip, media?.duration ?? undefined);
        const shown = Math.min(length ?? config.duration, config.duration - clip.start);
        if (shown <= 0) continue;
        clips.push({
          path,
          picture,
          start: clip.start,
          length: shown,
          from: clip.from,
          box: clipBox(clip, showing.width, showing.height),
          fit: clip.fit,
          opacity: clip.opacity,
          fade: clip.fade,
        });
        if (media?.hasAudio && !clip.muted && clip.volume > 0) {
          tracks.push({
            path,
            start: clip.start,
            volume: clip.volume,
            from: clip.from,
            length: shown,
          });
        }
      }
      const args = joinArgs(
        list,
        joined,
        { tracks, duration: config.duration },
        {
          clips,
          encoding: { encoder: job.encoder, quality: job.quality, fps: config.fps },
          duration: config.duration,
          frame,
        },
      );
      // Cancel stops the join too. A join that gets stuck is stopped and runs again, once.
      for (let attempt = 1; ; attempt++) {
        if (active.cancelled) {
          this.#end(job, "cancelled", null);
          return;
        }
        try {
          await runFfmpeg(ffmpeg, args, {
            stallMs: JOIN_STALL_MS,
            started: (child) => {
              active.children.add(child);
              child.once("close", () => active.children.delete(child));
              if (active.cancelled) child.kill();
            },
          });
          break;
        } catch (error) {
          if (!(error instanceof FfmpegStuck) || active.cancelled) throw error;
          if (attempt === 2) {
            throw new RenderError(
              "Putting the video together got stuck twice, so Kairos stopped it. Render again.",
            );
          }
        }
      }
      const version = await nextVersion(film.path, film.id);
      const shape = shapeOf(size);
      const name = videoName(film.id, version, reshaped ? shape : null);
      await rename(joined, join(film.path, RENDERS_DIR, name));
      // Subtitles: the words the film's captions show, else what its sounds say; none when there are no words.
      let subtitles: string | null = null;
      if (job.subtitles) {
        const words = (await captionsRead) ?? (await soundWords(film.path, sound.audio));
        const cues = subtitleCues(words.filter((word) => word.start < config.duration));
        if (cues.length > 0) {
          subtitles = subtitlesFileOf(`${RENDERS_DIR}/${name}`);
          await writeFile(join(film.path, subtitles), toSrt(cues), "utf8");
        }
      }
      await addRender(film.path, {
        version,
        file: `${RENDERS_DIR}/${name}`,
        createdAt: new Date().toISOString(),
        quality: job.quality,
        encoder: job.encoder,
        width: size.width,
        height: size.height,
        shape,
        fit,
        ...(job.subtitles ? { subtitles } : {}),
        ...(job.captions ? {} : { captions: false }),
        fps: config.fps,
        duration: config.duration,
        frames: job.total,
        bytes: (await stat(join(film.path, RENDERS_DIR, name))).size,
        seconds: Math.round((Date.now() - startedAt) / 100) / 10,
      });
      job.version = version;
      this.#end(job, "done", null);
      this.#options.studio.events.publish({ type: "renders-changed", id: film.id });
    } catch (error) {
      if (active.cancelled && !(error instanceof RenderError)) this.#end(job, "cancelled", null);
      else this.#end(job, "failed", (error as Error).message);
    } finally {
      await Promise.all(
        [...active.browsers].map((browser) => browser.close().catch(() => undefined)),
      );
      if (partsDir) await rm(partsDir, { recursive: true, force: true }).catch(() => undefined);
      // The shared .parts folder goes too once no render uses it (rmdir only removes empty folders).
      if (partsDir) await rmdir(dirname(partsDir)).catch(() => undefined);
      this.#active = null;
    }
  }

  /** Draws the chunk's frames and streams them into a new ffmpeg process. */
  async #renderChunk(
    active: Active,
    page: Page,
    view: OpenFilm,
    chunk: Chunk,
    encoding: { ffmpeg: string; output: string; fps: number; width: number; height: number },
  ): Promise<void> {
    const job = active.job;
    const child = spawn(
      encoding.ffmpeg,
      chunkArgs({
        encoder: job.encoder,
        quality: job.quality,
        fps: encoding.fps,
        width: encoding.width,
        height: encoding.height,
        output: encoding.output,
      }),
      { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );
    active.children.add(child);
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-4000);
    });
    // If ffmpeg stops early, writing fails with EPIPE: the exit code below explains why.
    child.stdin?.on("error", () => undefined);
    const exited = new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
      child.on("error", () => resolve(-1));
    });

    try {
      for (let frame = chunk.from; frame < chunk.to && !active.cancelled; frame++) {
        const t = timeOf(frame, encoding.fps);
        try {
          await view.draw(t);
        } catch (error) {
          const reason = (error as Error).message.replace(
            /^The film could not draw this frame: /,
            "",
          );
          throw new RenderError(
            `The film could not draw frame ${frame + 1} (${Number(t.toFixed(2))} s): ${reason}`,
          );
        }
        const png = await page.screenshot({ type: "png", optimizeForSpeed: true });
        const stdin = child.stdin;
        if (stdin && !stdin.write(png)) {
          await Promise.race([once(stdin, "drain"), exited]);
        }
        job.done++;
        this.#progress(job);
      }
    } finally {
      child.stdin?.end();
    }
    const code = await exited;
    active.children.delete(child);
    if (!active.cancelled && code !== 0) {
      throw new RenderError(
        `ffmpeg could not encode the video: ${stderr.trim() || `exit ${code}`}`,
      );
    }
  }
}
