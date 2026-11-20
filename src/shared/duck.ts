/**
 * Music under the narration: a track marked `duck` gets quieter while voices talk. The preview and the render
 * use the same curve: down to `level` during each stretch of talking, with short ramps on both sides. Talking
 * stretches closer than `join` seconds are one (the music doesn't pump up between two lines).
 */

export const DUCK = { level: 0.3, ramp: 0.25, join: 0.6 };

export type Span = readonly [start: number, end: number];

/** Where voices talk on the timeline: `[start, end]` of each voice clip (`voice/...`) that plays. */
export function voiceSpans(
  tracks: readonly {
    file: string;
    start: number;
    from?: number;
    length?: number;
    muted?: boolean;
  }[],
  lines: readonly { file: string; duration: number }[],
): [number, number][] {
  return tracks.flatMap((track) => {
    if (track.muted || !track.file.startsWith("voice/")) return [];
    const length =
      track.length ??
      (lines.find((line) => line.file === track.file)?.duration ?? 0) - (track.from ?? 0);
    return length > 0 ? [[track.start, track.start + length] as [number, number]] : [];
  });
}

/** The stretches where voices talk, in order, with short gaps between them joined. */
export function talkSpans(spans: readonly Span[]): [number, number][] {
  const sorted = spans
    .filter(([start, end]) => end > start)
    .map(([start, end]) => [start, end] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span[0] - last[1] < DUCK.join) last[1] = Math.max(last[1], span[1]);
    else merged.push(span);
  }
  return merged;
}

/** How loud the music is at film time `t`, from 1 (its own volume) down to DUCK.level. */
export function duckGain(spans: readonly Span[], t: number): number {
  let gain = 1;
  for (const [start, end] of spans) {
    const inside = Math.min(
      (t - (start - DUCK.ramp)) / DUCK.ramp,
      (end + DUCK.ramp - t) / DUCK.ramp,
    );
    const k = Math.min(1, Math.max(0, inside));
    gain = Math.min(gain, 1 - (1 - DUCK.level) * k);
  }
  return gain;
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The same curve as an ffmpeg `volume` expression of `t` (film time), for `eval=frame`. Its commas need the
 * expression quoted in the filter graph (`volume='...'`).
 */
export function duckExpression(spans: readonly Span[]): string {
  if (spans.length === 0) return "1";
  const terms = spans.map(
    ([start, end]) =>
      `1-${num(1 - DUCK.level)}*clip(min((t-${num(start - DUCK.ramp)})/${num(DUCK.ramp)},(${num(end + DUCK.ramp)}-t)/${num(DUCK.ramp)}),0,1)`,
  );
  return terms.reduce((all, term) => `min(${all},${term})`);
}
