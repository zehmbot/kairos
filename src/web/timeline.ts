/**
 * The timeline's math: seconds and pixels, snapping, and the limits of moving and trimming a sound clip.
 * Times are in seconds; stored values are rounded to hundredths, so kairos.json stays readable.
 */
import { lanesOf } from "../shared/lanes.ts";
import type { AudioTrack } from "../shared/types.ts";

/** The shortest a clip can be trimmed to, in seconds. */
export const MIN_CLIP = 0.1;
/** How close (in pixels) an edge must come to something to snap to it. */
export const SNAP_PX = 8;
/** Zoom limits, in pixels per second. */
export const MAX_PPS = 600;

export const round = (t: number) => Math.round(t * 100) / 100;

/** What moving and trimming need from a clip (a sound track or a video clip). */
export interface Clip {
  start: number;
  from: number;
  length?: number;
  lane?: number;
}

/** How long a clip plays: its `length`, else the rest of the file (unknown until the file is read). */
export function clipLength(track: AudioTrack, fileDuration?: number): number | null {
  if (track.length !== undefined) return track.length;
  if (fileDuration === undefined || !Number.isFinite(fileDuration)) return null;
  return Math.max(MIN_CLIP, fileDuration - track.from);
}

/** Every track with an explicit lane, so lanes stay put when tracks are added or removed. */
export function withLanes<T extends { lane?: number }>(tracks: readonly T[]): T[] {
  const lanes = lanesOf(tracks);
  return tracks.map((track, i) => ({ ...track, lane: lanes[i] ?? 0 }));
}

/** How many lanes to show: up to the last used one. */
export function laneCount(tracks: readonly { lane?: number }[]): number {
  const lanes = lanesOf(tracks);
  return lanes.length ? Math.max(...lanes) + 1 : 0;
}

/** The time nearest to `t` among `targets` within the snap distance, else `t` itself. */
export function snapTime(t: number, targets: readonly number[], pps: number): number {
  const reach = SNAP_PX / pps;
  let best = t;
  let distance = reach;
  for (const target of targets) {
    const d = Math.abs(target - t);
    if (d <= distance) {
      best = target;
      distance = d;
    }
  }
  return best;
}

/**
 * Moving a clip: its start snaps (or its end, whichever is closer), never before 0, and the lane follows the
 * pointer (one past the last lane makes a new one).
 */
export function moveClip<T extends Clip>(
  track: T,
  start: number,
  lane: number,
  length: number,
  targets: readonly number[],
  pps: number,
): T {
  const byStart = snapTime(start, targets, pps);
  const byEnd = snapTime(start + length, targets, pps) - length;
  const startSnaps = byStart !== start;
  const endSnaps = byEnd !== start;
  let next = start;
  if (startSnaps && (!endSnaps || Math.abs(byStart - start) <= Math.abs(byEnd - start))) {
    next = byStart;
  } else if (endSnaps) next = byEnd;
  return { ...track, start: round(Math.max(0, next)), lane: Math.max(0, Math.min(31, lane)) };
}

/**
 * Trimming the start: the clip starts later (or earlier) in its file and on the film; its end stays put.
 * `edge` is where the left edge should be on the film.
 */
export function trimStart<T extends Clip>(
  track: T,
  edge: number,
  length: number,
  targets: readonly number[],
  pps: number,
): T {
  const end = track.start + length;
  const earliest = Math.max(0, track.start - track.from); // can't go before the file's start or the film's
  const latest = end - MIN_CLIP;
  const left = Math.min(latest, Math.max(earliest, snapTime(edge, targets, pps)));
  const shift = left - track.start;
  return {
    ...track,
    start: round(left),
    from: round(Math.max(0, track.from + shift)),
    length: round(end - left),
  };
}

/** Trimming the end: the clip stops sooner (or later, up to the end of its file). */
export function trimEnd<T extends Clip>(
  track: T,
  edge: number,
  fileDuration: number | undefined,
  targets: readonly number[],
  pps: number,
): T {
  const most = fileDuration !== undefined ? fileDuration - track.from : Number.POSITIVE_INFINITY;
  const length = Math.min(most, Math.max(MIN_CLIP, snapTime(edge, targets, pps) - track.start));
  return { ...track, length: round(length) };
}

/** Pixels per second that fit the whole film in `width` pixels. */
export const fitZoom = (width: number, duration: number) =>
  Math.max(1, width / Math.max(duration, 0.1));

/** Time between ruler ticks, so labels stay at least ~70 px apart. */
export function tickStep(pps: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((step) => step * pps >= 70) ?? 600;
}

/** "0:05", "1:30", "0:02.5" (tenths only when the ticks need them). */
export function tickLabel(t: number, step: number): string {
  const minutes = Math.floor(t / 60);
  const seconds = t - minutes * 60;
  const text =
    step < 1 ? seconds.toFixed(step < 0.25 ? 1 : 2).replace(/0$/, "") : String(Math.round(seconds));
  const [whole, part] = text.split(".");
  return `${minutes}:${(whole ?? "0").padStart(2, "0")}${part ? `.${part}` : ""}`;
}
