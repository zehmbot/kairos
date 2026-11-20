import { useEffect, useState } from "react";
import type { ClaudeStage } from "../../shared/types.ts";

/**
 * The Claude character at work, drawn in pixels: a 16×16 crab (body, two eyes, short arms, four legs) in a
 * 20×19 scene with what it is busy with above its head. Each kind of work has a few frames, switched in steps
 * like a sprite; with reduced motion it holds still.
 */
export type BuddyMood = ClaudeStage | "done";

type Rect = [x: number, y: number, w: number, h: number, color: string];

const W = 20;
const H = 19;
const BODY = "var(--c-orange)";
const EYE = "var(--c-night)";

/** Frames per second, and how many frames each mood has. */
const PACE: Record<BuddyMood, { fps: number; frames: number }> = {
  thinking: { fps: 3, frames: 6 },
  reading: { fps: 2, frames: 8 },
  writing: { fps: 5, frames: 8 },
  looking: { fps: 3, frames: 6 },
  voices: { fps: 4, frames: 8 },
  waiting: { fps: 2.5, frames: 4 },
  done: { fps: 6, frames: 6 },
};

interface Pose {
  /** Where the crab stands (its 16×16 box). */
  x?: number;
  y?: number;
  /** Eyes: -1 left, 1 right; up looks at what is above. */
  look?: number;
  up?: boolean;
  blink?: boolean;
  /** Arms: out, one arm down then the other (typing), or both raised. */
  arms?: "out" | "left" | "right" | "up";
  /** A foot lifted (tapping). */
  tap?: boolean;
}

/** The crab, from the 16×16 picture: body 12×8, eyes at columns 4 and 11, arms on rows 11-12, four legs. */
function crab(pose: Pose): Rect[] {
  const ox = 2 + (pose.x ?? 0);
  const oy = 3 + (pose.y ?? 0);
  const rects: Rect[] = [[ox + 2, oy + 6, 12, 8, BODY]];
  const arms = pose.arms ?? "out";
  const leftY = arms === "left" ? 12 : arms === "up" ? 9 : 11;
  const rightY = arms === "right" ? 12 : arms === "up" ? 9 : 11;
  rects.push([ox, oy + leftY, 2, 2, BODY], [ox + 14, oy + rightY, 2, 2, BODY]);
  if (arms === "up") rects.push([ox, oy + 11, 1, 1, BODY], [ox + 15, oy + 11, 1, 1, BODY]);
  for (const [i, legX] of [3, 5, 10, 12].entries()) {
    const lifted = pose.tap && i === 3;
    rects.push([ox + legX, oy + 14, 1, lifted ? 1 : 2, BODY]);
  }
  const look = pose.look ?? 0;
  const eyeY = oy + (pose.up ? 7 : 8);
  const eyeH = pose.blink ? 1 : 2;
  const blinkY = pose.blink ? eyeY + 1 : eyeY;
  rects.push([ox + 4 + look, blinkY, 1, eyeH, EYE], [ox + 11 + look, blinkY, 1, eyeH, EYE]);
  return rects;
}

/** A small panel above the crab's head. */
const panel = (fill: string, edge: string): Rect[] => [
  [4, 0, 12, 8, edge],
  [5, 1, 10, 6, fill],
];

const sparkle = (x: number, y: number, color: string): Rect[] => [
  [x + 1, y, 1, 3, color],
  [x, y + 1, 3, 1, color],
];

const note = (x: number, y: number): Rect[] => [
  [x + 2, y, 1, 3, "var(--c-yellow)"],
  [x, y + 2, 3, 2, "var(--c-yellow)"],
];

function frameOf(mood: BuddyMood, i: number): Rect[] {
  switch (mood) {
    case "thinking": {
      // Dots appear one by one; a small bob and a blink now and then.
      const dots = (i % 3) + 1;
      const rects: Rect[] = [];
      for (let d = 0; d < dots; d++) rects.push([6 + d * 3, 5, 2, 2, "var(--c-silver)"]);
      return [...rects, ...crab({ y: -(i % 2), blink: i === 4, look: i < 3 ? 0 : 1 })];
    }
    case "reading": {
      // A page above; the eyes read along it, line by line.
      const lines: Rect[] = [6, 8, 10, 7].map((w, row) => [6, 2 + row, w, 1, "var(--c-slate)"]);
      const looks = [-1, 0, 1, 1, -1, 0, 1, 0];
      return [
        ...panel("var(--c-white)", "var(--c-silver)"),
        ...lines,
        ...crab({ look: looks[i] ?? 0, up: true, blink: i === 6 }),
      ];
    }
    case "writing": {
      // A screen above fills with lines of code while the arms type.
      const widths = [5, 8, 4, 7, 6];
      const colors = ["var(--c-mint)", "var(--c-yellow)", "var(--c-orange)", "var(--c-lime)"];
      const shown = Math.min(widths.length, Math.floor(i / 1.6) + 1);
      const code: Rect[] = widths
        .slice(0, shown)
        .map((w, row) => [6, 1 + row, w, 1, colors[row % 4] ?? ""]);
      const cursor: Rect[] =
        i % 2 === 0 ? [[6 + (widths[shown - 1] ?? 0) + 1, shown, 1, 1, "var(--c-white)"]] : [];
      return [
        ...panel("var(--c-navy)", "var(--c-slate)"),
        ...code,
        ...cursor,
        ...crab({ arms: i % 2 === 0 ? "left" : "right", look: 0, up: true }),
      ];
    }
    case "looking": {
      // A film frame above: a sky, a hill, a sun moving across.
      const sunX = 6 + ((i * 2) % 8);
      const holes: Rect[] = [];
      for (let x = 5; x < 15; x += 2) holes.push([x, 0, 1, 1, "var(--c-night)"]);
      for (let x = 5; x < 15; x += 2) holes.push([x, 7, 1, 1, "var(--c-night)"]);
      return [
        ...panel("var(--c-sky)", "var(--c-silver)"),
        ...holes,
        [sunX, 2, 2, 2, "var(--c-yellow)"],
        [5, 5, 10, 2, "var(--c-green)"],
        ...crab({ up: true, look: i < 3 ? -1 : 1, blink: i === 5 }),
      ];
    }
    case "voices": {
      // Notes float up and away.
      const rise = (start: number) => 5 - ((i + start) % 6);
      return [
        ...note(4, rise(0)),
        ...note(9, rise(2)),
        ...note(14, rise(4)),
        ...crab({ y: -(i % 2), arms: i % 4 < 2 ? "out" : "up", look: 0 }),
      ];
    }
    case "waiting": {
      // A question mark, and a foot tapping.
      const mark: Rect[] = [
        [8, 0, 4, 1, "var(--c-yellow)"],
        [11, 1, 1, 2, "var(--c-yellow)"],
        [9, 3, 2, 1, "var(--c-yellow)"],
        [9, 4, 1, 1, "var(--c-yellow)"],
        [9, 6, 1, 1, "var(--c-yellow)"],
      ];
      return [...mark, ...crab({ tap: i % 2 === 1, look: i < 2 ? 0 : 1, blink: i === 3 })];
    }
    case "done": {
      // A jump with sparkles.
      const jump = [0, -2, -3, -2, 0, 0][i] ?? 0;
      const spark = i % 2 === 0 ? "var(--c-yellow)" : "var(--c-white)";
      return [
        ...sparkle(1, 2 + (i % 2), spark),
        ...sparkle(16, 1 + ((i + 1) % 2), spark),
        ...sparkle(9, 0, i % 3 === 0 ? "var(--c-mint)" : spark),
        ...crab({ y: jump, arms: jump < 0 ? "up" : "out", blink: true }),
      ];
    }
  }
}

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const change = () => setReduced(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, []);
  return reduced;
}

export function ClaudeBuddy({ mood, size = 160 }: { mood: BuddyMood; size?: number }) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const pace = PACE[mood];

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000 / pace.fps);
    return () => clearInterval(timer);
  }, [reduced, pace.fps]);

  const rects = frameOf(mood, reduced ? 0 : tick % pace.frames);
  return (
    <svg
      className="claude-buddy"
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      shapeRendering="crispEdges"
      aria-hidden="true"
      data-mood={mood}
    >
      {rects.map(([x, y, w, h, color], index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a frame is redrawn whole; the order is the key.
        <rect key={index} x={x} y={y} width={w} height={h} fill={color} />
      ))}
    </svg>
  );
}
