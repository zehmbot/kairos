/**
 * Exporting a film for where it goes: YouTube (wide), Shorts, TikTok and Reels (tall), a square post. A film made in
 * one shape can go out in another: a film that reframes itself (Blocky) is drawn at the new size, any other film is
 * fitted into it (bars or a crop). Shared by the hub, the player and the Render dialog.
 */
import { FILM_SHAPES, type FilmShape } from "./types.ts";

/** What each shape is made for, in the Render dialog and the Renders page. */
export const SHAPE_USES: Record<FilmShape, { label: string; short: string }> = {
  wide: { label: "YouTube", short: "Wide" },
  tall: { label: "Shorts · TikTok · Reels", short: "Tall" },
  square: { label: "Square post", short: "Square" },
};

/** Shorts and Reels take up to 3 minutes. */
export const SHORTS_MAX_SECONDS = 180;

/** The page address asks the film for another size (`1080x1920`), or to leave its captions out (`off`). */
export const SIZE_PARAM = "kairos-size";
export const CAPTIONS_PARAM = "kairos-captions";

interface Size {
  width: number;
  height: number;
}

/** The shape a size has, when it is one of the three (2% slack); null for any other shape (4:5, 21:9...). */
export function shapeOf({ width, height }: Size): FilmShape | null {
  const ratio = width / height;
  for (const [shape, size] of Object.entries(FILM_SHAPES) as [FilmShape, Size][]) {
    if (Math.abs(ratio / (size.width / size.height) - 1) <= 0.02) return shape;
  }
  return null;
}

/** A film's shape in one word (Wide, Tall, Square), or its size for any other shape ("1080 × 1350"). */
export function shapeName(size: Size): string {
  const shape = shapeOf(size);
  return shape ? SHAPE_USES[shape].short : `${size.width} × ${size.height}`;
}

/** The size a film goes out at: its own when it already has that shape (or none is asked), else the shape's. */
export function exportSize(film: Size, shape?: FilmShape | null): Size {
  if (!shape || shapeOf(film) === shape) return { width: film.width, height: film.height };
  return { width: FILM_SHAPES[shape].width, height: FILM_SHAPES[shape].height };
}

/** Is the film going out in another shape than its own? */
export const isReshaped = (film: Size, size: Size) =>
  film.width !== size.width || film.height !== size.height;

/** The page address' query that asks a film to show at `size` and/or without its captions ("" for neither). */
export function showingQuery(options: { size?: Size | null; captions?: boolean }): string {
  const query = new URLSearchParams();
  if (options.size) query.set(SIZE_PARAM, `${options.size.width}x${options.size.height}`);
  if (options.captions === false) query.set(CAPTIONS_PARAM, "off");
  return query.toString();
}

/** `url` with `query` added (after `?` or `&`). */
export const withQuery = (url: string, query: string) =>
  query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
