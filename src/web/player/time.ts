/**
 * Time formatting and scenes for the player. The frame math lives in src/shared/frames.ts, shared with
 * the renderer: frames are counted from 0, and frame `f` shows time `f / fps`.
 */

export { clampFrame, frameAt, frameCount, timeOf } from "../../shared/frames.ts";

/** `75.5` -> `"01:15.50"` */
export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const centis = Math.round(safe * 100);
  const minutes = Math.floor(centis / 6000);
  const secs = Math.floor((centis % 6000) / 100);
  const cs = centis % 100;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** The scene playing at time `t`, if the film has scenes. A scene without `end` lasts until the next one. */
export function sceneAt<S extends { start: number; end?: number }>(
  scenes: readonly S[],
  t: number,
): S | undefined {
  const sorted = [...scenes].sort((a, b) => a.start - b.start);
  return sorted.find((scene, i) => {
    const end = scene.end ?? sorted[i + 1]?.start ?? Number.POSITIVE_INFINITY;
    return t >= scene.start && t < end;
  });
}

/** A film length in plain words: `5` -> `"5 s"`, `2.5` -> `"2.5 s"`, `75` -> `"1 min 15 s"`. */
export function formatLength(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  if (rounded < 60) return `${rounded} s`;
  const minutes = Math.floor(rounded / 60);
  const rest = Math.round((rounded - minutes * 60) * 10) / 10;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
