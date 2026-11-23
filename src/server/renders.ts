/**
 * Finished videos and saved pictures of a film: the files in `renders/`, listed in `.kairos/renders.json`.
 * Versions only go up (my-intro-v1.mp4, v2, ...), and so do picture numbers (my-intro-picture-1.png, 2, ...), so a
 * new one never overwrites an older one. A video may have a subtitles file next to it (`my-intro-v3.srt`).
 */
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type Picture, type Render, RendersFileSchema } from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { KAIROS_DIR } from "./notes.ts";
import { resolveInside } from "./workspace.ts";

export const RENDERS_DIR = "renders";
const RENDERS_FILE = "renders.json";

/** `.kairos/renders.json` exists but can't be read. Kairos never overwrites it. */
export class RendersFileError extends Error {}

const listFile = (filmDir: string) => join(filmDir, KAIROS_DIR, RENDERS_FILE);

/** `my-intro` + 3 -> `my-intro-v3.mp4`; in another shape than the film's own: `my-intro-v3-tall.mp4`. */
export const videoName = (filmId: string, version: number, shape?: string | null) =>
  `${filmId}-v${version}${shape ? `-${shape}` : ""}.mp4`;

/** A video's subtitles file: `renders/my-intro-v3-tall.mp4` -> `renders/my-intro-v3-tall.srt`. */
export const subtitlesFileOf = (videoFile: string) => videoFile.replace(/\.mp4$/i, ".srt");

/** `my-intro` + 3 -> `my-intro-picture-3.png` */
export const pictureName = (filmId: string, number: number) => `${filmId}-picture-${number}.png`;

/** The version in a file name this film's renders use (`my-intro-v3.mp4`, `my-intro-v3-tall.srt`), or null. */
export function versionIn(filmId: string, name: string): number | null {
  const prefix = `${filmId}-v`;
  if (!name.startsWith(prefix)) return null;
  const match = /^(\d+)(?:-(?:wide|tall|square))?\.(?:mp4|srt)$/.exec(name.slice(prefix.length));
  return match ? Number(match[1]) : null;
}

/** The number in a picture's file name (`my-intro-picture-3.png`), or null. */
export function pictureNumberIn(filmId: string, name: string): number | null {
  const prefix = `${filmId}-picture-`;
  if (!name.startsWith(prefix)) return null;
  const match = /^(\d+)\.png$/.exec(name.slice(prefix.length));
  return match ? Number(match[1]) : null;
}

interface Lists {
  renders: Render[];
  pictures: Picture[];
}

async function readLists(filmDir: string): Promise<Lists> {
  let text: string;
  try {
    text = await readFile(listFile(filmDir), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { renders: [], pictures: [] };
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new RendersFileError(
      `This film's list of videos (.kairos/renders.json) is not valid JSON: ${(error as Error).message}`,
    );
  }
  const parsed = RendersFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new RendersFileError(
      `This film's list of videos (.kairos/renders.json) has a problem:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return { renders: parsed.data.renders, pictures: parsed.data.pictures };
}

async function writeLists(filmDir: string, lists: Lists): Promise<void> {
  await mkdir(join(filmDir, KAIROS_DIR), { recursive: true });
  // Pictures are written only once there are some, so a list of videos looks as it always did.
  const json = {
    version: 1,
    renders: lists.renders,
    ...(lists.pictures.length > 0 ? { pictures: lists.pictures } : {}),
  };
  await writeFileAtomic(listFile(filmDir), `${JSON.stringify(json, null, 2)}\n`);
}

const fileExists = (path: string) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

/** The entries whose files are still there. */
async function present<T extends { file: string }>(filmDir: string, list: T[]): Promise<T[]> {
  const found: T[] = [];
  for (const entry of list) {
    const path = resolveInside(filmDir, entry.file);
    if (path && (await fileExists(path))) found.push(entry);
  }
  return found;
}

/** The numbers in `renders/` file names, read by `numberIn`. */
async function numbersOnDisk(filmDir: string, numberIn: (name: string) => number | null) {
  return (await readdir(join(filmDir, RENDERS_DIR)).catch(() => []))
    .map(numberIn)
    .filter((number) => number !== null);
}

// ---------- Videos ----------

/** The film's videos whose files are still there, newest first (a missing subtitles file reads as none). */
export async function listRenders(filmDir: string): Promise<Render[]> {
  const renders = await present(filmDir, (await readLists(filmDir)).renders);
  for (const render of renders) {
    const path = render.subtitles ? resolveInside(filmDir, render.subtitles) : null;
    if (render.subtitles && !(path && (await fileExists(path)))) render.subtitles = null;
  }
  return renders.sort((a, b) => b.version - a.version);
}

/** The next free version: above every listed render and every `<id>-vN…` file already in `renders/`. */
export async function nextVersion(filmDir: string, filmId: string): Promise<number> {
  const listed = (await readLists(filmDir)).renders.map((render) => render.version);
  const onDisk = await numbersOnDisk(filmDir, (name) => versionIn(filmId, name));
  return Math.max(0, ...listed, ...onDisk) + 1;
}

export async function addRender(filmDir: string, render: Render): Promise<void> {
  const lists = await readLists(filmDir);
  await writeLists(filmDir, {
    ...lists,
    renders: [...lists.renders.filter((entry) => entry.version !== render.version), render],
  });
}

/** Deletes a video, its subtitles and its entry. Returns false when there is no such version. */
export async function removeRender(filmDir: string, version: number): Promise<boolean> {
  const lists = await readLists(filmDir);
  const render = lists.renders.find((entry) => entry.version === version);
  if (!render) return false;
  for (const file of [render.file, render.subtitles]) {
    const path = file ? resolveInside(filmDir, file) : null;
    if (path) await rm(path, { force: true });
  }
  await writeLists(filmDir, {
    ...lists,
    renders: lists.renders.filter((entry) => entry.version !== version),
  });
  return true;
}

/** The video file of a version, or null when it isn't there. */
export async function renderPath(filmDir: string, version: number): Promise<string | null> {
  const render = (await readLists(filmDir)).renders.find((entry) => entry.version === version);
  const path = render ? resolveInside(filmDir, render.file) : null;
  return path && (await fileExists(path)) ? path : null;
}

// ---------- Pictures ----------

/** The film's saved pictures whose files are still there, newest first. */
export async function listPictures(filmDir: string): Promise<Picture[]> {
  const pictures = await present(filmDir, (await readLists(filmDir)).pictures);
  return pictures.sort((a, b) => b.number - a.number);
}

/** The next free picture number: above every listed picture and every `<id>-picture-N.png` in `renders/`. */
export async function nextPictureNumber(filmDir: string, filmId: string): Promise<number> {
  const listed = (await readLists(filmDir)).pictures.map((picture) => picture.number);
  const onDisk = await numbersOnDisk(filmDir, (name) => pictureNumberIn(filmId, name));
  return Math.max(0, ...listed, ...onDisk) + 1;
}

export async function addPicture(filmDir: string, picture: Picture): Promise<void> {
  const lists = await readLists(filmDir);
  await writeLists(filmDir, {
    ...lists,
    pictures: [...lists.pictures.filter((entry) => entry.number !== picture.number), picture],
  });
}

/** Deletes a picture and its entry. Returns false when there is no such picture. */
export async function removePicture(filmDir: string, number: number): Promise<boolean> {
  const lists = await readLists(filmDir);
  const picture = lists.pictures.find((entry) => entry.number === number);
  if (!picture) return false;
  const path = resolveInside(filmDir, picture.file);
  if (path) await rm(path, { force: true });
  await writeLists(filmDir, {
    ...lists,
    pictures: lists.pictures.filter((entry) => entry.number !== number),
  });
  return true;
}

/** The file of a picture, or null when it isn't there. */
export async function picturePath(filmDir: string, number: number): Promise<string | null> {
  const picture = (await readLists(filmDir)).pictures.find((entry) => entry.number === number);
  const path = picture ? resolveInside(filmDir, picture.file) : null;
  return path && (await fileExists(path)) ? path : null;
}
