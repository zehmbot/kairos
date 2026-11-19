/**
 * Claude Code skills. Kairos ships its own (repo `skills/`), and users can keep their own in
 * `~/.kairos/skills/`. Turning a skill on copies it into Claude Code's skills folder (`~/.claude/skills/`),
 * where Claude picks it up without a restart.
 *
 * Kairos only ever changes folders it put there itself: each copy holds a `.kairos-skill` marker. A skill
 * with the same name that Kairos didn't add is reported as "taken" and left alone.
 */
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { type NewSkill, SKILL_NAME_PATTERN, type Skill, SkillNameSchema } from "../shared/types.ts";

export const SKILL_FILE = "SKILL.md";
export const MARKER_FILE = ".kairos-skill";
/** Never copied: version control, packages, OS clutter and our own marker. */
const SKIPPED = new Set([".git", "node_modules", MARKER_FILE, ".DS_Store", "Thumbs.db"]);
/** A skill is a few text files. More than this is probably the wrong folder. */
const MAX_FILES = 200;
const MAX_BYTES = 20 * 1024 * 1024;

/** A skill can't be changed. The message is shown to the user as-is. */
export class SkillError extends Error {}

/** Claude Code's personal skills folder (`KAIROS_CLAUDE_DIR` moves `~/.claude`, for tests). */
export function claudeSkillsDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(env.KAIROS_CLAUDE_DIR || join(home, ".claude"), "skills");
}

/**
 * Reads `name` and `description` from the frontmatter at the top of a SKILL.md: a small YAML subset
 * (`key: value`, quoted values, and `>` / `|` blocks).
 */
export function parseFrontmatter(text: string): { name?: string; description?: string } {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end < 0) return {};

  const fields: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i] ?? "");
    if (!match) continue;
    const [, key = "", raw = ""] = match;
    let value = raw.trim();
    if (/^[>|][-+]?$/.test(value)) {
      // A block: the indented lines that follow.
      const block: string[] = [];
      while (i + 1 < end && /^\s+\S|^\s*$/.test(lines[i + 1] ?? ""))
        block.push((lines[++i] ?? "").trim());
      value = block.join(value.startsWith(">") ? " " : "\n").trim();
    } else if (/^".*"$/.test(value)) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (/^'.*'$/.test(value)) {
      value = value.slice(1, -1).replaceAll("''", "'");
    }
    fields[key] = value;
  }
  return { name: fields.name, description: fields.description };
}

/** Every file in `dir` (relative paths with "/"), without the skipped ones. */
async function filesOf(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .filter((path) => !path.split(sep).some((part) => SKIPPED.has(part)))
    .map((path) => path.split(sep).join("/"))
    .sort();
}

/** Fingerprint of a skill's files, to tell whether a copy is current. */
async function hashOf(dir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await filesOf(dir)) {
    hash
      .update(file)
      .update("\0")
      .update(await readFile(join(dir, file)))
      .update("\0");
  }
  return hash.digest("hex");
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

const MarkerSchema = z.object({ source: z.enum(["kairos", "yours"]), hash: z.string() });

interface Source {
  name: string;
  source: Skill["source"];
  dir: string;
  description: string;
}

export interface SkillsOptions {
  /** Kairos' own skills (the repo's `skills/`). */
  builtinDir: string;
  /** The user's own skills (`~/.kairos/skills`). */
  userDir: string;
  /** Claude Code's skills folder (`~/.claude/skills`). */
  claudeDir: string;
}

export class Skills {
  readonly #options: SkillsOptions;

  constructor(options: SkillsOptions) {
    this.#options = options;
  }

  async #sourcesIn(dir: string, source: Skill["source"]): Promise<Source[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const found: Source[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !SKILL_NAME_PATTERN.test(entry.name)) continue;
      const skillDir = join(dir, entry.name);
      const text = await readFile(join(skillDir, SKILL_FILE), "utf8").catch(() => null);
      if (text === null) continue;
      found.push({
        name: entry.name,
        source,
        dir: skillDir,
        description: parseFrontmatter(text).description ?? "",
      });
    }
    return found;
  }

  /** Kairos skills first, then the user's (a user skill can't use a Kairos skill's name). */
  async #sources(): Promise<Map<string, Source>> {
    const builtin = await this.#sourcesIn(this.#options.builtinDir, "kairos");
    const yours = await this.#sourcesIn(this.#options.userDir, "yours");
    const map = new Map<string, Source>();
    for (const source of [...builtin, ...yours])
      if (!map.has(source.name)) map.set(source.name, source);
    return map;
  }

  async #source(name: string): Promise<Source> {
    const source = (await this.#sources()).get(name);
    if (!source) throw new SkillError(`There's no skill called "${name}".`);
    return source;
  }

  #target(name: string): string {
    return join(this.#options.claudeDir, name);
  }

  async #marker(name: string): Promise<z.infer<typeof MarkerSchema> | null> {
    const text = await readFile(join(this.#target(name), MARKER_FILE), "utf8").catch(() => null);
    if (text === null) return null;
    try {
      return MarkerSchema.parse(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async #state(source: Source): Promise<Skill["state"]> {
    if (!(await exists(this.#target(source.name)))) return "off";
    const marker = await this.#marker(source.name);
    if (!marker) return "taken";
    const [sourceHash, copyHash] = await Promise.all([
      hashOf(source.dir),
      hashOf(this.#target(source.name)),
    ]);
    return marker.hash === sourceHash && copyHash === sourceHash ? "on" : "update";
  }

  async list(): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const source of (await this.#sources()).values()) {
      skills.push({
        name: source.name,
        description: source.description,
        source: source.source,
        state: await this.#state(source),
        path: source.dir,
      });
    }
    return skills;
  }

  /** Copies the skill into Claude Code's folder (or replaces Kairos' older copy). */
  async turnOn(name: string): Promise<void> {
    const source = await this.#source(name);
    const target = this.#target(name);
    if ((await exists(target)) && !(await this.#marker(name))) {
      throw new SkillError(
        `Claude Code already has a skill called "${name}" that Kairos didn't add. Kairos leaves it alone: rename one of them.`,
      );
    }
    // Build the copy next to the skills folder, then swap it in, so Claude never sees half a skill.
    const temp = join(
      dirname(this.#options.claudeDir),
      `.kairos-skill-${randomBytes(4).toString("hex")}`,
    );
    try {
      await cp(source.dir, temp, {
        recursive: true,
        filter: (path) => !SKIPPED.has(basename(path)),
      });
      const marker = { source: source.source, hash: await hashOf(source.dir) };
      await writeFile(join(temp, MARKER_FILE), `${JSON.stringify(marker)}\n`, "utf8");
      await mkdir(this.#options.claudeDir, { recursive: true });
      await rm(target, { recursive: true, force: true });
      await rename(temp, target);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  /** Removes Kairos' copy from Claude Code's folder. */
  async turnOff(name: string): Promise<void> {
    const target = this.#target(name);
    if (!(await exists(target))) return;
    if (!(await this.#marker(name))) {
      throw new SkillError(
        `Kairos didn't add the "${name}" skill to Claude Code, so it won't remove it.`,
      );
    }
    await rm(target, { recursive: true, force: true });
  }

  /** Deletes one of the user's own skills (and its copy in Claude Code). */
  async remove(name: string): Promise<void> {
    const source = await this.#source(name);
    if (source.source !== "yours")
      throw new SkillError("Kairos skills can be turned off, not deleted.");
    await this.turnOff(name);
    await rm(source.dir, { recursive: true, force: true });
  }

  async #checkNewName(name: string): Promise<void> {
    const taken = (await this.#sources()).get(name);
    if (taken?.source === "kairos") {
      throw new SkillError(`Kairos has its own skill called "${name}". Pick another name.`);
    }
    if (taken)
      throw new SkillError(
        `You already have a skill called "${name}". Delete it first to replace it.`,
      );
  }

  /** Adds a skill folder (one that holds SKILL.md) to the user's skills, and turns it on. */
  async addFolder(dir: string): Promise<string> {
    const text = await readFile(join(dir, SKILL_FILE), "utf8").catch(() => null);
    if (text === null) {
      throw new SkillError(
        `This folder has no ${SKILL_FILE}, so it isn't a skill. Pick the folder that holds ${SKILL_FILE}.`,
      );
    }
    const files = await filesOf(dir);
    let bytes = 0;
    for (const file of files) bytes += (await stat(join(dir, file))).size;
    if (files.length > MAX_FILES || bytes > MAX_BYTES) {
      throw new SkillError(
        "This folder is too big for a skill. Pick the folder that holds just the skill.",
      );
    }
    const named = SkillNameSchema.safeParse(parseFrontmatter(text).name ?? basename(dir));
    if (!named.success) {
      throw new SkillError(
        `The skill's name must use small letters, numbers and dashes. Set "name:" at the top of ${SKILL_FILE}.`,
      );
    }
    const name = named.data;
    await this.#checkNewName(name);
    await mkdir(this.#options.userDir, { recursive: true });
    await cp(dir, join(this.#options.userDir, name), {
      recursive: true,
      filter: (path) => !SKIPPED.has(basename(path)),
    });
    await this.turnOn(name);
    return name;
  }

  /** Writes a new skill of the user's own, and turns it on. */
  async create(input: NewSkill): Promise<string> {
    await this.#checkNewName(input.name);
    const dir = join(this.#options.userDir, input.name);
    await mkdir(dir, { recursive: true });
    // A JSON string is a valid YAML double-quoted string, so any description is safe.
    const text = `---\nname: ${input.name}\ndescription: ${JSON.stringify(input.description)}\n---\n\n${input.instructions}\n`;
    await writeFile(join(dir, SKILL_FILE), text, "utf8");
    await this.turnOn(input.name);
    return input.name;
  }

  /** Turns on every Kairos skill that is off (after connecting Claude Code). Taken names are skipped. */
  async turnOnDefaults(): Promise<string[]> {
    const turnedOn: string[] = [];
    for (const skill of await this.list()) {
      if (skill.source === "kairos" && skill.state === "off") {
        await this.turnOn(skill.name);
        turnedOn.push(skill.name);
      }
    }
    return turnedOn;
  }

  /**
   * Brings Kairos' copies up to date when Kairos ships a newer skill. Copies the user edited in
   * Claude's folder are left alone (the Skills page then offers Update).
   */
  async refresh(): Promise<string[]> {
    const updated: string[] = [];
    for (const source of (await this.#sources()).values()) {
      const marker = await this.#marker(source.name);
      if (!marker) continue;
      const [sourceHash, copyHash] = await Promise.all([
        hashOf(source.dir),
        hashOf(this.#target(source.name)),
      ]);
      if (copyHash === marker.hash && sourceHash !== marker.hash) {
        await this.turnOn(source.name);
        updated.push(source.name);
      }
    }
    return updated;
  }
}
