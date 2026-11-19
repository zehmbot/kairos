/**
 * Film card pictures: one frame of the film, taken by the frame camera and kept in `.kairos/thumb.png`.
 * It is taken again when the film changes (its folder's newest file is newer than the picture).
 */
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.ts";
import type { Film } from "./films.ts";

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
