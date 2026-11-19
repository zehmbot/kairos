/**
 * References: videos and pictures added to a film for Claude to look at ("make it look like this").
 * The files live in `<film>/references/`; the list, notes and what Kairos found in `.kairos/references.json`;
 * the frame sheets (one picture from the middle of each shot, tiled) in `.kairos/references/<id>/`.
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type Reference, type ReferenceInfo, ReferenceSchema } from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { ffprobeNextTo } from "./ffmpeg.ts";
import { oneAtATime } from "./uploads.ts";
import { resolveInside } from "./workspace.ts";

export const REFERENCES_FOLDER = "references";
const DATA_FILE = join(".kairos", "references.json");
const sheetsDir = (filmDir: string, id: string) => join(filmDir, ".kairos", "references", id);

/** At most this many shots are pictured (evenly chosen when there are more). */
export const MAX_PICTURED = 36;
const ID_PATTERN = /^r_[a-z0-9]{8}$/;

const DataSchema = z.object({ version: z.literal(1), items: z.array(ReferenceSchema) });

/** references.json can't be read. The message is shown as-is. */
export class ReferencesFileError extends Error {}

export async function readReferences(filmDir: string): Promise<Reference[]> {
  let text: string;
  try {
    text = await readFile(join(filmDir, DATA_FILE), "utf8");
  } catch {
    return [];
  }
  const parsed = DataSchema.safeParse(
    (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) {
    throw new ReferencesFileError(
      `${DATA_FILE.replaceAll("\\", "/")} is broken, so Kairos won't change it.`,
    );
  }
  return parsed.data.items;
}

/** Changes the list, one change at a time per film. */
function changeReferences<T>(filmDir: string, change: (items: Reference[]) => T): Promise<T> {
  return oneAtATime(`${filmDir}|references`, async () => {
    const items = await readReferences(filmDir);
    const result = change(items);
    await mkdir(join(filmDir, ".kairos"), { recursive: true });
    await writeFileAtomic(
      join(filmDir, DATA_FILE),
      `${JSON.stringify({ version: 1, items }, null, 2)}\n`,
    );
    return result;
  });
}

const newId = () => `r_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

/** Adds a reference for a file already in `references/` (once per file). It starts "processing". */
export function addReference(
  filmDir: string,
  file: string,
  kind: "video" | "image",
  note = "",
): Promise<Reference> {
  const item: Reference = {
    id: newId(),
    file,
    kind,
    note,
    addedAt: new Date().toISOString(),
    status: "processing",
    problem: null,
    info: null,
    sheets: 0,
  };
  return changeReferences(filmDir, (items) => {
    // Already listed (an upload and a refresh of the list both saw the new file): keep one.
    const existing = items.find((reference) => reference.file === file);
    if (existing) return existing;
    items.push(item);
    return item;
  });
}

export function updateReference(
  filmDir: string,
  id: string,
  patch: Partial<Reference>,
): Promise<Reference | null> {
  return changeReferences(filmDir, (items) => {
    const item = items.find((r) => r.id === id);
    if (!item) return null;
    Object.assign(item, patch);
    return item;
  });
}

/** Removes a reference, its file and its sheets. */
export async function deleteReference(filmDir: string, id: string): Promise<boolean> {
  const removed = await changeReferences(filmDir, (items) => {
    const index = items.findIndex((r) => r.id === id);
    return index < 0 ? null : items.splice(index, 1)[0];
  });
  if (!removed) return false;
  const file = resolveInside(filmDir, removed.file);
  if (file) await rm(file, { force: true });
  await rm(sheetsDir(filmDir, removed.id), { recursive: true, force: true });
  return true;
}

/** The path of sheet `n` (from 1) of a reference, or null. */
export function sheetPath(filmDir: string, id: string, n: number): string | null {
  if (!ID_PATTERN.test(id) || !Number.isInteger(n) || n < 1 || n > 99) return null;
  return join(sheetsDir(filmDir, id), `sheet-${n}.jpg`);
}

// ---------- Looking inside videos (ffmpeg) ----------

/** Runs a program and gives its stderr line by line; resolves with the exit code. */
function runLines(file: string, args: string[], onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let rest = "";
    const take = (chunk: Buffer) => {
      const lines = (rest + chunk.toString()).split(/\r?\n|\r/);
      rest = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    };
    child.stderr.on("data", take);
    child.stdout.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => {
      if (rest) onLine(rest);
      resolve(code ?? -1);
    });
  });
}

async function runChecked(file: string, args: string[]): Promise<string[]> {
  const lines: string[] = [];
  const code = await runLines(file, args, (line) => lines.push(line));
  if (code !== 0) throw new Error(lines.slice(-3).join(" ").trim() || `exit ${code}`);
  return lines;
}

/** Length, size and frame rate of a video (ffprobe). */
async function probe(ffmpeg: string, file: string) {
  const lines = await runChecked(ffprobeNextTo(ffmpeg), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,avg_frame_rate:format=duration",
    "-of",
    "json",
    file,
  ]);
  const json = JSON.parse(lines.join("\n"));
  const stream = json.streams?.[0];
  if (!stream) throw new Error("no video stream");
  const [num, den] = String(stream.avg_frame_rate ?? "0/0")
    .split("/")
    .map(Number);
  return {
    duration: Number(json.format?.duration) || 0,
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0,
    fps: num && den ? Math.round((num / den) * 100) / 100 : null,
  };
}

/** When each shot starts: ffmpeg's scene detection, on a small copy of the picture (fast). */
async function findCuts(ffmpeg: string, file: string): Promise<number[]> {
  const cuts: number[] = [];
  const code = await runLines(
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-an",
      "-vf",
      "scale=320:-2,select='gt(scene,0.32)',showinfo",
      "-f",
      "null",
      "-",
    ],
    (line) => {
      const match = /pts_time:([\d.]+)/.exec(line);
      if (match) cuts.push(Number(match[1]));
    },
  );
  if (code !== 0) throw new Error("ffmpeg could not read the video");
  return cuts;
}

const round = (t: number) => Math.round(t * 100) / 100;

/** Shot numbers (from 1) to picture: all of them, or `max` evenly spread. */
export function pickShots(count: number, max = MAX_PICTURED): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i + 1);
  return Array.from({ length: max }, (_, i) => Math.round((i * (count - 1)) / (max - 1)) + 1);
}

/** The shot starts and the numbers: typical (median), shortest and longest shot. */
export function shotStats(cuts: readonly number[], duration: number) {
  const starts = [0, ...cuts.filter((t) => t > 0.2 && t < duration - 0.05)].reduce<number[]>(
    (list, t) => {
      if (t - (list.at(-1) ?? -1) >= 0.2) list.push(round(t));
      return list;
    },
    [],
  );
  const lengths = starts
    .map((start, i) => (starts[i + 1] ?? duration) - start)
    .sort((a, b) => a - b);
  return {
    shots: starts,
    medianShot: round(lengths[Math.floor(lengths.length / 2)] ?? duration),
    shortestShot: round(lengths[0] ?? duration),
    longestShot: round(lengths.at(-1) ?? duration),
  };
}

async function videoSheets(ffmpeg: string, file: string, out: string) {
  const info = await probe(ffmpeg, file);
  if (!info.duration || !info.width) throw new Error("no video");
  const stats = shotStats(await findCuts(ffmpeg, file), info.duration);
  const pictured = pickShots(stats.shots.length);
  const frames = join(out, "frames");
  await mkdir(frames, { recursive: true });
  const tall = info.height > info.width;
  const tileWidth = tall ? 240 : 320;
  for (const [i, shot] of pictured.entries()) {
    const start = stats.shots[shot - 1] ?? 0;
    const end = stats.shots[shot] ?? info.duration;
    await runChecked(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-ss",
      ((start + end) / 2).toFixed(3),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `scale=${tileWidth}:-2`,
      join(frames, `${String(i + 1).padStart(3, "0")}.png`),
    ]);
  }
  const cols = tall ? 6 : 4;
  const perSheet = cols * 3;
  let sheets = 0;
  for (let first = 1; first <= pictured.length; first += perSheet) {
    sheets++;
    await runChecked(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-start_number",
      String(first),
      "-i",
      join(frames, "%03d.png"),
      "-frames:v",
      "1",
      "-vf",
      `tile=${cols}x3:padding=4:color=black`,
      // JPEG: frame sheets are photos, and 6-8 times smaller than PNG (light for Claude).
      "-q:v",
      "3",
      join(out, `sheet-${sheets}.jpg`),
    ]);
  }
  await rm(frames, { recursive: true, force: true });
  const reference: ReferenceInfo = { ...info, ...stats, pictured };
  return { info: reference, sheets };
}

async function imageSheet(ffmpeg: string, file: string, out: string) {
  await runChecked(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease",
    "-q:v",
    "3",
    join(out, "sheet-1.jpg"),
  ]);
  return { info: null, sheets: 1 };
}

const running = new Set<string>();

/**
 * Looks inside a reference (in the background): frame sheets and numbers, then "ready" or "failed".
 * `done` is called when the reference changed.
 */
export async function processReference(
  filmDir: string,
  reference: Reference,
  ffmpeg: string | null,
  done: () => void,
): Promise<void> {
  const key = `${filmDir}|${reference.id}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    if (!ffmpeg) {
      await updateReference(filmDir, reference.id, {
        status: "failed",
        problem:
          "Kairos needs ffmpeg to look inside videos and pictures. Install it, then add the reference again.",
      });
      return;
    }
    const file = resolveInside(filmDir, reference.file);
    const out = sheetsDir(filmDir, reference.id);
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    try {
      if (!file) throw new Error("bad path");
      const result =
        reference.kind === "video"
          ? await videoSheets(ffmpeg, file, out)
          : await imageSheet(ffmpeg, file, out);
      await updateReference(filmDir, reference.id, { status: "ready", problem: null, ...result });
    } catch (error) {
      await rm(out, { recursive: true, force: true });
      await updateReference(filmDir, reference.id, {
        status: "failed",
        problem: `Kairos couldn't read this ${reference.kind === "video" ? "video" : "picture"} (${(error as Error).message.slice(0, 200)}).`,
      });
    }
  } finally {
    running.delete(key);
    done();
  }
}

/** References still "processing" that nothing is working on (the hub was stopped): start them again. */
export function resumeProcessing(
  filmDir: string,
  items: readonly Reference[],
  ffmpeg: string | null,
  done: () => void,
): void {
  for (const item of items) {
    if (item.status === "processing" && !running.has(`${filmDir}|${item.id}`)) {
      void processReference(filmDir, item, ffmpeg, done);
    }
  }
}

/** Files in `references/` that aren't in the list (added by hand in the folder). */
export async function looseReferenceFiles(
  filmDir: string,
  items: readonly Reference[],
): Promise<string[]> {
  const names = await readdir(join(filmDir, REFERENCES_FOLDER)).catch(() => []);
  const known = new Set(items.map((item) => item.file));
  return names.filter(
    (name) => !name.startsWith(".") && !known.has(`${REFERENCES_FOLDER}/${name}`),
  );
}
