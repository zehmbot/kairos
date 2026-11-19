/**
 * Keeping a film's sound in step with the preview. The player's clock leads; every track follows it.
 */

/** A sound track as the preview plays it. */
export interface PreviewTrack {
  /** Address of the file on the film server. */
  url: string;
  /** Seconds from the start of the film. */
  start: number;
  /** 0 to 2 (the preview can't go above 1: louder tracks play at full volume). */
  volume: number;
}

/** How far a track may drift from the picture before it is moved back in step, in seconds. */
export const DRIFT_LIMIT = 0.08;

/**
 * Where a track's file should be at film time `t`, in seconds into the file, or `null` when the track
 * is silent then (it hasn't started yet, or it already ended).
 */
export function trackPosition(start: number, t: number, fileDuration = Number.NaN): number | null {
  const local = t - start;
  if (local < 0) return null;
  if (Number.isFinite(fileDuration) && local >= fileDuration) return null;
  return local;
}

/** True when a playing track is too far from where the picture is. */
export function needsSeek(current: number, expected: number, limit = DRIFT_LIMIT): boolean {
  return Math.abs(current - expected) > limit;
}

/** The volume an `<audio>` element can use (0 to 1). */
export function elementVolume(trackVolume: number, master: number, muted: boolean): number {
  if (muted) return 0;
  return Math.min(1, Math.max(0, trackVolume * master));
}

/** The address of a film's file on the film server, each path part encoded. */
export function filmFileUrl(origin: string, filmId: string, file: string): string {
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `${origin}/${encodeURIComponent(filmId)}/${path}`;
}
