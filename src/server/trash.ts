/**
 * The workspace trash: deleted films go to `<workspace>/.trash/<deleted at>-<id>/`, moved in one step, so
 * they can be restored. Delete for good removes a folder for real. `.trash` is outside `films/`, so trashed
 * films are never listed or watched.
 */
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TrashEntry } from "../shared/types.ts";
import { isSafeFilmId, resolveInside } from "./workspace.ts";

export const TRASH_FOLDER = ".trash";
export const trashDirOf = (workspace: string) => join(workspace, TRASH_FOLDER);

/** Something can't be moved or deleted. The message is shown to the user as-is. */
export class TrashError extends Error {}

const ENTRY_PATTERN = /^(\d{13})-(.+)$/;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The entry's folder, or null when the name isn't a trash entry. */
function entryPath(trashDir: string, entry: string): string | null {
  const match = ENTRY_PATTERN.exec(entry);
  if (!match || !isSafeFilmId(match[2] ?? "")) return null;
  return resolveInside(trashDir, entry);
}

const LOCKED = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * Runs a move or delete, trying again for a moment when Windows holds the folder (an Explorer window,
 * a terminal, antivirus). Explains it plainly when it stays locked.
 */
async function patiently<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!LOCKED.has(code)) throw error;
      if (attempt >= 5) {
        throw new TrashError(
          "A program is using this film's folder (maybe a terminal, an editor or an Explorer window). Close it and try again.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

/** Moves a film to the trash. Returns its trash entry name. */
export async function moveToTrash(filmsDir: string, trashDir: string, id: string): Promise<string> {
  const from = isSafeFilmId(id) ? resolveInside(filmsDir, id) : null;
  if (!from || !(await exists(from))) throw new TrashError("This film doesn't exist (any more).");
  const entry = `${Date.now()}-${id}`;
  await mkdir(trashDir, { recursive: true });
  await patiently(() => rename(from, join(trashDir, entry)));
  return entry;
}

/** Deletes a film for good (no trash). */
export async function deleteFilmForGood(filmsDir: string, id: string): Promise<void> {
  const dir = isSafeFilmId(id) ? resolveInside(filmsDir, id) : null;
  if (!dir || !(await exists(dir))) throw new TrashError("This film doesn't exist (any more).");
  await patiently(() => rm(dir, { recursive: true, force: true }));
}

async function titleOf(dir: string, fallback: string): Promise<string> {
  try {
    const config = JSON.parse(await readFile(join(dir, "kairos.json"), "utf8"));
    return typeof config.title === "string" && config.title ? config.title : fallback;
  } catch {
    return fallback;
  }
}

/** The films in the trash, newest first. */
export async function listTrash(trashDir: string): Promise<TrashEntry[]> {
  const entries = await readdir(trashDir, { withFileTypes: true }).catch(() => []);
  const list: TrashEntry[] = [];
  for (const item of entries) {
    const match = ENTRY_PATTERN.exec(item.name);
    if (!item.isDirectory() || !match) continue;
    const id = match[2] ?? "";
    list.push({
      entry: item.name,
      id,
      title: await titleOf(join(trashDir, item.name), id),
      deletedAt: new Date(Number(match[1])).toISOString(),
    });
  }
  return list.sort((a, b) => b.entry.localeCompare(a.entry));
}

/** Puts a film back in `films/`, under its old name or, when that is taken, with a number. Returns its id. */
export async function restoreFromTrash(
  filmsDir: string,
  trashDir: string,
  entry: string,
): Promise<string> {
  const from = entryPath(trashDir, entry);
  if (!from || !(await exists(from)))
    throw new TrashError("This film isn't in the trash (any more).");
  const base = ENTRY_PATTERN.exec(entry)?.[2] ?? "film";
  let id = base;
  for (let n = 2; await exists(join(filmsDir, id)); n++) id = `${base}-${n}`;
  await patiently(() => rename(from, join(filmsDir, id)));
  return id;
}

/** Deletes one trashed film for good. */
export async function deleteFromTrash(trashDir: string, entry: string): Promise<void> {
  const dir = entryPath(trashDir, entry);
  if (!dir || !(await exists(dir)))
    throw new TrashError("This film isn't in the trash (any more).");
  await patiently(() => rm(dir, { recursive: true, force: true }));
}

/** Deletes every trashed film for good. */
export async function emptyTrash(trashDir: string): Promise<void> {
  for (const item of await listTrash(trashDir)) await deleteFromTrash(trashDir, item.entry);
}
