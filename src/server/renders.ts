/**
 * Finished videos of a film: the files in `renders/`, listed in `.kairos/renders.json`.
 * Versions only go up (my-intro-v1.mp4, v2, ...), so a new render never overwrites an older one.
 */
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type Render, RendersFileSchema } from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { KAIROS_DIR } from "./notes.ts";
import { resolveInside } from "./workspace.ts";

export const RENDERS_DIR = "renders";
const RENDERS_FILE = "renders.json";

/** `.kairos/renders.json` exists but can't be read. Kairos never overwrites it. */
export class RendersFileError extends Error {}

const listFile = (filmDir: string) => join(filmDir, KAIROS_DIR, RENDERS_FILE);

/** `my-intro` + 3 -> `my-intro-v3.mp4` */
export const videoName = (filmId: string, version: number) => `${filmId}-v${version}.mp4`;

async function readList(filmDir: string): Promise<Render[]> {
  let text: string;
  try {
    text = await readFile(listFile(filmDir), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
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
  return parsed.data.renders;
}

async function writeList(filmDir: string, renders: Render[]): Promise<void> {
  await mkdir(join(filmDir, KAIROS_DIR), { recursive: true });
  await writeFileAtomic(listFile(filmDir), `${JSON.stringify({ version: 1, renders }, null, 2)}\n`);
}

const fileExists = (path: string) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

/** The film's videos whose files are still there, newest first. */
export async function listRenders(filmDir: string): Promise<Render[]> {
  const renders = await readList(filmDir);
  const present: Render[] = [];
  for (const render of renders) {
    const path = resolveInside(filmDir, render.file);
    if (path && (await fileExists(path))) present.push(render);
  }
  return present.sort((a, b) => b.version - a.version);
}

/** The next free version: above every listed render and every `<id>-vN.mp4` already in `renders/`. */
export async function nextVersion(filmDir: string, filmId: string): Promise<number> {
  const listed = (await readList(filmDir)).map((render) => render.version);
  const prefix = `${filmId}-v`;
  const onDisk = (await readdir(join(filmDir, RENDERS_DIR)).catch(() => []))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".mp4"))
    .map((name) => Number(name.slice(prefix.length, -4)))
    .filter((version) => Number.isInteger(version));
  return Math.max(0, ...listed, ...onDisk) + 1;
}

export async function addRender(filmDir: string, render: Render): Promise<void> {
  const renders = await readList(filmDir);
  await writeList(filmDir, [
    ...renders.filter((entry) => entry.version !== render.version),
    render,
  ]);
}

/** Deletes a video and its entry. Returns false when there is no such version. */
export async function removeRender(filmDir: string, version: number): Promise<boolean> {
  const renders = await readList(filmDir);
  const render = renders.find((entry) => entry.version === version);
  if (!render) return false;
  const path = resolveInside(filmDir, render.file);
  if (path) await rm(path, { force: true });
  await writeList(
    filmDir,
    renders.filter((entry) => entry.version !== version),
  );
  return true;
}

/** The video file of a version, or null when it isn't there. */
export async function renderPath(filmDir: string, version: number): Promise<string | null> {
  const render = (await readList(filmDir)).find((entry) => entry.version === version);
  const path = render ? resolveInside(filmDir, render.file) : null;
  return path && (await fileExists(path)) ? path : null;
}
