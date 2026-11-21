// Moving characters: where everyone is in each shot, and walks from spot to spot. A shot's `go` sends someone
// somewhere: they stand up if they sit, turn toward the way with small steps, speed up, walk (or run, sneak,
// tiptoe) around the furniture, slow down, turn to face where they arrived, and sit down when it's a seat. `look`
// turns someone toward someone else. People who moved stay where they went for the next shots in the same place.
// Everything is planned once (`planMotion`) and read at any time (`personState`): pure functions of t.
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
const RAMPS = { walk: [0.35, 0.4], run: [0.3, 0.35], sneak: [0.4, 0.4], tiptoe: [0.3, 0.3] };
/** How far a walker keeps from furniture (units, for a size-1 figure). */
export const CLEARANCE = 1.15;
/** How far from someone a walk up to them stops. */
export const MEET = 2.7;
/** Within this, a standing person told to sit walks to the seat; farther, the shot cuts to them sitting. */
const WALK_TO_SEAT = 9;

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
 * `layouts(name)` (a place's layout: layouts.js, or a test's own).
 * Returns `{ entries: [{ place, people: Map(id -> { base, moves }) }], moves, problems }`.
 * @param {any[]} entries
 * @param {{ aspect?: number, sizeOf?: (id: string) => number, placeOf?: (entry: any, i: number) => string,
 *   isCharacter?: (id: string) => boolean, layouts?: (name: string) => any }} [options]
 * @returns {{ entries: any[], moves: any[], problems: string[] }}
 */
export function planMotion(
  entries,
  { aspect = 16 / 9, sizeOf = () => 1, placeOf, isCharacter, layouts = layoutOf } = {},
) {
  const problems = [];
  const moves = [];
  const out = [];
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
    }
    const end = entry.start + entry.seconds;
    const people = [...new Set(shot.who ?? [])].filter((id) => !isCharacter || isCharacter(id));
    const n = i + 1;
    const spotNames = Object.keys(layout.spots);
    const known = (name) => Boolean(layout.spots[name]) || OFF_SPOTS.includes(name);

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
    // Someone sitting or lying down stays there in the next shots, until a shot gets them up.
    for (const [id, state] of placed) {
      if (state.posture !== "stand" && state.spot) pinned.set(id, state);
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
        const next = entries[i + 1];
        const goesOn = next && place(next, i + 1) === where && (next.shot.who ?? []).includes(id);
        if (!goesOn) {
          problems.push(
            `Shot ${n}: ${cap(id)}'s ${move.pace === "walk" ? "walk" : move.pace} ${move.toWords} takes ${(move.t1 - t0).toFixed(1)} s, but the shot lasts ${(end - t0).toFixed(1)} s. Make the shot longer, use a faster pace, or go on in the next shot.`,
          );
        }
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
        addMove(id, standUpMove(id, ready, now, size));
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

  return { entries: out, moves, problems };
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
  layout,
  others = [],
  company = [],
  ctx,
  problems,
  where,
}) {
  if (!before) return null;
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
    const away = { x: here.x - toPerson.x, z: here.z - toPerson.z };
    const d = Math.hypot(away.x, away.z);
    let dir = d > 1e-3 ? { x: away.x / d, z: away.z / d } : forwardOf(toPerson.rot);
    // Come round to their front or side, not up to their back.
    const front = forwardOf(toPerson.rot);
    if (dir.x * front.x + dir.z * front.z < 0.2) {
      const sides = [toPerson.rot + 0.8, toPerson.rot - 0.8].map(forwardOf);
      const closer = (v) => v.x * away.x + v.z * away.z;
      dir = closer(sides[0]) >= closer(sides[1]) ? sides[0] : sides[1];
    }
    target = { x: toPerson.x + dir.x * MEET * size, z: toPerson.z + dir.z * MEET * size };
    endRot = facingOf(toPerson.x - target.x, toPerson.z - target.z);
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

  // The way: through `via`, around furniture and the people standing there.
  const walkway = { ...layout, blocks: [...(layout.blocks ?? []), ...others] };
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
    stages.push({
      kind: "travel",
      t0: t,
      t1: t + profile.seconds,
      path,
      profile,
      pace,
      size,
      from: rot,
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
      // Small turns happen while walking: into the way at the start, toward the end facing at the end.
      let rot = way;
      const settle = 0.35;
      if (tau < settle) rot = lerpAngle(stage.from, way, smoothstep(tau / settle));
      const left = stage.t1 - t;
      if (stage.to !== undefined && left < settle)
        rot = lerpAngle(rot, stage.to, smoothstep(1 - left / settle));
      const top = speedOf(stage.pace) * stage.size;
      const weight = smoothstep(stage.profile.speed(tau) / (0.5 * top));
      const cycle = (GAITS[stage.pace] ?? GAITS.walk).cycle * stage.size;
      return {
        state: { ...base, x: p.x, z: p.z, rot },
        act: { kind: "gait", pace: stage.pace, phase: s / cycle, weight },
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
    layout?.ground && state.posture === "stand" ? layout.ground(state.x, state.z) : (state.y ?? 0);
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
    out = blendPoses(idle(), gaitPose(act.pace, act.phase), act.weight);
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
    const k = (t - state.arrivedAt) / 0.35;
    if (k < 1) out = blendPoses(idle(), pose, smoothstep(k));
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
