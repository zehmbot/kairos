/**
 * Secrets (API keys) in `~/.kairos/.env`: never in the repo, a film folder, an answer or a log.
 * A key set in the environment (or the Kairos folder's own `.env`, loaded at start) is used when the
 * settings file has none.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.ts";

export const ENV_FILE = ".env";
const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Reads `NAME=value` lines (quotes around the value are removed, `#` lines skipped). */
export function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match?.[1]) continue;
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

async function readEnvText(home: string): Promise<string> {
  return readFile(join(home, ENV_FILE), "utf8").catch(() => "");
}

/** A secret: from `~/.kairos/.env`, else from the environment. Null when there is none. */
export async function readSecret(home: string, name: string): Promise<string | null> {
  const saved = parseEnv(await readEnvText(home)).get(name);
  if (saved) return saved;
  const fromEnv = process.env[name];
  return fromEnv?.trim() ? fromEnv.trim() : null;
}

/** Where the secret comes from: the settings file, the environment, or nowhere. */
export async function secretSource(
  home: string,
  name: string,
): Promise<"settings" | "environment" | null> {
  if (parseEnv(await readEnvText(home)).get(name)) return "settings";
  return process.env[name]?.trim() ? "environment" : null;
}

/**
 * Saves (or, with `null`, removes) a secret in `~/.kairos/.env`, keeping every other line as it was.
 */
export async function writeSecret(home: string, name: string, value: string | null): Promise<void> {
  if (!NAME_PATTERN.test(name)) throw new Error(`Bad secret name: ${name}`);
  if (value !== null && /[\r\n]/.test(value)) throw new Error("A key can't contain line breaks.");
  const lines = (await readEnvText(home))
    .split(/\r?\n/)
    .filter((line, i, all) => line !== "" || i < all.length - 1);
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const kept = lines.filter((line) => !pattern.test(line));
  if (value !== null) kept.push(`${name}=${value}`);
  await mkdir(home, { recursive: true });
  await writeFileAtomic(join(home, ENV_FILE), kept.length ? `${kept.join("\n")}\n` : "");
}

/** "…a1b2": enough to recognise a key, never enough to use it. */
export function keyHint(key: string): string {
  return key.length > 8 ? `…${key.slice(-4)}` : "…";
}
