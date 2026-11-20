/**
 * Claude in your terminal tells Kairos what it is doing through Claude Code's HTTP hooks: Kairos writes them into
 * the film folder's `.claude/settings.json`, and Claude Code posts each event (a prompt, a tool call, a
 * permission prompt, the end of its turn) to the hub. When the hub isn't running, Claude Code only notes a
 * non-blocking error.
 *
 * The file may hold your own settings and hooks: Kairos keeps them all and changes only its own entries (found by
 * their address). It never writes over a file it can't read.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.ts";

/** Where the hooks post. */
export const HOOK_PATH = "/api/claude/hook";
/** The settings file, in the film folder. */
export const HOOKS_FILE = join(".claude", "settings.json");
/** Seconds Claude Code waits for the hub (it answers at once). */
const HOOK_TIMEOUT = 2;

type Settings = Record<string, unknown>;
interface HookEntry {
  type?: string;
  url?: string;
  [key: string]: unknown;
}
interface MatcherGroup {
  matcher?: string;
  hooks?: HookEntry[];
  [key: string]: unknown;
}

/** True for a hook Kairos wrote (on any port). */
export function isKairosHook(hook: HookEntry): boolean {
  if (hook?.type !== "http" || typeof hook.url !== "string") return false;
  try {
    const url = new URL(hook.url);
    return (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.pathname === HOOK_PATH
    );
  } catch {
    return false;
  }
}

/** Kairos' hooks for a hub on `port`, by event. */
export function kairosHooks(port: number): Record<string, MatcherGroup[]> {
  const hook = (query = ""): HookEntry => ({
    type: "http",
    url: `http://127.0.0.1:${port}${HOOK_PATH}${query}`,
    timeout: HOOK_TIMEOUT,
  });
  return {
    UserPromptSubmit: [{ hooks: [hook()] }],
    PreToolUse: [{ matcher: "*", hooks: [hook()] }],
    PostToolUse: [{ matcher: "*", hooks: [hook()] }],
    // The address says which kind of notification it was.
    Notification: [
      { matcher: "permission_prompt|elicitation_dialog", hooks: [hook("?notice=waiting")] },
      { matcher: "idle_prompt", hooks: [hook("?notice=idle")] },
    ],
    Stop: [{ hooks: [hook()] }],
    SessionEnd: [{ hooks: [hook()] }],
  };
}

/** `settings` with Kairos' hooks for `port`: every other setting and hook stays as it is. */
export function withKairosHooks(settings: Settings, port: number): Settings {
  const hooks: Record<string, unknown> =
    settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
      ? { ...(settings.hooks as Record<string, unknown>) }
      : {};
  // Take out Kairos' old entries (an old port too), keeping everything else.
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = (groups as MatcherGroup[]).flatMap((group) => {
      if (!group || !Array.isArray(group.hooks)) return [group];
      const own = group.hooks.filter((hook) => !isKairosHook(hook));
      if (own.length === group.hooks.length) return [group];
      return own.length > 0 ? [{ ...group, hooks: own }] : [];
    });
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  for (const [event, groups] of Object.entries(kairosHooks(port))) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as MatcherGroup[]) : [];
    hooks[event] = [...existing, ...groups];
  }
  return { ...settings, hooks };
}

/** Thrown when the film's settings file can't be read as JSON: Kairos leaves it alone. */
export class HooksFileError extends Error {}

/**
 * Puts Kairos' hooks in the film folder's `.claude/settings.json`. Writes only when something changes; a file
 * that isn't valid JSON is left alone (HooksFileError).
 */
export async function installHooks(filmDir: string, port: number): Promise<boolean> {
  const file = join(filmDir, HOOKS_FILE);
  let text: string | null = null;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let settings: Settings = {};
  if (text?.trim()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      settings = parsed as Settings;
    } catch {
      throw new HooksFileError(`${file} isn't valid JSON, so Kairos left it as it is.`);
    }
  }
  const next = `${JSON.stringify(withKairosHooks(settings, port), null, 2)}\n`;
  if (text === next) return false;
  await mkdir(join(filmDir, ".claude"), { recursive: true });
  await writeFileAtomic(file, next);
  return true;
}
