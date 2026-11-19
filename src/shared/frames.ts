/**
 * Frame and time math, shared by the player and the renderer so both agree to the frame.
 * Frames are counted from 0; frame `f` shows time `f / fps`.
 */

/** Number of frames in a film (at least 1). */
export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}

export function clampFrame(frame: number, total: number): number {
  return Math.min(Math.max(0, Math.round(frame)), Math.max(0, total - 1));
}

/** The frame showing at time `t`. */
export function frameAt(t: number, fps: number, total: number): number {
  // The small nudge keeps exact frame times (like 0.1 * 30 = 2.9999...) on their own frame.
  return clampFrame(Math.floor(t * fps + 1e-6), total);
}

export function timeOf(frame: number, fps: number): number {
  return frame / fps;
}
