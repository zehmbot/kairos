import type { Note, NoteShape, NoteTool } from "../../shared/types.ts";
import { formatTimecode } from "./time.ts";

export type Point = [number, number];

/** A rectangle on screen, like `getBoundingClientRect()`. */
interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Turns a pointer position on screen into film pixels, kept inside the frame. */
export function toFilmPoint(
  clientX: number,
  clientY: number,
  box: ScreenBox,
  film: { width: number; height: number },
): Point {
  const x = ((clientX - box.left) / box.width) * film.width;
  const y = ((clientY - box.top) / box.height) * film.height;
  const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(value, 0), max));
  return [clamp(x, film.width), clamp(y, film.height)];
}

/** Drags shorter than this (in film pixels) are treated as accidental. */
export function minDrag(film: { width: number; height: number }): number {
  return Math.max(4, Math.round(Math.min(film.width, film.height) / 100));
}

/**
 * Builds a mark from the points of one drag (first point = where the pointer went down).
 * Returns `null` when the drag is too small to mean anything.
 */
export function shapeFromDrag(
  tool: NoteTool,
  points: readonly Point[],
  minSize: number,
): NoteShape | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;

  switch (tool) {
    case "point":
      return { type: "point", x: first[0], y: first[1] };
    case "box": {
      const w = last[0] - first[0];
      const h = last[1] - first[1];
      if (Math.abs(w) < minSize || Math.abs(h) < minSize) return null;
      return {
        type: "box",
        x: Math.min(first[0], last[0]),
        y: Math.min(first[1], last[1]),
        w: Math.abs(w),
        h: Math.abs(h),
      };
    }
    case "arrow":
      if (Math.hypot(last[0] - first[0], last[1] - first[1]) < minSize) return null;
      return { type: "arrow", x1: first[0], y1: first[1], x2: last[0], y2: last[1] };
    case "pen": {
      // A scribble smaller than `minSize` either way was a slip of the mouse.
      const xs = points.map((point) => point[0]);
      const ys = points.map((point) => point[1]);
      const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (extent < minSize) return null;
      // Keep points at least a quarter of `minSize` apart: smaller files, same line.
      const step = minSize / 4;
      const kept: Point[] = [first];
      for (const point of points.slice(1)) {
        const previous = kept[kept.length - 1] ?? first;
        if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= step) kept.push(point);
      }
      if (kept.length < 2) return null;
      // Very long strokes are sampled evenly down to the 2000 points a note can hold.
      const every = Math.ceil(kept.length / 2000);
      const sampled =
        every > 1 ? kept.filter((_, i) => i % every === 0 || i === kept.length - 1) : kept;
      return { type: "pen", points: sampled };
    }
  }
}

const frameOf = (t: number, fps: number) => Math.floor(t * fps + 1e-6);

/** Is the note about the frame showing at time `t`? */
export function noteCovers(note: Pick<Note, "t" | "until">, t: number, fps: number): boolean {
  if (note.until === null) return frameOf(note.t, fps) === frameOf(t, fps);
  return frameOf(t, fps) >= frameOf(note.t, fps) && frameOf(t, fps) <= frameOf(note.until, fps);
}

/** `00:01.20`, or `00:01.20 to 00:02.00` for a range (the pixel font has no arrow). */
export function noteTimeLabel(note: Pick<Note, "t" | "until">): string {
  return note.until === null
    ? formatTimecode(note.t)
    : `${formatTimecode(note.t)} to ${formatTimecode(note.until)}`;
}
