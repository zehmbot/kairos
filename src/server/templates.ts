/**
 * Templates: starting points for new films. A template is a folder with the film's files plus a
 * `template.json` (its name, defaults, and the kinds of film it makes, each with its own form).
 * Kairos ships some (repo `templates/`); the user's own live in `<workspace>/templates/`.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { z } from "zod";
import {
  BLANK_TEMPLATE_ID,
  type BriefAnswers,
  type BriefFile,
  BriefFileSchema,
  FILM_SHAPES,
  type FilmConfig,
  type FilmShape,
  type SaveTemplate,
  type TemplateField,
  type TemplateFile,
  TemplateFileSchema,
  type TemplateInput,
  type TemplateKind,
  type TemplateSummary,
} from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { BRIEF_DATA_FILE, BRIEF_FILE, slugify, TEMPLATE_ONLY_FILES } from "./films.ts";
import { isSafeFilmId } from "./workspace.ts";

export const TEMPLATE_FILE = "template.json";
export const PREVIEW_FILE = "preview.png";

/** A template can't be used or changed. The message is shown to the user as-is. */
export class TemplateError extends Error {}

/** A template and its folder. */
export interface Template extends TemplateSummary {
  dir: string;
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function readTemplateDir(
  dir: string,
  id: string,
  source: Template["source"],
): Promise<Template> {
  const base = {
    id,
    dir,
    source,
    hasPreview: await exists(join(dir, PREVIEW_FILE)),
  };
  const broken = (problem: string): Template => ({
    ...base,
    name: id,
    description: "",
    defaults: { shape: "wide", fps: 30, duration: 5 },
    kinds: [],
    problem,
  });
  let json: unknown;
  try {
    json = JSON.parse(await readFile(join(dir, TEMPLATE_FILE), "utf8"));
  } catch (error) {
    return broken(`${TEMPLATE_FILE} can't be read: ${(error as Error).message}`);
  }
  const parsed = TemplateFileSchema.safeParse(json);
  if (!parsed.success)
    return broken(`${TEMPLATE_FILE} has a problem:\n${z.prettifyError(parsed.error)}`);
  const file = parsed.data;
  return {
    ...base,
    name: file.name,
    description: file.description,
    defaults: file.defaults,
    // A template without kinds still has one: the film, with no questions.
    kinds:
      file.kinds.length > 0
        ? file.kinds
        : [{ id: "default", name: file.name, description: "", fields: [] }],
    problem: null,
  };
}

async function templatesIn(root: string, source: Template["source"]): Promise<Template[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found: Template[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeFilmId(entry.name)) continue;
    const dir = join(root, entry.name);
    if (!(await exists(join(dir, TEMPLATE_FILE)))) continue;
    found.push(await readTemplateDir(dir, entry.name, source));
  }
  return found;
}

/** Kairos templates (Starter first), then the user's own by name. A user template can't hide a Kairos one. */
export async function listTemplates(
  builtinDir: string,
  userDir: string | null,
): Promise<Template[]> {
  const ours = (await templatesIn(builtinDir, "kairos")).sort((a, b) =>
    a.id === BLANK_TEMPLATE_ID ? -1 : b.id === BLANK_TEMPLATE_ID ? 1 : a.name.localeCompare(b.name),
  );
  const taken = new Set(ours.map((template) => template.id));
  const yours = userDir
    ? (await templatesIn(userDir, "yours"))
        .filter((template) => !taken.has(template.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return [...ours, ...yours];
}

export async function findTemplate(
  builtinDir: string,
  userDir: string | null,
  id: string,
): Promise<Template | null> {
  if (!isSafeFilmId(id)) return null;
  return (await listTemplates(builtinDir, userDir)).find((template) => template.id === id) ?? null;
}

const MAX_LENGTH: Record<TemplateField["type"], number> = {
  text: 500,
  longtext: 50_000,
  choice: 200,
  number: 50,
};

/**
 * Checks answers against a form. Returns the cleaned answers (trimmed, numbers as numbers, unknown
 * questions dropped, empty ones left out) and plain-words errors by field id.
 */
export function checkBrief(
  fields: readonly TemplateField[],
  answers: BriefAnswers,
): { answers: BriefAnswers; errors: Record<string, string> } {
  const clean: BriefAnswers = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = answers[field.id];
    const text = raw === undefined ? "" : String(raw).trim();
    if (text === "") {
      if (field.required) errors[field.id] = `Please answer: ${field.label}`;
      continue;
    }
    if (text.length > MAX_LENGTH[field.type]) {
      errors[field.id] = `"${field.label}" is too long.`;
      continue;
    }
    if (field.type === "choice" && !field.options?.includes(text)) {
      errors[field.id] = `Pick one of the choices for "${field.label}".`;
      continue;
    }
    if (field.type === "number") {
      const value = Number(text);
      if (!Number.isFinite(value)) errors[field.id] = `"${field.label}" must be a number.`;
      else if (field.min !== undefined && value < field.min)
        errors[field.id] = `"${field.label}" must be at least ${field.min}.`;
      else if (field.max !== undefined && value > field.max)
        errors[field.id] = `"${field.label}" can be at most ${field.max}.`;
      else clean[field.id] = value;
      continue;
    }
    clean[field.id] = text;
  }
  return { answers: clean, errors };
}

export function makeBrief(
  template: Template,
  kind: TemplateKind,
  answers: BriefAnswers,
): BriefFile {
  return {
    version: 1,
    template: template.id,
    templateName: template.name,
    kind: kind.id,
    kindName: kind.name,
    fields: kind.fields,
    answers,
    updatedAt: new Date().toISOString(),
  };
}

/** The brief as plain Markdown: what the user asked for, question by question, for Claude and the user. */
export function briefMarkdown(brief: BriefFile, title: string): string {
  const kind =
    brief.kindName && brief.kindName !== brief.templateName ? ` (${brief.kindName})` : "";
  const lines = [
    `# Brief: ${title}`,
    "",
    `Made with the ${brief.templateName} template${kind}. This is what the user asked for: build the film from it.`,
  ];
  for (const field of brief.fields) {
    const answer = brief.answers[field.id];
    lines.push(
      "",
      `## ${field.label}`,
      "",
      answer === undefined || answer === "" ? "(no answer)" : String(answer),
    );
  }
  if (brief.voices === "make") {
    lines.push(
      "",
      "## Voices",
      "",
      "Make them with the film: give every speaker a type (kairos_voices with cast), write what they say in",
      "the script (kairos_script), make the voices and fit the film to them. See Voices in CLAUDE.md.",
    );
  } else if (brief.voices === "none") {
    lines.push("", "## Voices", "", "No voices for this film.");
  }
  return `${lines.join("\n")}\n`;
}

/** Never copied into a template: Kairos' own data, videos, hidden folders, packages, the brief. */
// References are left out too (they are often other people's videos), and the film's spoken lines (voice/).
const NOT_TEMPLATE = new Set([
  ".kairos",
  "renders",
  "references",
  "voice",
  "node_modules",
  "brief.md",
  "kairos.json",
]);

/** The shape whose size this is, if any. */
function shapeOf(config: FilmConfig): FilmShape | null {
  for (const [shape, size] of Object.entries(FILM_SHAPES) as [
    FilmShape,
    { width: number; height: number },
  ][]) {
    if (size.width === config.width && size.height === config.height) return shape;
  }
  return null;
}

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * Puts the title placeholders back where the film's code holds its title, so films made from the template
 * get their own name. Only the safe spots: the title as a whole quoted string in scripts, and the page's
 * `<title>`. (A word like "Intro" inside `drawIntro` is left alone.)
 */
export function withTitlePlaceholders(text: string, file: string, title: string): string {
  if (/\.(m?js|ts)$/i.test(file)) {
    const js = JSON.stringify(title).slice(1, -1);
    return text
      .replaceAll(`"${js}"`, '"{{title_js}}"')
      .replaceAll(`'${js.replaceAll("'", "\\'")}'`, "'{{title_js}}'");
  }
  if (/\.html?$/i.test(file)) {
    return text.replaceAll(`<title>${escapeHtml(title)}</title>`, "<title>{{title_html}}</title>");
  }
  return text;
}

async function titlesToPlaceholders(dir: string, title: string): Promise<void> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(m?js|ts|html?)$/i.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    const text = await readFile(path, "utf8");
    const changed = withTitlePlaceholders(text, entry.name, title);
    if (changed !== text) await writeFile(path, changed, "utf8");
  }
}

/**
 * Saves a film as one of the user's templates. Its size, frame rate and length become the defaults;
 * when the film was made from a template, its form comes along. Returns the new template's id.
 */
export async function saveAsTemplate(
  film: { path: string; config: FilmConfig },
  userDir: string,
  input: Required<SaveTemplate>,
  brief: BriefFile | null,
  preview: Buffer | null,
): Promise<string> {
  await mkdir(userDir, { recursive: true });
  const base = slugify(input.name);
  let id = "";
  for (let n = 1; !id; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(join(userDir, candidate)))) id = candidate;
    if (n > 999) throw new TemplateError("Too many templates with this name.");
  }
  const dir = join(userDir, id);
  try {
    await cp(film.path, dir, {
      recursive: true,
      filter: (path) => {
        const rel = relative(film.path, path);
        if (rel === "") return true;
        const first = rel.split(sep)[0] ?? "";
        return !NOT_TEMPLATE.has(first) && !basename(path).startsWith(".");
      },
    });
    // The film's CLAUDE.md starts with its title: make that a placeholder again for new films.
    const claude = join(dir, "CLAUDE.md");
    const text = await readFile(claude, "utf8").catch(() => null);
    if (text !== null) {
      await writeFile(
        join(dir, "CLAUDE.template.md"),
        text.replace(/^# .*$/m, "# {{title}}"),
        "utf8",
      );
      await rm(claude);
    }
    await titlesToPlaceholders(dir, film.config.title);
    const shape = shapeOf(film.config);
    const file: z.input<typeof TemplateFileSchema> = {
      name: input.name,
      description: input.description,
      defaults: {
        shape: shape ?? "wide",
        fps: film.config.fps,
        duration: film.config.duration,
        ...(shape ? {} : { size: { width: film.config.width, height: film.config.height } }),
      },
      kinds: brief
        ? [{ id: brief.kind, name: brief.kindName, description: "", fields: brief.fields }]
        : [],
    };
    await writeFile(join(dir, TEMPLATE_FILE), `${JSON.stringify(file, null, 2)}\n`, "utf8");
    if (preview) await writeFile(join(dir, PREVIEW_FILE), preview);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return id;
}

/** Deletes one of the user's templates. */
export async function removeTemplate(userDir: string, id: string): Promise<boolean> {
  if (!isSafeFilmId(id)) return false;
  const dir = join(userDir, id);
  if (!(await exists(join(dir, TEMPLATE_FILE)))) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

/** `.kairos/brief.json` exists but can't be read. Kairos never overwrites it. */
export class BriefFileError extends Error {}

/** The film's brief, or null when it was made without one. */
export async function readBrief(filmDir: string): Promise<BriefFile | null> {
  let text: string;
  try {
    text = await readFile(join(filmDir, BRIEF_DATA_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return BriefFileSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new BriefFileError(
      `This film's brief (.kairos/brief.json) can't be read: ${(error as Error).message}`,
    );
  }
}

/** Saves the brief: `.kairos/brief.json` for Kairos and `brief.md` for Claude and the user. */
export async function writeBrief(filmDir: string, brief: BriefFile, title: string): Promise<void> {
  await mkdir(join(filmDir, ".kairos"), { recursive: true });
  await writeFileAtomic(join(filmDir, BRIEF_DATA_FILE), `${JSON.stringify(brief, null, 2)}\n`);
  await writeFileAtomic(join(filmDir, BRIEF_FILE), briefMarkdown(brief, title));
}

/** What the app sees of a template (its folder stays on the hub). */
export function summaryOf(template: Template): TemplateSummary {
  const { dir: _dir, ...summary } = template;
  return summary;
}

/** A free folder name for a new template of the user's, from its name. */
async function freeId(userDir: string, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(join(userDir, candidate)))) return candidate;
  }
  throw new TemplateError("Too many templates with this name.");
}

/** Checks a template's settings and questions, with plain-words problems. */
function checkTemplate(input: TemplateInput): TemplateFile {
  const parsed = TemplateFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new TemplateError(
      parsed.error.issues[0]?.message ?? "This template's settings have a problem.",
    );
  }
  return parsed.data;
}

const writeTemplateFile = (dir: string, file: TemplateFile) =>
  writeFileAtomic(join(dir, TEMPLATE_FILE), `${JSON.stringify(file, null, 2)}\n`);

/**
 * Makes a new template of the user's: the blank film's files (Kairos' `starter`) with these settings and
 * questions. Returns its id.
 */
export async function createTemplate(
  builtinDir: string,
  userDir: string,
  input: TemplateInput,
): Promise<string> {
  const file = checkTemplate(input);
  await mkdir(userDir, { recursive: true });
  const id = await freeId(userDir, file.name);
  const dir = join(userDir, id);
  const blank = join(builtinDir, BLANK_TEMPLATE_ID);
  try {
    await cp(blank, dir, {
      recursive: true,
      filter: (path) => !TEMPLATE_ONLY_FILES.has(relative(blank, path)),
    });
    await writeTemplateFile(dir, file);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return id;
}

/** Changes the settings and questions of one of the user's templates (its files stay as they are). */
export async function updateTemplate(
  userDir: string,
  id: string,
  input: TemplateInput,
): Promise<void> {
  const dir = isSafeFilmId(id) ? join(userDir, id) : null;
  if (!dir || !(await exists(join(dir, TEMPLATE_FILE)))) {
    throw new TemplateError("This template doesn't exist (any more).");
  }
  await writeTemplateFile(dir, checkTemplate(input));
}

/** Copies a template (Kairos' or the user's) into a new template of the user's, "<name> copy". */
export async function duplicateTemplate(template: Template, userDir: string): Promise<string> {
  if (template.problem)
    throw new TemplateError(`This template can't be copied: ${template.problem}`);
  await mkdir(userDir, { recursive: true });
  const name = `${template.name} copy`.slice(0, 60);
  const id = await freeId(userDir, name);
  const dir = join(userDir, id);
  try {
    await cp(template.dir, dir, { recursive: true });
    const file = TemplateFileSchema.parse(
      JSON.parse(await readFile(join(dir, TEMPLATE_FILE), "utf8")),
    );
    await writeTemplateFile(dir, { ...file, name });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return id;
}
