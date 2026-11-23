// Moving characters: where everyone is in each shot, and walks from spot to spot. A shot's `go` sends someone
// somewhere: they stand up if they sit, turn toward the way with small steps, speed up, walk (or run, sneak,
// tiptoe) around the furniture, slow down, turn to face where they arrived, and sit down when it's a seat. `look`
// turns someone toward someone else. People who moved stay where they went for the next shots in the same place.
// Everything is planned once (`planMotion`) and read at any time (`personState`): pure functions of t.
import {
  addPose,
  arrivalSway,
  fallPose,
  gaitWithWeight,
  getUpPose,
  hitPose,
  jumpPose,
  pickUpPose,
  punchPose,
  throwPose,
} from "./animation.js";
import { layoutOf } from "./layouts.js";
import {
  blendPoses,
  GAIT_NAMES,
  GAITS,
  gaitPose,
  isLying,
  isSitting,
  poseAt,
  SEAT_REACH,
  seatBack,
  sitDownPose,
  speedOf,
  standBack,
  standUpPose,
} from "./poses.js";
import { ANGLES, cameraSide, SHOT_TYPES } from "./shots.js";
import { effectTime } from "./timing.js";

/** Where someone can come from or go to, outside the picture. */
export const OFF_SPOTS = ["off-left", "off-right", "off-back"];
export const PACES = GAIT_NAMES;

/** Turns smaller than this (radians) happen while walking; bigger ones first, with small steps on the spot. */
export const TURN_MIN = 0.45;
export const turnSeconds = (angle) => 0.22 + (0.34 * Math.abs(angle)) / Math.PI;
export const SIT_SECONDS = 0.95;
export const STAND_SECONDS = 0.85;
/** Lying down at the end of a walk: a quick flop onto the bed. */
export const FLOP_SECONDS = 0.45;
/** Speeding up and slowing down, seconds (from and to standing still). */
const RAMPS = {
  walk: [0.35, 0.4],
  run: [0.3, 0.35],
  sprint: [0.42, 0.45],
  sneak: [0.4, 0.4],
  tiptoe: [0.3, 0.3],
};
/** How far a walker keeps from furniture (units, for a size-1 figure). */
export const CLEARANCE = 1.15;
/** How far from someone a walk up to them stops. */
export const MEET = 2.7;
/** Within this, a standing person told to sit walks to the seat; farther, the shot cuts to them sitting. */
const WALK_TO_SEAT = 9;
/** How far from a thing a walk to it stops (a hand's reach, units for a size-1 figure). */
export const REACH = 1.9;
/** Two standing people closer than this (times their sizes) are inside each other. */
const PERSONAL = 1.7;
/** Gravity in units per second² (9.81 m/s² at 5.3 units = 1.8 m): jumps and falling things agree. */
export const GRAVITY = 9.81 * (5.3 / 1.8);

// Actions (`act`): how long each part takes, in seconds.
/** A punch: winding up, then the drive to the contact; after it, follow-through and recovery. */
export const PUNCH = { windUp: 0.26, drive: 0.15, follow: 0.16, recover: 0.42 };
/** A light hit: staggering back. A hard one: falling, lying a moment, getting up. */
export const HIT = { stagger: 0.75, fall: 1.15, lie: 0.55, getUp: 1.55 };
/** Picking something up: reaching, the grip, lifting it to the chest. */
export const PICK = { reach: 0.42, lift: 0.36 };
/** Throwing: winding up, the release, following through. */
export const THROW = { windUp: 0.38, follow: 0.34 };
/** How far a hard hit sends someone before they get up (units, size 1), and a light one. */
const FALL_DISTANCE = 2.1;
const STAGGER_DISTANCE = 0.75;

const STANDING = [
  [],
  ["center"],
  ["left", "right"],
  ["left", "center", "right"],
  ["left", "center", "right", "back"],
  ["left", "center", "right", "back", "front"],
];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (k) => {
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};
const easeInOut = (k) => {
  const x = clamp(k);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};
/** An angle between -π and π. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** The `rot` that faces along (dx, dz): 0 faces +z. */
export const facingOf = (dx, dz) => Math.atan2(dx, dz);
const forwardOf = (rot) => ({ x: Math.sin(rot), z: Math.cos(rot) });
const lerpAngle = (a, b, k) => a + wrapAngle(b - a) * k;
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const cap = (id) => id.charAt(0).toUpperCase() + id.slice(1);

/** Who talks in a shot: the speakers of its words, and `talk`. */
export function talksIn(entry, id) {
  const shot = entry.shot;
  return (
    entry.words.some((w) => w.speaker === id) ||
    shot.talk === id ||
    (Array.isArray(shot.talk) && shot.talk.includes(id))
  );
}

/** The pose someone has in a shot: the shot's, or one that fits their posture and whether they talk. */
export function poseFor(entry, id, posture = "stand") {
  const asked = entry.shot.pose?.[id];
  if (asked) return asked;
  const talks = talksIn(entry, id);
  if (posture === "sit") return talks ? "sitTalk" : "sit";
  if (posture === "lie") return "lie";
  return talks ? "talk" : "idle";
}

// ---------- Paths around furniture ----------

/** A footprint's corners and a point in its own frame. */
function local(block, p) {
  const c = Math.cos(block.rot ?? 0);
  const s = Math.sin(block.rot ?? 0);
  const dx = p.x - block.x;
  const dz = p.z - block.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
function world(block, lx, lz) {
  const c = Math.cos(block.rot ?? 0);
  const s = Math.sin(block.rot ?? 0);
  return { x: block.x + lx * c + lz * s, z: block.z - lx * s + lz * c };
}
/** Is the point inside the footprint, grown by `grow`? */
export function insideBlock(block, p, grow = 0) {
  const q = local(block, p);
  return Math.abs(q.x) < block.w / 2 + grow && Math.abs(q.z) < block.d / 2 + grow;
}
/** Does the segment a-b go through the footprint grown by `grow` (touching its edge doesn't count)? */
export function crossesBlock(block, a, b, grow = 0) {
  const p = local(block, a);
  const q = local(block, b);
  const hw = block.w / 2 + grow - 1e-3;
  const hd = block.d / 2 + grow - 1e-3;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  for (const [delta, start, min, max] of [
    [dx, p.x, -hw, hw],
    [dz, p.z, -hd, hd],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (start <= min || start >= max) return false;
      continue;
    }
    let ta = (min - start) / delta;
    let tb = (max - start) / delta;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

const inBounds = (layout, p) =>
  !layout.bounds ||
  (p.x >= layout.bounds.minX &&
    p.x <= layout.bounds.maxX &&
    p.z >= layout.bounds.minZ &&
    p.z <= layout.bounds.maxZ);

/**
 * The shortest way from `a` to `b` around the furniture (`layout.blocks`, grown by `clearance`): straight lines
 * between the footprints' corners. Furniture `a` or `b` stands in (a seat) doesn't count. Returns
 * `{ points, blocked }`: `blocked` names what was in the way when there is no way around.
 */
export function findPath(layout, a, b, clearance = CLEARANCE) {
  const blocks = (layout.blocks ?? []).filter(
    (block) => !insideBlock(block, a, clearance) && !insideBlock(block, b, clearance),
  );
  const clear = (p, q) => blocks.every((block) => !crossesBlock(block, p, q, clearance));
  if (clear(a, b)) return { points: [a, b], blocked: null };
  const nodes = [a, b];
  for (const block of blocks) {
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const corner = world(
        block,
        sx * (block.w / 2 + clearance + 0.05),
        sz * (block.d / 2 + clearance + 0.05),
      );
      if (
        blocks.every((other) => !insideBlock(other, corner, clearance)) &&
        inBounds(layout, corner)
      ) {
        nodes.push(corner);
      }
    }
  }
  // Dijkstra over the nodes that see each other.
  const n = nodes.length;
  const best = new Array(n).fill(Number.POSITIVE_INFINITY);
  const from = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  best[0] = 0;
  for (;;) {
    let i = -1;
    for (let k = 0; k < n; k++) if (!done[k] && (i < 0 || best[k] < best[i])) i = k;
    if (i < 0 || !Number.isFinite(best[i])) break;
    if (i === 1) break;
    done[i] = true;
    for (let k = 0; k < n; k++) {
      if (done[k] || k === i) continue;
      const d = best[i] + dist(nodes[i], nodes[k]);
      if (d < best[k] && clear(nodes[i], nodes[k])) {
        best[k] = d;
        from[k] = i;
      }
    }
  }
  if (!Number.isFinite(best[1])) {
    const hit = blocks.find((block) => crossesBlock(block, a, b, clearance));
    return { points: [a, b], blocked: hit?.name ?? "something" };
  }
  const points = [];
  for (let k = 1; k >= 0; k = from[k]) points.unshift(nodes[k]);
  return { points, blocked: null };
}

/** Is there room to stand at `p` (outside every footprint grown by `grow`, inside the place)? */
export const roomAt = (layout, p, grow) =>
  inBounds(layout, p) && (layout.blocks ?? []).every((block) => !insideBlock(block, p, grow));

/**
 * The nearest point to `ideal` with room to stand. With `around` and `distance`, the point stays that far from
 * `around` (walking up to someone or something: another side of them first), else it may come closer or go farther.
 * Returns null when there is none within a few steps.
 */
export function freeSpot(layout, ideal, grow, { around = null, distance = 0 } = {}) {
  if (roomAt(layout, ideal, grow)) return ideal;
  if (around) {
    const start = Math.atan2(ideal.x - around.x, ideal.z - around.z);
    for (const scale of [1, 1.25, 1.6, 2.1]) {
      for (let k = 1; k <= 12; k++) {
        for (const sign of [1, -1]) {
          const a = start + sign * k * (Math.PI / 12);
          const p = {
            x: around.x + Math.sin(a) * distance * scale,
            z: around.z + Math.cos(a) * distance * scale,
          };
          if (roomAt(layout, p, grow)) return p;
        }
      }
    }
    return null;
  }
  for (let r = 0.4; r <= 8; r += 0.4) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = { x: ideal.x + Math.sin(a) * r, z: ideal.z + Math.cos(a) * r };
      if (roomAt(layout, p, grow)) return p;
    }
  }
  return null;
}

/** A block named like `name` ("coffee table" finds "the coffee table"). */
export const blockNamed = (layout, name) => {
  const want = String(name).toLowerCase().replace(/^the /, "");
  return (layout.blocks ?? []).find((b) => b.name.toLowerCase().replace(/^the /, "") === want);
};

/** Where along a path the segment [from, to] of it crosses a footprint grown by `grow`: `[sIn, sOut]` or null. */
function crossing(path, block, grow) {
  let first = null;
  let last = null;
  const steps = Math.max(2, Math.ceil(path.length / 0.05));
  for (let i = 0; i <= steps; i++) {
    const s = (path.length * i) / steps;
    if (insideBlock(block, path.at(s), grow)) {
      first ??= s;
      last = s;
    }
  }
  return first === null ? null : [first, last];
}

/** The time a speed profile reaches distance `s` (bisection: profiles only go forward). */
function timeAt(profile, s) {
  let lo = 0;
  let hi = profile.seconds;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (profile.at(mid) < s) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A path's cumulative lengths, and a point and a direction at any distance along it. */
export function pathOf(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  const length = cum.at(-1) ?? 0;
  const at = (s) => {
    const d = clamp(s, 0, length);
    let i = 1;
    while (i < points.length - 1 && cum[i] < d) i++;
    const a = points[i - 1] ?? points[0];
    const b = points[i] ?? a;
    const span = (cum[i] ?? 0) - (cum[i - 1] ?? 0);
    const k = span > 0 ? (d - (cum[i - 1] ?? 0)) / span : 0;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  // The way it goes, smoothed over corners.
  const direction = (s) => {
    const p = at(Math.max(0, s - 0.6));
    const q = at(Math.min(length, s + 0.6));
    if (Math.hypot(q.x - p.x, q.z - p.z) < 1e-6) return null;
    return facingOf(q.x - p.x, q.z - p.z);
  };
  return { points, length, at, direction };
}

/**
 * Speeding up from standing (`ramps[0]` seconds to full speed, 0 = already walking), then slowing down to stop
 * (`ramps[1]`, 0 = walking on): how far along at τ, and how fast, over `length`.
 */
export function speedProfile(length, top, [up, down]) {
  if (length <= 1e-6) return { seconds: 0, at: () => 0, speed: () => 0 };
  const inverse = (up > 0 ? up / top : 0) + (down > 0 ? down / top : 0);
  // Short ways never reach full speed.
  const peak = inverse > 0 ? Math.min(top, Math.sqrt((2 * length) / inverse)) : top;
  const tUp = up > 0 ? (peak * up) / top : 0;
  const tDown = down > 0 ? (peak * down) / top : 0;
  const sUp = (peak * tUp) / 2;
  const sDown = (peak * tDown) / 2;
  const cruise = (length - sUp - sDown) / peak;
  const seconds = tUp + cruise + tDown;
  const speed = (tau) => {
    if (tau <= 0) return up > 0 ? 0 : peak;
    if (tau < tUp) return (peak * tau) / tUp;
    if (tau < tUp + cruise) return peak;
    if (tau < seconds) return down > 0 ? (peak * (seconds - tau)) / tDown : peak;
    return down > 0 ? 0 : peak;
  };
  const at = (tau) => {
    if (tau <= 0) return 0;
    if (tau < tUp) return (peak * tau * tau) / (2 * tUp);
    if (tau < tUp + cruise) return sUp + peak * (tau - tUp);
    if (tau < seconds) {
      const left = seconds - tau;
      return length - (down > 0 ? (peak * left * left) / (2 * tDown) : peak * left);
    }
    return length;
  };
  return { seconds, at, speed };
}

// ---------- Off the picture ----------

const halfWidthAngle = (fovDeg, aspect) => Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);

/**
 * A point just outside the picture of this shot around `anchor`: to the left or right of the frame, or far behind.
 * The camera is worked out as the shot will place it (`cameraSide`, from `framed`: the people it films,
 * `[{ x, z, fx, fz }]`). Kept inside the place (`clamped` says when the walls were in the way).
 * @param {string} kind
 * @param {{ x: number, z: number }} anchor
 * @param {{ shot: any, index?: number, aspect: number, layout: any, size?: number,
 *   framed?: { x: number, z: number, fx: number, fz: number }[] }} options
 */
export function offPoint(kind, anchor, { shot, index = 0, aspect, layout, size = 1, framed = [] }) {
  const type = SHOT_TYPES[shot.shot] !== undefined ? shot.shot : "medium";
  const [px, , pz] = layout.wide.pos;
  const d = Math.hypot(px - anchor.x, pz - anchor.z) || 1;
  let dir = { x: (px - anchor.x) / d, z: (pz - anchor.z) / d };
  if (type !== "wide" && framed.length) {
    const turn = ANGLES[shot.angle] ?? (index % 2 ? 0.32 : -0.32);
    dir = cameraSide(framed, layout.wide.pos, turn);
  }
  let half;
  if (type === "wide") {
    half = d * Math.tan(halfWidthAngle(aspect < 1 ? 58 : 44, aspect)) + 2.2 * size;
  } else {
    const spec = SHOT_TYPES[type] ?? SHOT_TYPES.medium;
    const fov = spec.fov ?? 38;
    const frameH = (spec.height ?? 4.6) * size;
    const frameW = (spec.width ?? 4.6) * size;
    const away = Math.max(
      frameH / 2 / Math.tan((fov * Math.PI) / 360),
      frameW / 2 / Math.tan(halfWidthAngle(fov, aspect)),
    );
    half = away * Math.tan(halfWidthAngle(fov, aspect)) + 1.9 * size;
  }
  // The camera looks along -dir: the picture's left is cross(dir, up).
  const left = { x: -dir.z, z: dir.x };
  let point;
  if (kind === "off-left") point = { x: anchor.x + left.x * half, z: anchor.z + left.z * half };
  else if (kind === "off-right")
    point = { x: anchor.x - left.x * half, z: anchor.z - left.z * half };
  else point = { x: anchor.x - dir.x * 16 * size, z: anchor.z - dir.z * 16 * size };
  const b = layout.bounds;
  if (!b) return { point, clamped: false };
  const kept = {
    x: clamp(point.x, b.minX, b.maxX),
    z: clamp(point.z, b.minZ, b.maxZ),
  };
  const clamped = dist(kept, point) > 0.5 && dist(kept, anchor) < dist(point, anchor) * 0.7;
  return { point: kept, clamped };
}

// ---------- The plan ----------

const groundY = (layout, p, fallback = 0) =>
  layout.ground ? layout.ground(p.x, p.z) : (fallback ?? 0);

/** Where everyone stands in a shot when nothing says otherwise: one in the center, two face each other, an arc. */
function arrange(entry, layout, people, pinned, at) {
  const shot = entry.shot;
  const spots = layout.spots;
  const free = people.filter((id) => {
    if (at[id] || pinned.has(id)) return false;
    const pose = poseFor(entry, id);
    return !isSitting(pose) && !isLying(pose);
  });
  const center = spots.center;
  const arc = (j) => {
    const dx = (j - (free.length - 1) / 2) * 2.9;
    return {
      x: center.x + dx,
      z: center.z - Math.abs(dx) * 0.28,
      rot: center.rot - dx * 0.07,
      y: center.y,
    };
  };
  const taken = new Set([...pinned.values()].map((p) => p.spot).filter(Boolean));
  const seats = (layout.seats ?? []).filter((name) => !taken.has(name));
  const beds = (layout.beds ?? []).filter((name) => !taken.has(name));
  const placed = new Map();
  // Where people who walked somewhere stand: nobody is placed on top of them.
  const occupied = people.filter((id) => pinned.has(id) && !at[id]).map((id) => pinned.get(id));
  const crowded = (spot) =>
    [...occupied, ...placed.values()].some((p) => Math.hypot(p.x - spot.x, p.z - spot.z) < 2.2);
  for (const id of people) {
    if (pinned.has(id) && !at[id]) continue;
    const pose = poseFor(entry, id);
    let spotName = at[id];
    if (!spotName && isSitting(pose)) spotName = seats.shift();
    if (!spotName && isLying(pose)) spotName = beds.shift();
    let spot = spots[spotName];
    if (!spot) {
      const j = free.indexOf(id);
      spot = free.length >= 3 && j >= 0 ? arc(j) : (spots[STANDING[free.length]?.[j]] ?? center);
      spotName = undefined;
      if (occupied.length && crowded(spot)) {
        const open = ["left", "right", "center", "front", "back"]
          .map((name) => spots[name])
          .find((candidate) => candidate && !crowded(candidate));
        if (open) spot = open;
      }
    }
    const posture = isSitting(pose) ? "sit" : isLying(pose) ? "lie" : "stand";
    placed.set(id, {
      x: spot.x,
      z: spot.z,
      y: spot.y ?? 0,
      rot: spot.rot + (shot.turn?.[id] ?? 0),
      posture,
      seat: posture === "sit" ? (spot.seat ?? null) : null,
      bed: posture === "lie" ? (spot.bed ?? null) : null,
      spot: spotName ?? null,
    });
  }
  return placed;
}

/**
 * Plans every shot's moves. `entries`: the timeline (timing.js); `options`: `aspect` (the film's width / height),
 * `sizeOf(id)` (a character's size; 1 = adult), `placeOf(entry, i)` (the shot's place name), `isCharacter(id)`,
 * `layouts(name)` (a place's layout: layouts.js, or a test's own), `things` (story.js THINGS, as `thingSpots` gives
 * them: id -> { place, x, y, z }).
 * Returns `{ entries: [{ place, people: Map(id -> { base, moves }) }], moves, problems, holds, throws, punches }`:
 * `holds` `[{ id, thing, t0, t1 }]` (who holds what, from the grip to the throw), `throws` `[{ id, thing, t, target }]`,
 * `punches` `[{ id, target, t, hard, dir, side }]` (the contact moments).
 * @param {any[]} entries
 * @param {{ aspect?: number, sizeOf?: (id: string) => number, placeOf?: (entry: any, i: number) => string,
 *   isCharacter?: (id: string) => boolean, layouts?: (name: string) => any, things?: Record<string, any> }} [options]
 * @returns {{ entries: any[], moves: any[], problems: string[], holds: any[], throws: any[], punches: any[] }}
 */
export function planMotion(
  entries,
  { aspect = 16 / 9, sizeOf = () => 1, placeOf, isCharacter, layouts = layoutOf, things = {} } = {},
) {
  const problems = [];
  const moves = [];
  const out = [];
  const holds = [];
  const throws = [];
  const punches = [];
  let runPlace = null;
  /** People who moved, where they are now (until the place changes): id -> state. */
  let pinned = new Map();
  /** Every move in this place so far, by person. */
  let history = new Map();
  const place = (entry, i) => placeOf?.(entry, i) ?? entry.shot.place ?? "home";

  /** Where someone is at time t, from their moves (or `fallback`). */
  const stateAt = (id, t, fallback) => {
    const list = history.get(id) ?? [];
    const move = list.findLast((m) => m.t0 <= t);
    if (!move) return fallback;
    return t < move.t1 ? evaluate(move, t).state : move.end;
  };

  entries.forEach((entry, i) => {
    const shot = entry.shot;
    const where = place(entry, i);
    const layout = layouts(where);
    if (where !== runPlace) {
      runPlace = where;
      pinned = new Map();
      history = new Map();
      // Leaving a place lets go of what anyone held there.
      for (const hold of holds) if (hold.t1 === Number.POSITIVE_INFINITY) hold.t1 = entry.start;
    }
    const end = entry.start + entry.seconds;
    const people = [...new Set(shot.who ?? [])].filter((id) => !isCharacter || isCharacter(id));
    const n = i + 1;
    const spotNames = Object.keys(layout.spots);
    /** The things in this place (story.js THINGS), where they were put. */
    const thingsHere = Object.fromEntries(
      Object.entries(things).filter(([, thing]) => (thing.place ?? "home") === where),
    );
    const known = (name) =>
      Boolean(layout.spots[name]) || OFF_SPOTS.includes(name) || Boolean(thingsHere[name]);

    // Where the shot puts people: `at`, and where a walk starts (`go: { from: "door" }`).
    const at = { ...(shot.at ?? {}) };
    for (const [id, raw] of Object.entries(shot.go && typeof shot.go === "object" ? shot.go : {})) {
      const from = raw && typeof raw === "object" ? raw.from : undefined;
      if (typeof from === "string" && layout.spots[from] && !at[id]) at[id] = from;
    }
    // Placing someone in a spot starts them over there; someone who walked out of the picture before is placed
    // again.
    for (const id of people) {
      const gone = !pinned.has(id) && (history.get(id) ?? []).every((m) => m.t1 <= entry.start);
      if (at[id] || gone) {
        pinned.delete(id);
        history.delete(id);
      }
    }
    const placed = arrange(entry, layout, people, pinned, at);
    // Someone sitting or lying down stays there in the next shots, until a shot gets them up; someone the shot puts
    // in a spot (`at`) stays standing there (nobody jumps somewhere else between two shots of the same place).
    for (const [id, state] of placed) {
      if ((state.posture !== "stand" || at[id]) && state.spot) pinned.set(id, state);
    }
    const startOf = (id) => pinned.get(id) ?? placed.get(id);
    /** The others in the shot at time t, as the camera frames them: `[{ id, x, z, fx, fz }]`. */
    const companyAt = (id, t) =>
      people
        .filter((other) => other !== id)
        .map((other) => ({ other, state: stateAt(other, t, startOf(other)) }))
        .filter(({ state }) => state)
        .map(({ other, state }) => ({
          id: other,
          x: state.x,
          z: state.z,
          fx: Math.sin(state.rot),
          fz: Math.cos(state.rot),
        }));
    /** The people standing in the way of someone's walk at time t (walks go around them). */
    const othersAt = (id, t) =>
      people
        .filter((other) => other !== id)
        .map((other) => ({ other, state: stateAt(other, t, startOf(other)) }))
        .filter(({ state }) => state && state.posture === "stand")
        .map(({ other, state }) => {
          const width = 1.8 * sizeOf(other);
          return { name: cap(other), x: state.x, z: state.z, w: width, d: width };
        });
    // Where everyone is as the shot starts (before its own moves).
    const starts = new Map(people.map((id) => [id, stateAt(id, entry.start, startOf(id))]));
    const ctx = { shot, index: i, aspect, layout };

    const addMove = (id, move) => {
      moves.push(move);
      const list = history.get(id) ?? [];
      list.push(move);
      history.set(id, list);
      if (move.exits) pinned.delete(id);
      else pinned.set(id, move.end);
    };

    /**
     * Someone stands up in front of their seat (`stage`): whoever stands where they'll be steps back first, so
     * nobody stands up into anyone.
     */
    const makeRoom = (id, stage) => {
      const size = sizeOf(id);
      for (const other of people) {
        if (other === id) continue;
        const them = stateAt(other, stage.t0, startOf(other));
        if (them?.posture !== "stand") continue;
        const room = PERSONAL * ((size + sizeOf(other)) / 2) + 0.5;
        const d = dist(them, stage.to);
        if (d >= room) continue;
        const busy = (history.get(other) ?? []).some((m) => m.t1 > stage.t0 && m.t0 < stage.t1);
        if (busy) {
          problems.push(
            `Shot ${n}: ${cap(id)} stands up into ${cap(other)}, who is busy then: give them room.`,
          );
          continue;
        }
        const away =
          d > 1e-3
            ? { x: (them.x - stage.to.x) / d, z: (them.z - stage.to.z) / d }
            : forwardOf(them.rot);
        const back = stepBackMove(other, i, stage.t0, them, away, room - d, layout);
        if (back) addMove(other, back);
      }
    };

    // Turning toward someone (`look: { milo: "zee" }`).
    const looks = shot.look && typeof shot.look === "object" ? shot.look : {};

    // The moves of this shot, in the order the shot lists them.
    const asked = shot.go && typeof shot.go === "object" ? Object.entries(shot.go) : [];
    const going = new Set();
    for (const [id, raw] of asked) {
      const spec =
        typeof raw === "string" ? { to: raw } : raw && typeof raw === "object" ? raw : null;
      if (!spec) continue;
      if (!people.includes(id)) {
        problems.push(`Shot ${n}: "go" moves ${cap(id)}, who isn't in the shot's "who".`);
        continue;
      }
      const size = sizeOf(id);
      const pace = spec.pace ?? (GAITS[shot.pose?.[id]] ? shot.pose[id] : "walk");
      if (!GAITS[pace]) {
        problems.push(`Shot ${n}: "${pace}" isn't a pace. Paces: ${PACES.join(", ")}.`);
        continue;
      }
      const target = spec.to;
      const toPerson = typeof target === "string" && people.includes(target) && target !== id;
      if (typeof target !== "string") {
        problems.push(`Shot ${n}: ${cap(id)}'s "go" needs a "to".`);
        continue;
      }
      if (!known(target) && !toPerson) {
        problems.push(
          isCharacter?.(target)
            ? `Shot ${n}: ${cap(id)} walks up to ${cap(target)}, who isn't in the shot's "who".`
            : `Shot ${n}: ${cap(id)} can't go to "${target}": ${where} has ${spotNames.join(", ")}, off-left, off-right and off-back, or go up to someone in the shot.`,
        );
        continue;
      }
      if (spec.from && !known(spec.from)) {
        problems.push(
          `Shot ${n}: ${cap(id)} can't come from "${spec.from}": ${where} has ${spotNames.join(", ")}.`,
        );
        continue;
      }
      const badVia = (spec.via ?? []).find((name) => !layout.spots[name]);
      if (badVia) {
        problems.push(
          `Shot ${n}: ${cap(id)} can't go by "${badVia}": ${where} has ${spotNames.join(", ")}.`,
        );
        continue;
      }
      // When: on its word, or at the start; after a move that is still going.
      let t0 = spec.at ? effectTime(entry, spec.at) : entry.start;
      const previous = (history.get(id) ?? []).at(-1);
      if (previous && previous.t1 > t0) t0 = previous.t1;
      const before = stateAt(id, t0, startOf(id));
      const finalPose = shot.pose?.[id];
      const move = planMove({
        id,
        n,
        entry,
        t0,
        size,
        pace,
        spec,
        before,
        finalPose,
        toPerson: toPerson ? stateAt(target, t0, startOf(target)) : null,
        targetId: toPerson ? target : null,
        targetSize: toPerson ? sizeOf(target) : 1,
        toThing: !toPerson && thingsHere[target] ? thingsHere[target] : null,
        layout,
        others: othersAt(id, t0),
        company: companyAt(id, t0),
        ctx,
        problems,
        where,
      });
      if (!move) continue;
      addMove(id, move);
      going.add(id);
      if (move.stages[0]?.kind === "standUp") makeRoom(id, move.stages[0]);
      // The one walked up to turns to face them as they arrive.
      if (toPerson) {
        const them = stateAt(target, move.t1, startOf(target));
        const busy = (history.get(target) ?? []).some((m) => m.t1 > move.t1 - 0.5);
        if (them && them.posture === "stand" && !busy) {
          const toward = facingOf(move.end.x - them.x, move.end.z - them.z);
          const t1 = Math.max(entry.start, move.t1 - 0.45);
          const turn = turnMove(target, i, t1, them, toward, `toward ${cap(id)}`);
          if (turn) addMove(target, turn);
        }
      }
      if (move.t1 > end + 0.05) {
        // A walk may go on into the next shots of the same place that still show them, but no further.
        let last = end;
        let shots = 1;
        for (let k = i + 1; k < entries.length; k++) {
          const next = entries[k];
          if (place(next, k) !== where || !(next.shot.who ?? []).includes(id)) break;
          last = next.start + next.seconds;
          shots++;
        }
        if (move.t1 > last + 0.05) {
          const lasts =
            shots > 1
              ? `the shot and the next ${shots - 1 > 1 ? `${shots - 1} shots` : "shot"} here last ${(last - t0).toFixed(1)} s`
              : `the shot lasts ${(end - t0).toFixed(1)} s`;
          problems.push(
            `Shot ${n}: ${cap(id)}'s ${move.pace === "walk" ? "walk" : move.pace} ${move.toWords} takes ${(move.t1 - t0).toFixed(1)} s, but ${lasts}. Make the shot longer, use a faster pace, start nearer, or go on in the next shot.`,
          );
        }
      }
    }

    // Actions (`act`): punches, picking things up, throwing them, letting go. Each starts after the person's
    // walk, on its word (`at`: the contact, the grip, the release lands on it).
    const acts = shot.act && typeof shot.act === "object" ? Object.entries(shot.act) : [];
    for (const [id, raw] of acts) {
      if (!raw || typeof raw !== "object") {
        problems.push(`Shot ${n}: ${cap(id)}'s "act" should be like { punch: "zee" }.`);
        continue;
      }
      if (!people.includes(id)) {
        problems.push(`Shot ${n}: "act" moves ${cap(id)}, who isn't in the shot's "who".`);
        continue;
      }
      const size = sizeOf(id);
      const last = (history.get(id) ?? []).at(-1);
      const ready = last && last.t1 > entry.start ? last.t1 : entry.start;
      const me = stateAt(id, ready, startOf(id));
      if (!me) continue;
      if (me.posture !== "stand") {
        problems.push(
          `Shot ${n}: ${cap(id)} has to stand up to act: give them a standing pose first.`,
        );
        continue;
      }
      const moveOf = (stage, endState, words) => ({
        id,
        entry: i,
        kind: "act",
        t0: stage.t0,
        t1: stage.t1,
        pace: "walk",
        start: me,
        end: { ...me, ...endState, posture: "stand", seat: null, bed: null, spot: null },
        stages: [stage],
        view: endState.rot ?? me.rot,
        exits: false,
        enters: false,
        toWords: words,
      });
      const atWord = (word, lead) => {
        const t = word ? effectTime(entry, word) : ready + lead;
        return Math.max(ready + lead, t);
      };

      if (raw.punch !== undefined) {
        const other = raw.punch;
        if (!people.includes(other) || other === id) {
          problems.push(`Shot ${n}: ${cap(id)} punches "${other}", who isn't in the shot.`);
          continue;
        }
        const tc = atWord(raw.at, PUNCH.windUp + PUNCH.drive);
        const t0 = tc - PUNCH.windUp - PUNCH.drive;
        const them = stateAt(other, tc, startOf(other));
        if (them?.posture !== "stand") {
          problems.push(`Shot ${n}: ${cap(other)} has to stand to be punched.`);
          continue;
        }
        if ((history.get(other) ?? []).some((m) => m.t0 < tc + 0.2 && m.t1 > tc)) {
          problems.push(`Shot ${n}: ${cap(other)} is still moving when ${cap(id)}'s punch lands.`);
          continue;
        }
        const otherSize = sizeOf(other);
        const d = dist(me, them);
        // Where the fist meets the face: the arm's reach and a lean, and the front of their head.
        const contact = 1.75 * size + 0.6 * otherSize;
        if (d > contact + 1.4 * size) {
          problems.push(
            `Shot ${n}: ${cap(id)} is too far from ${cap(other)} to punch (${d.toFixed(1)} units): walk up first (go: { ${id}: "${other}" }).`,
          );
          continue;
        }
        const dir =
          d > 1e-3 ? { x: (them.x - me.x) / d, z: (them.z - me.z) / d } : forwardOf(me.rot);
        const stepIn = clamp(d - contact, -0.3 * size, 1.2 * size);
        const face = facingOf(dir.x, dir.z);
        const to = { x: me.x + dir.x * stepIn, z: me.z + dir.z * stepIn };
        const back = { x: me.x + dir.x * stepIn * 0.45, z: me.z + dir.z * stepIn * 0.45 };
        const side = raw.hand === "left" ? "L" : "R";
        const hard = Boolean(raw.hard);
        const t1 = tc + PUNCH.follow + PUNCH.recover;
        const stage = {
          kind: "punch",
          t0,
          t1,
          tc,
          from: { x: me.x, z: me.z },
          to,
          back,
          fromRot: me.rot,
          rot: face,
          target: other,
          side,
          hard,
        };
        addMove(id, moveOf(stage, { ...back, rot: face }, `at ${cap(other)}`));
        // The one hit: staggers back, or falls, lies a moment and gets up facing the puncher.
        const hitMove = (s, endState) => ({
          id: other,
          entry: i,
          kind: "act",
          t0: s.t0,
          t1: s.t1,
          pace: "walk",
          start: them,
          end: { ...them, ...endState, posture: "stand", seat: null, bed: null, spot: null },
          stages: [s],
          view: endState.rot,
          exits: false,
          enters: false,
          toWords: "back",
        });
        const grow = CLEARANCE * otherSize + 0.05;
        if (hard) {
          const lie = Number(raw.stay ?? HIT.lie);
          const fall = {
            x: them.x + dir.x * FALL_DISTANCE * otherSize,
            z: them.z + dir.z * FALL_DISTANCE * otherSize,
          };
          const up = freeSpot(layout, fall, grow) ?? fall;
          const rot = facingOf(-dir.x, -dir.z);
          addMove(
            other,
            hitMove(
              {
                kind: "knocked",
                t0: tc,
                t1: tc + HIT.fall + lie + HIT.getUp,
                from: { x: them.x, z: them.z },
                to: up,
                fromRot: them.rot,
                rot,
                dir,
                fall: HIT.fall,
                lie,
                getUp: HIT.getUp,
                by: id,
              },
              { ...up, rot },
            ),
          );
        } else {
          const push = {
            x: them.x + dir.x * STAGGER_DISTANCE * otherSize,
            z: them.z + dir.z * STAGGER_DISTANCE * otherSize,
          };
          const to2 = roomAt(layout, push, grow * 0.8) ? push : { x: them.x, z: them.z };
          addMove(
            other,
            hitMove(
              {
                kind: "hit",
                t0: tc,
                t1: tc + HIT.stagger,
                from: { x: them.x, z: them.z },
                to: to2,
                rot: them.rot,
                dir,
                by: id,
              },
              { ...to2, rot: them.rot },
            ),
          );
        }
        punches.push({ id, target: other, t: tc, hard, dir, side });
      } else if (raw.pickUp !== undefined) {
        const thingId = raw.pickUp;
        const thing = thingsHere[thingId];
        if (!thing) {
          const names = Object.keys(thingsHere).join(", ") || "none";
          problems.push(
            `Shot ${n}: there's no "${thingId}" in ${where} to pick up (THINGS here: ${names}).`,
          );
          continue;
        }
        if (holds.some((h) => h.id === id && h.t1 > ready)) {
          problems.push(
            `Shot ${n}: ${cap(id)} already holds something: throw it or drop it first.`,
          );
          continue;
        }
        if (holds.some((h) => h.thing === thingId && h.t1 > ready)) {
          problems.push(`Shot ${n}: someone else holds the ${thingId}.`);
          continue;
        }
        const d = dist(me, thing);
        if (d > 2.7 * size) {
          problems.push(
            `Shot ${n}: ${cap(id)} is too far from the ${thingId} to pick it up: walk to it first (go: { ${id}: "${thingId}" }).`,
          );
          continue;
        }
        const tg = atWord(raw.at, PICK.reach);
        const t0 = tg - PICK.reach;
        const face = facingOf(thing.x - me.x, thing.z - me.z);
        const stage = {
          kind: "pickUp",
          t0,
          t1: tg + PICK.lift,
          tg,
          thing: thingId,
          at: thing,
          fromRot: me.rot,
          rot: face,
        };
        addMove(id, moveOf(stage, { rot: face }, `up the ${thingId}`));
        holds.push({ id, thing: thingId, t0: tg, t1: Number.POSITIVE_INFINITY });
      } else if (raw.throw !== undefined) {
        const target = raw.throw;
        const hold = holds.find((h) => h.id === id && h.t1 > ready);
        if (!hold) {
          problems.push(
            `Shot ${n}: ${cap(id)} throws, but holds nothing: pick something up first.`,
          );
          continue;
        }
        if (!people.includes(target) || target === id) {
          problems.push(`Shot ${n}: ${cap(id)} throws at "${target}", who isn't in the shot.`);
          continue;
        }
        const tr = atWord(raw.at, THROW.windUp);
        const t0 = tr - THROW.windUp;
        const them = stateAt(target, tr, startOf(target));
        if (!them) continue;
        const face = facingOf(them.x - me.x, them.z - me.z);
        const stage = {
          kind: "throw",
          t0,
          t1: tr + THROW.follow,
          tr,
          target,
          thing: hold.thing,
          fromRot: me.rot,
          rot: face,
        };
        addMove(id, moveOf(stage, { rot: face }, `at ${cap(target)}`));
        hold.t1 = tr;
        throws.push({ id, thing: hold.thing, t: tr, target });
      } else if (raw.drop) {
        const hold = holds.find((h) => h.id === id && h.t1 > ready);
        if (hold) hold.t1 = atWord(raw.at, 0);
      } else {
        problems.push(
          `Shot ${n}: ${cap(id)}'s "act" says nothing to do: punch, pickUp, throw or drop.`,
        );
      }
    }

    // Someone sitting who now has a standing pose stands up; someone standing who now sits walks to a seat.
    for (const id of people) {
      if (going.has(id) || at[id] || !pinned.has(id)) continue;
      // After a move that is still going (someone still sitting down stands up once seated).
      const last = (history.get(id) ?? []).at(-1);
      const ready = last && last.t1 > entry.start ? last.t1 : entry.start;
      const now = stateAt(id, ready, startOf(id));
      if (!now) continue;
      const pose = shot.pose?.[id];
      const size = sizeOf(id);
      if (now.posture === "sit" && pose && !isSitting(pose) && !isLying(pose)) {
        const up = standUpMove(id, ready, now, size);
        addMove(id, up);
        makeRoom(id, up.stages[0]);
      } else if (now.posture === "lie" && pose && !isSitting(pose) && !isLying(pose)) {
        addMove(id, getUpMove(id, ready, now, size));
      } else if (now.posture === "stand" && isSitting(pose)) {
        const taken = new Set([...pinned.values()].map((p) => p.spot));
        const seat = (layout.seats ?? [])
          .filter((name) => !taken.has(name))
          .map((name) => ({ name, spot: layout.spots[name] }))
          .sort((a, b) => dist(now, a.spot) - dist(now, b.spot))[0];
        if (seat && dist(now, seat.spot) < WALK_TO_SEAT) {
          const move = planMove({
            id,
            n,
            entry,
            t0: ready,
            size,
            pace: "walk",
            spec: { to: seat.name },
            before: now,
            finalPose: pose,
            layout,
            others: othersAt(id, ready),
            ctx,
            problems,
            where,
          });
          if (move) addMove(id, move);
        }
      }
    }

    // Turning toward someone.
    for (const [id, other] of Object.entries(looks)) {
      if (!people.includes(id) || going.has(id)) continue;
      if (!people.includes(other) || other === id) {
        problems.push(`Shot ${n}: ${cap(id)} looks at "${other}", who isn't in the shot.`);
        continue;
      }
      // After a walk that is still going.
      const last = (history.get(id) ?? []).at(-1);
      const ready = last && last.t1 > entry.start ? last.t1 : entry.start;
      const me = stateAt(id, ready, startOf(id));
      const them = stateAt(other, ready, startOf(other));
      if (!me || !them || me.posture !== "stand") continue;
      const toward = facingOf(them.x - me.x, them.z - me.z);
      const turn = turnMove(id, i, ready, me, toward, `toward ${cap(other)}`, 0.12);
      if (turn) addMove(id, turn);
    }

    // Everyone's state in this shot: where they start, and their moves in this place so far.
    const peopleOut = new Map();
    for (const id of people) {
      const base = starts.get(id);
      if (base) peopleOut.set(id, { base, moves: [...(history.get(id) ?? [])] });
    }
    out.push({ place: where, people: peopleOut });
  });

  // Nobody stands inside anyone: two standing people closer than their bodies allow, anywhere in a shot.
  const plan = { entries: out };
  out.forEach((slot, i) => {
    const entry = entries[i];
    const ids = [...slot.people.keys()];
    const reported = new Set();
    for (let t = entry.start; t < entry.start + entry.seconds; t += 0.1) {
      const states = ids.map((id) => [id, personState(plan, i, id, t)]);
      for (let a = 0; a < states.length; a++) {
        for (let b = a + 1; b < states.length; b++) {
          const [ida, sa] = states[a];
          const [idb, sb] = states[b];
          const standing = (s) =>
            s && !s.hidden && s.posture === "stand" && s.act?.kind !== "knocked";
          if (!standing(sa) || !standing(sb)) continue;
          const pair = `${ida}|${idb}`;
          if (reported.has(pair)) continue;
          if (dist(sa, sb) < PERSONAL * ((sizeOf(ida) + sizeOf(idb)) / 2)) {
            reported.add(pair);
            problems.push(
              `Shot ${i + 1}: ${cap(ida)} and ${cap(idb)} stand inside each other at ${t.toFixed(1)} s: move one of them (at, go).`,
            );
          }
        }
      }
    }
  });

  return { entries: out, moves, problems, holds, throws, punches };
}

/** Stepping back a little (`distance` along `away`), still facing the same way: making room for someone. */
function stepBackMove(id, entryIndex, t0, me, away, distance, layout) {
  const to = { x: me.x + away.x * distance, z: me.z + away.z * distance };
  if (!roomAt(layout, to, CLEARANCE * 0.8)) return null;
  const path = pathOf([{ x: me.x, z: me.z }, to]);
  const profile = speedProfile(path.length, speedOf("walk") * 0.6, [0.2, 0.25]);
  return {
    id,
    entry: entryIndex,
    kind: "go",
    t0,
    t1: t0 + profile.seconds,
    pace: "walk",
    start: me,
    end: { ...me, ...to },
    stages: [
      {
        kind: "travel",
        t0,
        t1: t0 + profile.seconds,
        path,
        profile,
        pace: "walk",
        size: 1,
        from: me.rot,
        to: me.rot,
        backward: true,
      },
    ],
    view: me.rot,
    exits: false,
    enters: false,
    toWords: "back",
  };
}

/** Turning on the spot to face `toward`, from `t0` (null when it's a tiny turn). */
function turnMove(id, entryIndex, t0, me, toward, words, least = 0.3) {
  const turn = wrapAngle(toward - me.rot);
  if (Math.abs(turn) < least) return null;
  const seconds = turnSeconds(turn) + 0.1;
  const to = me.rot + turn;
  return {
    id,
    entry: entryIndex,
    kind: "look",
    t0,
    t1: t0 + seconds,
    pace: "walk",
    start: me,
    end: { ...me, rot: to },
    stages: [{ kind: "turn", t0, t1: t0 + seconds, from: me.rot, to }],
    view: to,
    exits: false,
    enters: false,
    toWords: words,
  };
}

/** Getting up from a bed: a quick flop off it, to stand beside it. */
function getUpMove(id, t0, lying, size) {
  const rot = lying.rot - Math.PI / 2;
  const fwd = forwardOf(lying.rot + Math.PI / 2);
  const side = { x: lying.x + fwd.x * 3.2 * size, z: lying.z + fwd.z * 3.2 * size };
  return {
    id,
    kind: "stand",
    t0,
    t1: t0 + FLOP_SECONDS,
    pace: "walk",
    start: lying,
    end: { ...lying, ...side, rot, posture: "stand", bed: null, spot: null },
    stages: [
      {
        kind: "unflop",
        t0,
        t1: t0 + FLOP_SECONDS,
        from: { x: lying.x, z: lying.z },
        to: side,
        rot,
        bed: lying.bed,
      },
    ],
    view: rot,
    exits: false,
    enters: false,
    toWords: "up",
  };
}

/** A stand-up on the spot: from the seat to standing in front of it. */
function standUpMove(id, t0, seated, size) {
  const rot = seated.rot;
  const fwd = forwardOf(rot);
  const front = {
    x: seated.x + fwd.x * SEAT_REACH * size,
    z: seated.z + fwd.z * SEAT_REACH * size,
  };
  const end = { ...seated, ...front, posture: "stand", seat: null, spot: null };
  return {
    id,
    kind: "stand",
    t0,
    t1: t0 + STAND_SECONDS,
    pace: "walk",
    start: seated,
    end,
    stages: [
      {
        kind: "standUp",
        t0,
        t1: t0 + STAND_SECONDS,
        from: { x: seated.x, z: seated.z },
        to: front,
        rot,
        seat: seated.seat ?? null,
      },
    ],
    view: rot,
    exits: false,
    enters: false,
    toWords: "up",
  };
}

/** One walk: the stages from where someone is to where they go. */
function planMove({
  id,
  n,
  entry,
  t0,
  size,
  pace,
  spec,
  before,
  finalPose,
  toPerson,
  targetId,
  targetSize = 1,
  toThing = null,
  layout,
  others = [],
  company = [],
  ctx,
  problems,
  where,
}) {
  if (!before) return null;
  /** Who or what the walk goes up to (a walk to a spot has none). */
  let anchor = null;
  const stages = [];
  let t = t0;
  let here = { x: before.x, z: before.z };
  let rot = before.rot;
  let start = before;

  // The people the camera frames when this one is at `point`, facing `facing` (to find the picture's edges).
  const people = [entry.shot.focus, ...(entry.shot.who ?? [])].filter(Boolean);
  const focus = people.find((p) => p === id || company.some((c) => c.id === p)) ?? id;
  const close = entry.shot.shot === "close" || entry.shot.shot === "xclose";
  const framedWith = (point, facing) => {
    const me = { id, x: point.x, z: point.z, fx: Math.sin(facing), fz: Math.cos(facing) };
    const all = [me, ...company];
    return close ? all.filter((p) => p.id === focus) : all;
  };

  // Coming in from outside the picture: they start there, already walking.
  const enters = OFF_SPOTS.includes(spec.from);
  const exits = OFF_SPOTS.includes(spec.to);
  let target = null;
  let endRot = null;
  let sitAt = null;
  let lieAt = null;
  const spots = layout.spots;

  // Where they go, and how they face when they get there.
  if (toPerson) {
    // Measured from where they stand: someone sitting stands up in front of their seat.
    const seated = toPerson.posture === "sit";
    const ahead = forwardOf(toPerson.rot);
    anchor = seated
      ? {
          x: toPerson.x + ahead.x * SEAT_REACH * targetSize,
          z: toPerson.z + ahead.z * SEAT_REACH * targetSize,
        }
      : { x: toPerson.x, z: toPerson.z };
    const away = { x: here.x - anchor.x, z: here.z - anchor.z };
    const d = Math.hypot(away.x, away.z);
    let dir = d > 1e-3 ? { x: away.x / d, z: away.z / d } : ahead;
    // Come round to their front or side, not up to their back.
    if (dir.x * ahead.x + dir.z * ahead.z < 0.2) {
      const sides = [toPerson.rot + 0.8, toPerson.rot - 0.8].map(forwardOf);
      const closer = (v) => v.x * away.x + v.z * away.z;
      dir = closer(sides[0]) >= closer(sides[1]) ? sides[0] : sides[1];
    }
    const meet = MEET * ((size + targetSize) / 2);
    target = { x: anchor.x + dir.x * meet, z: anchor.z + dir.z * meet };
    endRot = facingOf(anchor.x - target.x, anchor.z - target.z);
  } else if (toThing) {
    // Up to a thing, within a hand's reach of it, facing it.
    anchor = { x: toThing.x, z: toThing.z };
    const away = { x: here.x - anchor.x, z: here.z - anchor.z };
    const d = Math.hypot(away.x, away.z);
    const dir = d > 1e-3 ? { x: away.x / d, z: away.z / d } : forwardOf(before.rot + Math.PI);
    target = { x: anchor.x + dir.x * REACH * size, z: anchor.z + dir.z * REACH * size };
    endRot = facingOf(anchor.x - target.x, anchor.z - target.z);
  } else if (!exits) {
    const spot = spots[spec.to];
    const sits = isSitting(finalPose) || (finalPose === undefined && spot.seat !== undefined);
    const lies = isLying(finalPose);
    if (sits && spot.seat === undefined) {
      const seats = (layout.seats ?? []).join(", ") || "none";
      problems.push(
        `Shot ${n}: ${cap(id)} sits at "${spec.to}", which isn't a seat (seats in ${where}: ${seats}).`,
      );
    }
    if (lies && spot.bed === undefined) {
      const beds = (layout.beds ?? []).join(", ") || "none";
      problems.push(
        `Shot ${n}: ${cap(id)} lies down at "${spec.to}", which isn't a bed (beds in ${where}: ${beds}).`,
      );
    }
    endRot = spot.rot;
    if (sits && spot.seat !== undefined) {
      // In front of the seat, back to it.
      const fwd = forwardOf(spot.rot);
      target = { x: spot.x + fwd.x * SEAT_REACH * size, z: spot.z + fwd.z * SEAT_REACH * size };
      sitAt = { name: spec.to, spot };
    } else if (lies && spot.bed !== undefined) {
      const side = forwardOf(spot.rot + Math.PI / 2);
      target = { x: spot.x + side.x * 3.2 * size, z: spot.z + side.z * 3.2 * size };
      endRot = spot.rot - Math.PI / 2;
      lieAt = { name: spec.to, spot };
    } else {
      target = { x: spot.x, z: spot.z };
    }
  }

  if (enters) {
    const anchor = target ?? here;
    const off = offPoint(spec.from, anchor, {
      ...ctx,
      size,
      framed: framedWith(anchor, endRot ?? rot),
    });
    if (off.clamped) {
      problems.push(
        `Shot ${n}: ${cap(id)} can't come in from ${spec.from.slice(4)} of the picture here (${where}'s walls are in the way): come in by a door or another spot.`,
      );
    }
    here = off.point;
    start = { ...before, x: here.x, z: here.z, posture: "stand", seat: null, spot: null };
    rot = facingOf(anchor.x - here.x, anchor.z - here.z);
  } else if (before.posture === "sit") {
    // Stand up first.
    const up = standUpMove(id, t, before, size);
    const stage = up.stages[0];
    stages.push(stage);
    t = stage.t1;
    here = stage.to;
  } else if (before.posture === "lie") {
    // Lying people get up with a quick flop off the bed.
    const fwd = forwardOf(before.rot + Math.PI / 2);
    const side = { x: before.x + fwd.x * 3.2 * size, z: before.z + fwd.z * 3.2 * size };
    stages.push({
      kind: "unflop",
      t0: t,
      t1: t + FLOP_SECONDS,
      from: { x: before.x, z: before.z },
      to: side,
      rot: before.rot - Math.PI / 2,
      bed: before.bed,
    });
    t += FLOP_SECONDS;
    here = side;
    rot = before.rot - Math.PI / 2;
  }

  if (exits) {
    const off = offPoint(spec.to, here, { ...ctx, size, framed: framedWith(here, before.rot) });
    if (off.clamped) {
      problems.push(
        `Shot ${n}: ${cap(id)} can't walk out of the picture to the ${spec.to.slice(4)} here (${where}'s walls are in the way): go to a door instead.`,
      );
    }
    target = off.point;
  }

  // Never stop inside furniture: an end point there moves to the nearest place with room to stand (walking up to
  // someone or something, another side of them first).
  if (target && !exits && !sitAt && !lieAt) {
    const grow = CLEARANCE * size + 0.05;
    const free = anchor
      ? freeSpot(layout, target, grow, { around: anchor, distance: dist(anchor, target) })
      : freeSpot(layout, target, grow);
    if (!free) {
      problems.push(
        `Shot ${n}: there's no room for ${cap(id)} ${wordsFor(spec, targetId)}: the furniture is in the way.`,
      );
    } else if (dist(free, target) > 1e-3) {
      target = free;
      if (anchor) endRot = facingOf(anchor.x - target.x, anchor.z - target.z);
    }
  }

  // Jumping over a piece of furniture (`over`): the walk goes straight across it, in the air.
  let jumpOver = null;
  if (spec.over !== undefined) {
    jumpOver = blockNamed(layout, spec.over);
    const names = (layout.blocks ?? []).map((b) => b.name.replace(/^the /, "")).join(", ");
    if (!jumpOver) {
      problems.push(`Shot ${n}: there's no "${spec.over}" in ${where} to jump over (${names}).`);
    } else if ((jumpOver.h ?? 2.5) > 2.2 * size) {
      problems.push(`Shot ${n}: ${jumpOver.name} is too high for ${cap(id)} to jump over.`);
      jumpOver = null;
    } else if (pace !== "run" && pace !== "sprint") {
      problems.push(
        `Shot ${n}: jumping over ${jumpOver.name} needs a run-up: pace "run" or "sprint".`,
      );
      jumpOver = null;
    }
  }

  // The way: through `via`, around furniture and the people standing there.
  const walkway = {
    ...layout,
    blocks: [...(layout.blocks ?? []).filter((block) => block !== jumpOver), ...others],
  };
  const stops = [
    here,
    ...(spec.via ?? []).map((name) => ({ x: spots[name].x, z: spots[name].z })),
    target,
  ];
  const points = [here];
  for (let k = 1; k < stops.length; k++) {
    const found = findPath(walkway, stops[k - 1], stops[k], CLEARANCE * size);
    if (found.blocked) {
      problems.push(
        `Shot ${n}: ${cap(id)} can't get ${spec.via ? "through" : "to"} ${wordsFor(spec, targetId)}: ${found.blocked} is in the way.`,
      );
    }
    points.push(...found.points.slice(1));
  }
  const path = pathOf(points);
  const startDir = path.direction(0) ?? rot;

  // Turn toward the way first, when it's a big turn.
  if (!enters && path.length > 0.05) {
    const turn = wrapAngle(startDir - rot);
    if (Math.abs(turn) > TURN_MIN) {
      const seconds = turnSeconds(turn);
      stages.push({ kind: "turn", t0: t, t1: t + seconds, from: rot, to: rot + turn });
      t += seconds;
      rot += turn;
    }
  }

  // The walk.
  const [up, down] = RAMPS[pace] ?? RAMPS.walk;
  const profile = speedProfile(path.length, speedOf(pace) * size, [
    enters ? 0 : up,
    exits ? 0 : down,
  ]);
  if (path.length > 0.05) {
    // The jump: off the ground a little before the furniture, back on it a little after.
    let jump = null;
    if (jumpOver) {
      const across = crossing(path, jumpOver, 0.25 * size);
      if (!across) {
        problems.push(
          `Shot ${n}: ${cap(id)}'s way ${wordsFor(spec, targetId)} doesn't go over ${jumpOver.name}: no jump needed.`,
        );
      } else {
        const margin = 0.5 * size;
        const s0 = Math.max(0.2, across[0] - margin);
        const s1 = Math.min(path.length - 0.2, across[1] + margin);
        const a = timeAt(profile, s0);
        const b = timeAt(profile, s1);
        const air = b - a;
        // Over the top with the knees tucked (they lift the feet about 0.9 units).
        const peak = (GRAVITY * air * air) / 8;
        if (peak + 0.9 * size < (jumpOver.h ?? 2.5) + 0.15) {
          problems.push(
            `Shot ${n}: ${cap(id)} is too fast to clear ${jumpOver.name}: run from farther away, or use "run" instead of "sprint".`,
          );
        }
        jump = { t0: t + a, t1: t + b, s0, s1, peak, over: jumpOver.name };
      }
    }
    stages.push({
      kind: "travel",
      t0: t,
      t1: t + profile.seconds,
      path,
      profile,
      pace,
      size,
      from: rot,
      jump,
    });
    t += profile.seconds;
    rot = path.direction(path.length) ?? rot;
  }

  // Turn to face where they arrived.
  let finalRot = rot;
  if (!exits && endRot !== null) {
    const turn = wrapAngle(endRot - rot);
    if (Math.abs(turn) > TURN_MIN) {
      const seconds = turnSeconds(turn);
      stages.push({ kind: "turn", t0: t, t1: t + seconds, from: rot, to: rot + turn });
      t += seconds;
    } else if (stages.at(-1)?.kind === "travel") {
      stages.at(-1).to = rot + turn;
    }
    finalRot = rot + turn;
  }

  // Sit down, or lie down.
  const last = points.at(-1);
  let end = {
    ...before,
    x: last.x,
    z: last.z,
    y: groundY(layout, last, before.y),
    rot: finalRot,
    posture: "stand",
    seat: null,
    bed: null,
    spot: null,
  };
  if (sitAt) {
    stages.push({
      kind: "sitDown",
      t0: t,
      t1: t + SIT_SECONDS,
      from: last,
      to: { x: sitAt.spot.x, z: sitAt.spot.z },
      rot: sitAt.spot.rot,
      seat: sitAt.spot.seat,
    });
    t += SIT_SECONDS;
    end = {
      ...end,
      x: sitAt.spot.x,
      z: sitAt.spot.z,
      y: sitAt.spot.y ?? 0,
      rot: sitAt.spot.rot,
      posture: "sit",
      seat: sitAt.spot.seat,
      spot: sitAt.name,
    };
  } else if (lieAt) {
    stages.push({
      kind: "flop",
      t0: t,
      t1: t + FLOP_SECONDS,
      from: last,
      to: { x: lieAt.spot.x, z: lieAt.spot.z },
      rot: lieAt.spot.rot,
      bed: lieAt.spot.bed,
    });
    t += FLOP_SECONDS;
    end = {
      ...end,
      x: lieAt.spot.x,
      z: lieAt.spot.z,
      rot: lieAt.spot.rot,
      posture: "lie",
      bed: lieAt.spot.bed,
      spot: lieAt.name,
    };
  }

  return {
    id,
    entry: entry.index,
    kind: "go",
    t0,
    t1: t,
    pace,
    start,
    end,
    stages,
    path,
    enters,
    exits,
    target: targetId ?? null,
    // The camera frames a walker as they will stand (or, leaving, as they stood).
    view: exits ? before.rot : finalRot,
    toWords: wordsFor(spec, targetId),
  };
}

const wordsFor = (spec, targetId) =>
  targetId
    ? `to ${cap(targetId)}`
    : OFF_SPOTS.includes(spec.to)
      ? `out of the picture`
      : `to the ${spec.to}`;

/**
 * A move at time t: `{ state, act }`. `state`: `{ x, y, z, rot, posture, seat, bed }`; `act`: what the body does
 * (`{ kind: "gait", pace, phase, weight }`, `{ kind: "turn", k, steps }`, `{ kind: "sitDown" | "standUp" | "flop" |
 * "unflop", k, seat, bed }`), or null when standing still.
 */
export function evaluate(move, t) {
  const stage = move.stages.find((s) => t < s.t1) ?? move.stages.at(-1);
  const startState = move.start;
  if (!stage) return { state: move.end, act: null };
  const k = stage.t1 > stage.t0 ? clamp((t - stage.t0) / (stage.t1 - stage.t0)) : 1;
  const base = { ...startState, posture: "stand", seat: null, bed: null, spot: null };
  if (t < stage.t0) {
    // Between stages (never long): where the stage starts.
    return {
      state: { ...base, ...(stage.from && typeof stage.from === "object" ? stage.from : {}) },
      act: null,
    };
  }
  switch (stage.kind) {
    case "standUp": {
      const back = standBack(k);
      const x = stage.to.x + (stage.from.x - stage.to.x) * back;
      const z = stage.to.z + (stage.from.z - stage.to.z) * back;
      return {
        state: { ...base, x, z, rot: stage.rot },
        act: { kind: "standUp", k, seat: stage.seat },
      };
    }
    case "sitDown": {
      const back = seatBack(k);
      const x = stage.from.x + (stage.to.x - stage.from.x) * back;
      const z = stage.from.z + (stage.to.z - stage.from.z) * back;
      return {
        state: { ...base, x, z, rot: stage.rot },
        act: { kind: "sitDown", k, seat: stage.seat },
      };
    }
    case "flop":
    case "unflop": {
      const e = easeInOut(k);
      const x = stage.from.x + (stage.to.x - stage.from.x) * e;
      const z = stage.from.z + (stage.to.z - stage.from.z) * e;
      return {
        state: { ...base, x, z, rot: stage.rot },
        act: { kind: stage.kind, k, bed: stage.bed },
      };
    }
    case "turn": {
      const here = positionBefore(move, stage);
      return {
        state: { ...base, ...here, rot: stage.from + (stage.to - stage.from) * easeInOut(k) },
        act: { kind: "turn", k, steps: 0.5 + Math.abs(stage.to - stage.from) / Math.PI },
      };
    }
    case "travel": {
      const tau = t - stage.t0;
      const s = stage.profile.at(tau);
      const p = stage.path.at(s);
      const way = stage.path.direction(s) ?? stage.from;
      // Small turns happen while walking: into the way at the start, toward the end facing at the end. Stepping
      // back keeps facing the same way.
      let rot = way;
      const settle = 0.35;
      if (stage.backward) rot = stage.from;
      else {
        if (tau < settle) rot = lerpAngle(stage.from, way, smoothstep(tau / settle));
        const left = stage.t1 - t;
        if (stage.to !== undefined && left < settle)
          rot = lerpAngle(rot, stage.to, smoothstep(1 - left / settle));
      }
      const top = speedOf(stage.pace) * stage.size;
      const speed = stage.profile.speed(tau);
      const weight = smoothstep(speed / (0.5 * top));
      const cycle = (GAITS[stage.pace] ?? GAITS.walk).cycle * stage.size;
      // Speeding up and slowing down (units/s²): the body leans into it.
      const accel = (stage.profile.speed(tau + 0.04) - stage.profile.speed(tau - 0.04)) / 0.08;
      // A jump: a real arc under gravity between take-off and landing.
      let lift = 0;
      let jump = null;
      if (stage.jump) {
        const j = stage.jump;
        const air = j.t1 - j.t0;
        if (t >= j.t0 && t <= j.t1) {
          const u = t - j.t0;
          lift = (GRAVITY / 2) * u * (air - u);
        }
        jump = { before: j.t0 - t, after: t - j.t1, air, k: clamp((t - j.t0) / air) };
      }
      return {
        state: { ...base, x: p.x, z: p.z, rot, lift },
        act: {
          kind: "gait",
          pace: stage.pace,
          phase: (stage.backward ? -s : s) / cycle,
          weight,
          accel: accel / Math.max(top, 1e-3),
          jump,
        },
      };
    }
    case "punch": {
      const windUp = stage.tc - PUNCH.drive;
      const after = stage.tc + PUNCH.follow;
      const turn = smoothstep((t - stage.t0) / PUNCH.windUp);
      let x = stage.from.x;
      let z = stage.from.z;
      let phase = "windUp";
      let k = clamp((t - stage.t0) / PUNCH.windUp);
      if (t >= windUp && t < stage.tc) {
        phase = "drive";
        k = clamp((t - windUp) / PUNCH.drive);
        const e = k * k;
        x = stage.from.x + (stage.to.x - stage.from.x) * e;
        z = stage.from.z + (stage.to.z - stage.from.z) * e;
      } else if (t >= stage.tc && t < after) {
        phase = "follow";
        k = clamp((t - stage.tc) / PUNCH.follow);
        x = stage.to.x;
        z = stage.to.z;
      } else if (t >= after) {
        phase = "recover";
        k = clamp((t - after) / PUNCH.recover);
        const e = easeInOut(k);
        x = stage.to.x + (stage.back.x - stage.to.x) * e;
        z = stage.to.z + (stage.back.z - stage.to.z) * e;
      }
      return {
        state: { ...base, x, z, rot: lerpAngle(stage.fromRot, stage.rot, turn) },
        act: {
          kind: "punch",
          phase,
          k,
          since: t - stage.tc,
          target: stage.target,
          side: stage.side,
        },
      };
    }
    case "hit": {
      // Shoved back fast, then steadying.
      const e = 1 - (1 - k) ** 3;
      return {
        state: {
          ...base,
          x: stage.from.x + (stage.to.x - stage.from.x) * e,
          z: stage.from.z + (stage.to.z - stage.from.z) * e,
          rot: stage.rot,
        },
        act: { kind: "hit", k, since: t - stage.t0, dir: stage.dir },
      };
    }
    case "knocked": {
      const u = t - stage.t0;
      const down = stage.fall + stage.lie;
      if (u < down) {
        const e = smoothstep(u / stage.fall);
        return {
          state: {
            ...base,
            x: stage.from.x + (stage.to.x - stage.from.x) * e,
            z: stage.from.z + (stage.to.z - stage.from.z) * e,
            rot: stage.fromRot,
          },
          act: {
            kind: "knocked",
            phase: u < stage.fall ? "fall" : "lie",
            k: clamp(u / stage.fall),
            since: u,
            stage,
          },
        };
      }
      return {
        state: { ...base, x: stage.to.x, z: stage.to.z, rot: stage.rot },
        act: {
          kind: "knocked",
          phase: "getUp",
          k: clamp((u - down) / stage.getUp),
          since: u,
          stage,
        },
      };
    }
    case "pickUp": {
      const reaching = t < stage.tg;
      const kk = reaching
        ? clamp((t - stage.t0) / (stage.tg - stage.t0))
        : clamp((t - stage.tg) / (stage.t1 - stage.tg));
      return {
        state: {
          ...base,
          rot: lerpAngle(stage.fromRot, stage.rot, smoothstep((t - stage.t0) / 0.25)),
        },
        act: {
          kind: "pickUp",
          phase: reaching ? "reach" : "lift",
          k: kk,
          thing: stage.thing,
          at: stage.at,
        },
      };
    }
    case "throw": {
      const winding = t < stage.tr;
      const kk = winding
        ? clamp((t - stage.t0) / (stage.tr - stage.t0))
        : clamp((t - stage.tr) / (stage.t1 - stage.tr));
      return {
        state: {
          ...base,
          rot: lerpAngle(stage.fromRot, stage.rot, smoothstep((t - stage.t0) / 0.3)),
        },
        act: { kind: "throw", phase: winding ? "windUp" : "follow", k: kk, target: stage.target },
      };
    }
    default:
      return { state: move.end, act: null };
  }
}

/** Where someone is before a stage (the end of the stage before it). */
function positionBefore(move, stage) {
  const i = move.stages.indexOf(stage);
  for (let j = i - 1; j >= 0; j--) {
    const s = move.stages[j];
    if (s.kind === "travel") return s.path.at(s.path.length);
    if (s.to && typeof s.to === "object") return { x: s.to.x, z: s.to.z };
  }
  return { x: move.start.x, z: move.start.z };
}

/**
 * Someone at time t in a shot of the plan: `{ x, y, z, rot, posture, seat, bed, act, move, arrivedAt }` (`move`:
 * the move going on, `arrivedAt`: when the last one ended), or null when they aren't in the shot.
 * @param {{ entries: any[] }} plan
 * @param {number} entryIndex
 * @param {string} id
 * @param {number} t
 * @param {any} [layout]
 * @returns {any}
 */
export function personState(plan, entryIndex, id, t, layout) {
  const slot = plan.entries[entryIndex]?.people.get(id);
  if (!slot) return null;
  const move = slot.moves.findLast((m) => m.t0 <= t);
  let state = slot.base;
  let act = null;
  let going = null;
  let arrivedAt = null;
  if (move) {
    if (t < move.t1) {
      const now = evaluate(move, t);
      state = now.state;
      act = now.act;
      going = move;
    } else {
      state = move.end;
      arrivedAt = move.t1;
    }
  }
  const y =
    (layout?.ground && state.posture === "stand"
      ? layout.ground(state.x, state.z)
      : (state.y ?? 0)) + (state.lift ?? 0);
  // Someone about to come in from outside the picture isn't there yet.
  const next = slot.moves.find((m) => m.t0 > t);
  const hidden = !going && Boolean(next?.enters) && (!move || move.t1 <= t);
  return { ...state, y, act, move: going, arrivedAt, lastMove: move ?? null, hidden };
}

/** How far a seated figure's body goes down on a seat of this height (the sitting `bodyY`). */
export const seatDrop = (seat, size = 1) =>
  seat === null || seat === undefined ? -0.84 : (seat - 1.5 * size) / size;

/**
 * The pose of someone in `state` (from `personState`) at time t: the shot's `pose` while standing still (with the
 * seat or bed under them), and while they move: the gait (from standing still, by speed), small steps while
 * turning, sitting down, standing up, flopping onto a bed. Right after arriving, the shot's pose blends in.
 * `idle()` gives their standing pose; `poseTime` and `phase` are their pose clock and rhythm.
 */
export function composePose(state, pose, { idle, size = 1, t, poseTime = 0, phase = 0 }) {
  const act = state.act;
  let out = pose;
  if (act?.kind === "gait") {
    out = blendPoses(idle(), gaitWithWeight(act.pace, act.phase, act.accel ?? 0), act.weight);
    out = jumpPose(out, act.jump);
  } else if (act?.kind === "punch") {
    const punch = punchPose(act, idle());
    out = { ...punch.pose, aim: { side: act.side, person: act.target, weight: punch.aim } };
  } else if (act?.kind === "hit") {
    out = hitPose(act, idle());
  } else if (act?.kind === "knocked") {
    out = act.phase === "getUp" ? getUpPose(act.k) : fallPose(act.k);
  } else if (act?.kind === "pickUp") {
    const low = clamp(1 - (act.at?.y ?? 0) / (2 * size));
    const pick = pickUpPose(act, idle(), low);
    out = { ...pick.pose, aim: { side: "R", point: act.at, thing: act.thing, weight: pick.aim } };
  } else if (act?.kind === "throw") {
    out = throwPose(act, idle());
  } else if (act?.kind === "turn") {
    const steps = gaitPose("walk", act.k * act.steps, { scale: 0.35 });
    out = blendPoses(idle(), steps, Math.sin(Math.PI * act.k));
  } else if (act?.kind === "sitDown") {
    out = sitDownPose(act.k, seatDrop(act.seat, size));
  } else if (act?.kind === "standUp") {
    out = standUpPose(act.k, seatDrop(act.seat, size));
  } else if (act?.kind === "flop" || act?.kind === "unflop") {
    const k = act.kind === "flop" ? act.k : 1 - act.k;
    const lying = poseAt("lie", poseTime, phase);
    lying.bodyY = (lying.bodyY ?? 0) + (act.bed ?? 0) / size + 0.5;
    out = blendPoses(idle(), lying, smoothstep(k));
  } else if (
    state.arrivedAt !== null &&
    state.arrivedAt !== undefined &&
    state.posture === "stand"
  ) {
    const u = t - state.arrivedAt;
    const k = u / 0.35;
    if (k < 1) out = blendPoses(idle(), pose, smoothstep(k));
    // After a walk, the body settles with a little sway (follow-through).
    if (state.lastMove?.kind === "go" && u < 1.5) out = addPose(out, arrivalSway(u));
  }
  if (!act && state.posture === "sit" && state.seat !== null && state.seat !== undefined) {
    out = { ...out, bodyY: (out.bodyY ?? 0) + seatDrop(state.seat, size) };
  }
  if (!act && state.posture === "lie" && state.bed !== null && state.bed !== undefined) {
    out = { ...out, bodyY: (out.bodyY ?? 0) + state.bed / size + 0.5 };
  }
  return out;
}

/** How much lower the head is than standing (for the camera), in units of a size-1 figure. */
export function headDrop(state, size = 1) {
  const act = state.act;
  if (act?.kind === "sitDown") return sitDownPose(act.k, seatDrop(act.seat, size)).bodyY;
  if (act?.kind === "standUp") return standUpPose(act.k, seatDrop(act.seat, size)).bodyY;
  if (!act && state.posture === "sit") return seatDrop(state.seat, size);
  return 0;
}
