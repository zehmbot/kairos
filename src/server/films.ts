import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { z } from "zod";
import {
  type AudioTrack,
  type BriefFile,
  compactTrack,
  DEFAULT_FPS,
  FILM_SHAPES,
  type FilmChange,
  type FilmConfig,
  FilmConfigSchema,
  type NewFilm,
} from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { isSafeFilmId, resolveInside } from "./workspace.ts";

export const CONFIG_FILE = "kairos.json";

/** Folders inside a film that are not part of the film itself. */
const NOT_FILM_CONTENT = new Set(["renders"]);

export interface Film {
  id: string;
  path: string;
  config: FilmConfig | null;
  problem: string | null;
  updatedAt: number;
  /** Made with a brief (`.kairos/brief.json`). */
  hasBrief: boolean;
}

type ConfigResult = { config: FilmConfig; problem: null } | { config: null; problem: string };

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/** Reads `kairos.json` in `dir`. Returns `null` when there is none (the folder is not a film). */
export async function readFilmConfig(dir: string): Promise<ConfigResult | null> {
  let text: string;
  try {
    text = await readFile(join(dir, CONFIG_FILE), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") return null;
    return { config: null, problem: `Kairos could not read ${CONFIG_FILE}.` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      config: null,
      problem: `${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`,
    };
  }
  const parsed = FilmConfigSchema.safeParse(json);
  if (!parsed.success) {
    return {
      config: null,
      problem: `${CONFIG_FILE} has a problem:\n${z.prettifyError(parsed.error)}`,
    };
  }
  return { config: parsed.data, problem: null };
}

/** Newest modification time among the film's top-level files and folders. */
async function lastChange(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const times = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && !NOT_FILM_CONTENT.has(entry.name))
      .map((entry) =>
        stat(join(dir, entry.name)).then(
          (info) => info.mtimeMs,
          () => 0,
        ),
      ),
  );
  return Math.round(Math.max(0, ...times));
}

/** Reads one film. Returns `null` when `id` is not a film folder. */
export async function readFilm(filmsDir: string, id: string): Promise<Film | null> {
  if (!isSafeFilmId(id)) return null;
  const path = join(filmsDir, id);
  const result = await readFilmConfig(path);
  if (!result) return null;

  let problem = result.problem;
  if (result.config) {
    const page = resolveInside(path, result.config.page);
    if (!page) {
      problem = `"page" in ${CONFIG_FILE} must be a file inside the film folder.`;
    } else {
      const info = await stat(page).catch(() => null);
      if (!info?.isFile()) problem = `The film page "${result.config.page}" is missing.`;
    }
    for (const track of result.config.audio) {
      if (problem) break;
      const file = resolveInside(path, track.file);
      if (!file) {
        problem = `The audio file "${track.file}" must be inside the film folder.`;
      } else if (!(await stat(file).catch(() => null))?.isFile()) {
        problem = `The audio file "${track.file}" is missing.`;
      }
    }
  }

  const hasBrief = await stat(join(path, BRIEF_DATA_FILE)).then(
    (info) => info.isFile(),
    () => false,
  );
  return { id, path, config: result.config, problem, updatedAt: await lastChange(path), hasBrief };
}

/** Every film in `filmsDir`, most recently changed first. Folders without `kairos.json` are skipped. */
export async function scanFilms(filmsDir: string): Promise<Film[]> {
  const entries = await readdir(filmsDir, { withFileTypes: true }).catch(() => []);
  const films = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isSafeFilmId(entry.name))
      .map((entry) => readFilm(filmsDir, entry.name)),
  );
  return films
    .filter((film): film is Film => film !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

/** Turns a title into a folder name: "My Intro!" -> "my-intro", "Café" -> "cafe". Falls back to "film". */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return isSafeFilmId(slug) ? slug : "film";
}

/** Template files that get a different name in the film. */
const RENAMES: Record<string, string> = { "CLAUDE.template.md": "CLAUDE.md" };
/** Template files whose `{{placeholders}}` are filled in. */
const TEXT_FILES = new Set([".html", ".js", ".css", ".md", ".json", ".txt"]);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Files at the top of a template folder that describe the template and aren't copied into films. */
export const TEMPLATE_ONLY_FILES = new Set(["template.json", "preview.png"]);
/** The brief, written plainly for Claude and the user, and kept as data to edit later. */
export const BRIEF_FILE = "brief.md";
export const BRIEF_DATA_FILE = join(".kairos", "brief.json");

export interface CreateOptions {
  /** A fixed size from the template (instead of the shape's). */
  size?: { width: number; height: number };
  /** Length in seconds (default 5). */
  duration?: number;
  /** The brief: saved as `.kairos/brief.json`. */
  brief?: BriefFile;
  /** The brief as Markdown: saved as `brief.md` and put in `{{brief}}`. */
  briefText?: string;
}

/**
 * Makes a new film folder from a template folder and returns its id.
 * Names that are taken get a number: `my-intro`, `my-intro-2`, ...
 */
export async function createFilm(
  filmsDir: string,
  templateDir: string,
  input: NewFilm,
  options: CreateOptions = {},
): Promise<string> {
  await mkdir(filmsDir, { recursive: true });
  const base = slugify(input.title);

  let id = "";
  for (let n = 1; !id; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    try {
      await mkdir(join(filmsDir, candidate));
      id = candidate;
    } catch (error) {
      if (errorCode(error) !== "EEXIST" || n >= 999) throw error;
    }
  }

  const dir = join(filmsDir, id);
  const shape = options.size ?? FILM_SHAPES[input.shape];
  const values: Record<string, string> = {
    "{{title}}": input.title,
    "{{title_html}}": escapeHtml(input.title),
    // Goes inside "double quotes" in JS files, so the template stays valid JavaScript.
    "{{title_js}}": JSON.stringify(input.title).slice(1, -1),
    "{{width}}": String(shape.width),
    "{{height}}": String(shape.height),
    "{{brief}}": options.briefText ?? "No brief: the user didn't fill in a form for this film.",
  };

  try {
    const entries = await readdir(templateDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const source = join(entry.parentPath, entry.name);
      const rel = relative(templateDir, source);
      if (TEMPLATE_ONLY_FILES.has(rel)) continue;
      const target = join(dir, dirname(rel), RENAMES[entry.name] ?? entry.name);
      await mkdir(dirname(target), { recursive: true });
      if (TEXT_FILES.has(extname(entry.name))) {
        let text = await readFile(source, "utf8");
        for (const [key, value] of Object.entries(values)) text = text.replaceAll(key, value);
        await writeFile(target, text, "utf8");
      } else {
        await copyFile(source, target);
      }
    }

    // What kairos.json holds (the input form: no empty "audio" list written into new films).
    const config: z.input<typeof FilmConfigSchema> = {
      title: input.title,
      width: shape.width,
      height: shape.height,
      fps: input.fps ?? DEFAULT_FPS,
      duration: options.duration ?? 5,
      status: "draft",
      page: "index.html",
    };
    await writeFile(join(dir, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    if (options.brief) {
      await mkdir(join(dir, ".kairos"), { recursive: true });
      await writeFile(
        join(dir, BRIEF_DATA_FILE),
        `${JSON.stringify(options.brief, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(dir, BRIEF_FILE), options.briefText ?? "", "utf8");
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  return id;
}

/** `kairos.json` can't be changed because it is broken. Kairos leaves it alone, so nothing is lost. */
export class FilmConfigError extends Error {}

/**
 * Changes settings in a film's `kairos.json` (`filmDir` must be a film folder).
 * Every other field, even ones Kairos doesn't know, is kept as it was, in the same order.
 */
export async function changeFilm(
  filmDir: string,
  change: FilmChange | { audio: AudioTrack[] },
): Promise<FilmConfig> {
  const file = join(filmDir, CONFIG_FILE);
  const text = await readFile(file, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new FilmConfigError(
      `${CONFIG_FILE} is not valid JSON, so Kairos won't change it. Fix it first: ${(error as Error).message}`,
    );
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new FilmConfigError(`${CONFIG_FILE} must hold an object, so Kairos won't change it.`);
  }
  // Sound tracks are written short: without their default values.
  const next = {
    ...json,
    ...("audio" in change ? { ...change, audio: change.audio.map(compactTrack) } : change),
  };
  const parsed = FilmConfigSchema.safeParse(next);
  if (!parsed.success) {
    throw new FilmConfigError(
      `${CONFIG_FILE} has a problem, so Kairos won't change it. Fix it first:\n${z.prettifyError(parsed.error)}`,
    );
  }
  await writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  return parsed.data;
}
