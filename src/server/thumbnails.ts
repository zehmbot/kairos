/**
 * Film card pictures: one frame of the film, taken by the frame camera and kept in `.kairos/thumb.png`.
 * It is taken again when the film changes (its folder's newest file is newer than the picture).
 */
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.ts";
import { type Film, readFilm, scanFilms } from "./films.ts";

export const THUMB_FILE = join(".kairos", "thumb.png");

/** Where in the film the card picture is taken: 40% in, past most intros. */
export const thumbnailTime = (duration: number) => duration * 0.4;

const taking = new Map<string, Promise<Buffer>>();

/** The film's card picture, from the cache or freshly taken with `take`. */
export async function filmThumbnail(film: Film, take: () => Promise<Buffer>): Promise<Buffer> {
  const file = join(film.path, THUMB_FILE);
  const cached = await stat(file).catch(() => null);
  if (cached && cached.mtimeMs >= film.updatedAt) return readFile(file);

  // Several cards can ask at once: take the picture once.
  const running = taking.get(film.path);
  if (running) return running;
  const job = (async () => {
    const png = await take();
    await mkdir(join(film.path, ".kairos"), { recursive: true });
    await writeFileAtomic(file, png);
    return png;
  })();
  taking.set(film.path, job);
  try {
    return await job;
  } finally {
    taking.delete(film.path);
  }
}

export interface PictureKeeperOptions {
  /** The workspace's films folder now (null: none chosen). */
  filmsDir: () => string | null;
  /** Takes a film's picture (`filmThumbnail` keeps it; a fresh one isn't taken again). */
  take: (film: Film) => Promise<unknown>;
  /** Not now: Claude works on the film, or a render runs (they need the computer more). */
  busy: (filmId: string) => boolean;
  /** How long a film stays unchanged before its picture is taken again. */
  quietMs?: number;
}

/**
 * Takes film card pictures ahead of time, so the Films page shows them right away: films without one when the
 * workspace opens, and a film that changed once it has been quiet for a while. Not while Claude works on the film
 * or a render runs (it tries again later), and one at a time, in the background.
 */
export class PictureKeeper {
  #options: PictureKeeperOptions;
  #quietMs: number;
  #timers = new Map<string, NodeJS.Timeout>();
  #queue: string[] = [];
  #draining: Promise<void> | null = null;
  #closed = false;

  constructor(options: PictureKeeperOptions) {
    this.#options = options;
    this.#quietMs = options.quietMs ?? 20_000;
  }

  /** Every film that has no picture yet gets one. */
  async sweep(): Promise<void> {
    const dir = this.#options.filmsDir();
    if (!dir || this.#closed) return;
    for (const film of await scanFilms(dir)) {
      if (!film.config || film.problem) continue;
      const has = await stat(join(film.path, THUMB_FILE)).then(
        () => true,
        () => false,
      );
      if (!has) this.#enqueue(film.id);
    }
  }

  /** These films changed: each gets a new picture once it has stayed unchanged for a while. */
  changed(ids: readonly string[]): void {
    for (const id of ids) this.#later(id);
  }

  /** Resolves once nothing waits in the queue (tests). */
  async idle(): Promise<void> {
    while (this.#draining) await this.#draining;
  }

  close(): void {
    this.#closed = true;
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.#queue = [];
  }

  #later(id: string): void {
    if (this.#closed) return;
    clearTimeout(this.#timers.get(id));
    const timer = setTimeout(() => {
      this.#timers.delete(id);
      this.#enqueue(id);
    }, this.#quietMs);
    timer.unref?.();
    this.#timers.set(id, timer);
  }

  #enqueue(id: string): void {
    if (this.#closed || this.#queue.includes(id)) return;
    this.#queue.push(id);
    if (!this.#draining) {
      this.#draining = this.#drain().finally(() => {
        this.#draining = null;
      });
    }
  }

  async #drain(): Promise<void> {
    for (let id = this.#queue.shift(); id !== undefined; id = this.#queue.shift()) {
      if (this.#closed) return;
      if (this.#options.busy(id)) {
        this.#later(id);
        continue;
      }
      const dir = this.#options.filmsDir();
      const film = dir ? await readFilm(dir, id).catch(() => null) : null;
      if (!film?.config || film.problem) continue;
      // A film that can't be pictured (no browser, it throws) keeps its card icon; the next change tries again.
      await this.#options.take(film).catch(() => undefined);
    }
  }
}
