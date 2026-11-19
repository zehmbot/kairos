import { type FSWatcher, watch } from "node:fs";
import { isSafeFilmId } from "./workspace.ts";

/** Folders inside a film whose changes never reload the preview. */
// Changes here never reload the preview: videos, dependencies, and reference clips (not part of the film).
const IGNORED_FOLDERS = new Set(["renders", "node_modules", "references"]);

/**
 * Works out which film a changed path belongs to. `relPath` is relative to the films folder,
 * with `/` or `\` separators. Returns `null` for changes that don't matter: hidden files and folders
 * (like `.kairos/`), renders, and anything that is not inside a film folder.
 *
 * A "change" on the film folder itself is ignored too: Windows sends one whenever anything inside it changes,
 * hidden files included. Real edits always come with their own path, and a film folder being added, removed or
 * renamed arrives as "rename".
 */
export function filmIdFromPath(relPath: string, eventType = "rename"): string | null {
  const parts = relPath.split(/[\\/]/).filter((part) => part !== "");
  const [id, ...rest] = parts;
  if (!id || !isSafeFilmId(id)) return null;
  if (rest.length === 0 && eventType === "change") return null;
  if (rest.some((part) => part.startsWith("."))) return null;
  if (rest[0] && IGNORED_FOLDERS.has(rest[0])) return null;
  return id;
}

export interface FilmWatcher {
  close(): void;
}

/**
 * Watches every film in `filmsDir` and calls `onChange` with the ids of the films that changed.
 * Bursts of changes (an editor saving several files) are grouped: `onChange` runs once things have been
 * quiet for `delayMs`.
 */
export function watchFilms(
  filmsDir: string,
  onChange: (ids: string[]) => void,
  delayMs = 150,
): FilmWatcher {
  const changed = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let watcher: FSWatcher | undefined;

  const flush = () => {
    timer = undefined;
    const ids = [...changed];
    changed.clear();
    if (ids.length > 0) onChange(ids);
  };

  try {
    watcher = watch(filmsDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const id = filmIdFromPath(filename.toString(), eventType);
      if (!id) return;
      changed.add(id);
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    });
    watcher.on("error", (error) => {
      console.warn(`Stopped watching ${filmsDir}: ${error.message}`);
      watcher?.close();
    });
  } catch (error) {
    console.warn(`Could not watch ${filmsDir}: ${(error as Error).message}`);
  }

  return {
    close() {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}
