/**
 * Files sent from the browser: the request body is the file itself (`application/octet-stream`), streamed to a
 * temporary file and then renamed into place, so a broken upload never leaves half a file behind.
 */
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { KIND_WORDS, type MediaKind, mediaKindOf } from "../shared/media.ts";

/** The largest file Kairos takes in: 2 GB. */
export const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;

/** A file that can't be taken in. The message is shown to the user as-is. */
export class UploadError extends Error {}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * A safe file name from what the user's file was called: letters (any language), numbers, `-`, `_` and one
 * extension, in small letters. "My Song (final).MP3" → "my-song-final.mp3". Null when nothing is left.
 */
export function cleanFileName(name: string): string | null {
  const base = basename(name.replaceAll("\\", "/"));
  const ext = extname(base).toLowerCase();
  const stem = base
    .slice(0, base.length - ext.length)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!stem || !/^\.[a-z0-9]{1,5}$/.test(ext)) return null;
  return `${stem}${ext}`;
}

/** `name`, or `name-2.ext`, `name-3.ext`... so it doesn't replace a file in `dir`. */
export async function freeName(dir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; await exists(join(dir, candidate)); n++) candidate = `${stem}-${n}${ext}`;
  return candidate;
}

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after the previous one for the same folder (two files never get the same free name). */
export function oneAtATime<T>(dir: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(dir) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(dir, next);
  void next
    .finally(() => {
      if (queues.get(dir) === next) queues.delete(dir);
    })
    .catch(() => {});
  return next;
}

/** Checks a file name before anything is saved: its kind must be one of `kinds`. Returns the clean name. */
export function checkUploadName(name: string | undefined, kinds: readonly MediaKind[]): string {
  const clean = name ? cleanFileName(name) : null;
  if (!clean) throw new UploadError("This file needs a name with an extension, like song.mp3.");
  const kind = mediaKindOf(clean);
  if (!kind || !kinds.includes(kind)) {
    const words = kinds.map((k) => KIND_WORDS[k]);
    const list =
      words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0];
    throw new UploadError(`Kairos can't use this kind of file here. Add a ${list} file.`);
  }
  return clean;
}

/**
 * Saves an uploaded file into `dir` under a free version of `name` (already checked with `checkUploadName`).
 * Returns the file name it got.
 */
export async function saveUpload(
  body: Readable,
  dir: string,
  name: string,
  limit = MAX_UPLOAD,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const temp = join(
    dir,
    `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  let size = 0;
  const out = createWriteStream(temp);
  try {
    await pipeline(
      body,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          size += chunk.length;
          if (size > limit)
            throw new UploadError("This file is too big: Kairos takes files up to 2 GB.");
          yield chunk;
        }
      },
      out,
    );
    if (size === 0) throw new UploadError("This file is empty.");
    return await oneAtATime(dir, async () => {
      const final = await freeName(dir, name);
      await rename(temp, join(dir, final));
      return final;
    });
  } catch (error) {
    // The file may still be opening or closing: wait, so nothing is left behind.
    if (!out.closed) await new Promise((resolve) => out.once("close", resolve));
    await rm(temp, { force: true, maxRetries: 3 });
    throw error;
  }
}

/** Lets routes take a file as the request body (`application/octet-stream`): the body is the raw stream. */
export function acceptUploads(app: FastifyInstance): void {
  app.addContentTypeParser("application/octet-stream", (_request, payload, done) =>
    done(null, payload),
  );
}
