/**
 * Video clips over the film: where a clip's box is, how see-through it is and where in its file it is at a film
 * time. The preview, the frame camera and the render all use these, so they always agree.
 */
import { mediaKindOf } from "./media.ts";
import type { VideoClip } from "./types.ts";

/** How long a new picture shows, in seconds. */
export const PICTURE_SECONDS = 3;

/** The places offered for a clip: the middle, or a corner. */
export const CLIP_PLACES = [
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
export type ClipPlace = (typeof CLIP_PLACES)[number];

/** Room between a corner clip and the frame's edges, as a share of the film's width. */
const MARGIN = 0.04;

export const isPicture = (file: string) => mediaKindOf(file) === "image";

/** A clip's box in film pixels: `size` of the film's width, the film's shape, centered at x, y. */
export function clipBox(
  clip: Pick<VideoClip, "size" | "x" | "y">,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const w = clip.size * width;
  const h = clip.size * height;
  return { left: clip.x * width - w / 2, top: clip.y * height - h / 2, width: w, height: h };
}

/** The middle of a clip's box for a place (corners keep a small margin from the edges). */
export function placeAt(
  place: ClipPlace,
  size: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (place === "center") return { x: 0.5, y: 0.5 };
  const mx = MARGIN + size / 2;
  const my = (MARGIN * width) / height + size / 2;
  const x = place.endsWith("left") ? mx : 1 - mx;
  const y = place.startsWith("top") ? my : 1 - my;
  return { x: round4(x), y: round4(y) };
}

/** Which place a clip is at (null: somewhere else). */
export function placeOf(
  clip: Pick<VideoClip, "size" | "x" | "y">,
  width: number,
  height: number,
): ClipPlace | null {
  return (
    CLIP_PLACES.find((place) => {
      const at = placeAt(place, clip.size, width, height);
      return Math.abs(at.x - clip.x) < 0.002 && Math.abs(at.y - clip.y) < 0.002;
    }) ?? null
  );
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * How long a clip shows: its `length`, else the rest of its video (`fileDuration`), else a picture's default.
 * Null while a video's length isn't known yet.
 */
export function clipLength(
  clip: Pick<VideoClip, "file" | "from" | "length">,
  fileDuration?: number,
): number | null {
  if (clip.length !== undefined) return clip.length;
  if (isPicture(clip.file)) return PICTURE_SECONDS;
  if (fileDuration === undefined || !Number.isFinite(fileDuration)) return null;
  return Math.max(0.1, fileDuration - clip.from);
}

/** Where in its file a clip is at film time `t` (seconds), or null when it doesn't show then. */
export function clipTime(
  clip: Pick<VideoClip, "start" | "from">,
  t: number,
  length: number | null,
): number | null {
  const local = t - clip.start;
  if (local < 0) return null;
  if (length !== null && local >= length) return null;
  return clip.from + local;
}

/** How solid a clip is at film time `t`: its opacity, faded in at its start and out at its end. */
export function clipOpacity(
  clip: Pick<VideoClip, "start" | "opacity" | "fade">,
  t: number,
  length: number | null,
): number {
  const local = t - clip.start;
  if (local < 0 || (length !== null && local >= length)) return 0;
  if (clip.fade <= 0) return clip.opacity;
  const fade = length !== null ? Math.min(clip.fade, length / 2) : clip.fade;
  const fadeIn = Math.min(1, local / fade);
  const fadeOut = length !== null ? Math.min(1, (length - local) / fade) : 1;
  return clip.opacity * Math.max(0, Math.min(fadeIn, fadeOut));
}

/** The clips in drawing order: lower tracks first (higher ones draw over them), then in time order. */
export function drawOrder<T extends Pick<VideoClip, "lane" | "start">>(clips: readonly T[]): T[] {
  return clips
    .map((clip, index) => ({ clip, lane: clip.lane ?? index }))
    .sort((a, b) => a.lane - b.lane || a.clip.start - b.clip.start)
    .map(({ clip }) => clip);
}
