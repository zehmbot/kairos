/**
 * Adding files to a film: what each kind of file can be used for, and where it goes.
 * Used by the drop-anywhere question, the Add button and the panels.
 */
import { type MediaKind, mediaKindOf } from "../shared/media.ts";

/** What a file is for. */
export type Purpose = "sound" | "clip" | "reference" | "film" | "library";

export const PURPOSE_TEXT: Record<Purpose, { label: string; sub: string }> = {
  sound: { label: "Add to the film's sound", sub: "A sound track, from the player's current time" },
  clip: {
    label: "Put it on the timeline",
    sub: "Over the film, from the player's current time (a video track)",
  },
  reference: { label: "Reference for Claude", sub: "Claude looks at it to match the style" },
  film: { label: "Use in this film", sub: "Copied into the film folder for Claude to use" },
  library: { label: "Keep in my assets", sub: "Saved in your library, for any film" },
};

/** What a file of this kind can be used for, the usual choice first. Library files can't go to the library. */
export function purposesFor(kind: MediaKind, name: string, fromLibrary = false): Purpose[] {
  const svg = name.toLowerCase().endsWith(".svg");
  const all: Record<MediaKind, Purpose[]> = {
    sound: ["sound", "library"],
    video: ["clip", "reference", "film", "library"],
    image: svg ? ["film", "library"] : ["clip", "reference", "film", "library"],
    font: ["film", "library"],
  };
  return all[kind].filter((purpose) => !(fromLibrary && purpose === "library"));
}

export interface FileGroup {
  kind: MediaKind;
  files: File[];
}

/** Dropped files, grouped by kind (in a stable order), plus the ones Kairos can't use. */
export function groupFiles(files: readonly File[]): { groups: FileGroup[]; unknown: File[] } {
  const order: MediaKind[] = ["sound", "video", "image", "font"];
  const byKind = new Map<MediaKind, File[]>();
  const unknown: File[] = [];
  for (const file of files) {
    const kind = mediaKindOf(file.name);
    if (!kind) unknown.push(file);
    else byKind.set(kind, [...(byKind.get(kind) ?? []), file]);
  }
  return {
    groups: order
      .filter((kind) => byKind.has(kind))
      .map((kind) => ({ kind, files: byKind.get(kind) ?? [] })),
    unknown,
  };
}

/** Where a file is sent for a purpose. `start` (seconds) is for sounds and clips. */
export function uploadUrl(filmId: string, purpose: Purpose, name: string, start = 0): string {
  const film = `/api/films/${encodeURIComponent(filmId)}`;
  const q = `name=${encodeURIComponent(name)}`;
  switch (purpose) {
    case "sound":
      return `${film}/sounds?${q}&start=${start.toFixed(2)}`;
    case "clip":
      return `${film}/clips?${q}&start=${start.toFixed(2)}`;
    case "reference":
      return `${film}/references?${q}`;
    case "film":
      return `${film}/files?${q}`;
    case "library":
      return `/api/assets?${q}`;
  }
}

/** The side tab that shows the result of a purpose (or null: stay where you are). */
export function tabFor(purpose: Purpose): "sound" | "references" | null {
  return purpose === "sound" ? "sound" : purpose === "reference" ? "references" : null;
}
