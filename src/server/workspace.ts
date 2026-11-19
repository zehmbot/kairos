import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Films live in this folder inside the workspace. */
export const FILMS_FOLDER = "films";

/** The asset library (images, videos, sounds, fonts shared by all films). */
export const ASSETS_FOLDER = "assets";

export function assetsDirOf(workspace: string): string {
  return join(workspace, ASSETS_FOLDER);
}

export function filmsDirOf(workspace: string): string {
  return join(workspace, FILMS_FOLDER);
}

/** The user's own templates live in the workspace, so they travel with it. */
export const TEMPLATES_FOLDER = "templates";

export function templatesDirOf(workspace: string): string {
  return join(workspace, TEMPLATES_FOLDER);
}

export function suggestedWorkspace(home = homedir()): string {
  return join(home, "Kairos");
}

/**
 * A film id is its folder name. It must be a single, plain folder name: it starts with a letter or digit
 * (any language), then letters, digits, spaces, `-`, `_` or `.`, with no `..` anywhere.
 */
export function isSafeFilmId(id: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,99}$/u.test(id) && !id.includes("..") && id.trim() === id;
}

/**
 * Resolves `relPath` (a URL-style path, `/` separated) inside `root`.
 * Returns `null` for anything that could leave `root` or reach hidden files: `..`, dot-files and dot-folders,
 * drive letters, backslashes or NUL bytes.
 */
export function resolveInside(root: string, relPath: string): string | null {
  if (relPath.includes("\0") || relPath.includes("\\")) return null;
  const parts = relPath.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part.startsWith(".") || part.includes(":")) return null;
  }
  const base = resolve(root);
  const target = resolve(base, ...parts);
  const rel = relative(base, target);
  if (rel === "" || isAbsolute(rel) || rel.split(sep).includes("..")) {
    return null;
  }
  return target;
}

export type WorkspacePathResult = { ok: true; path: string } | { ok: false; message: string };

/**
 * Cleans up a folder path typed by the user: trims it, drops the quotes Windows' "Copy as path" adds,
 * and expands a leading `~`. The result must be a full (absolute) path.
 */
export function normalizeWorkspacePath(
  input: string,
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
): WorkspacePathResult {
  let path = input.trim();
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1).trim();
  }
  if (path === "~") path = home;
  else if (path.startsWith("~/") || path.startsWith("~\\")) path = join(home, path.slice(2));

  if (path === "" || path.includes("\0") || !isAbsolute(path)) {
    const example = platform === "win32" ? "C:\\Users\\you\\Kairos" : "/home/you/Kairos";
    return { ok: false, message: `Use a full folder path, like ${example}` };
  }
  return { ok: true, path: resolve(path) };
}
