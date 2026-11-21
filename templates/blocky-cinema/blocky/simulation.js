// The physics of a film, worked out once and read for any frame. Each run of shots in one place is its own world:
// the floor, the walls, the furniture (layouts.js), the story's things (story.js THINGS), one capsule per character
// moved by the walk plan (it pushes what it meets), hands that grip, carry and throw, and bodies that fall when a
// hard punch lands. The world steps a fixed number of times a second, from the start: every step of every body is
// kept, and a frame reads the two steps around its time and blends them. Nothing depends on which frames were drawn
// before, so every render worker gets the same physics.
import * as THREE from "three";
import { JOINTS } from "./characters.js";
import { layoutOf, solidsOf } from "./layouts.js";
import { personState } from "./motion.js";
import { GROUPS } from "./physics.js";
import { RIG, rigFrames } from "./rig.js";
import { BODIES, UNITS_PER_METER } from "./sizes.js";

/** Steps a second (the film's frames read between them). */
export const SIM_HZ = 120;
const U = UNITS_PER_METER;
const meters = (u) => u / U;
const cap = (id) => id.charAt(0).toUpperCase() + id.slice(1);

/** A toy figure's density (kg/m³): hollow plastic, about 35 kg for an adult-sized figure. */
const FIGURE_DENSITY = 70;
/** How fast a hard punch sends the chest and the head (m/s, along the punch, a little up). */
const PUNCH_PUSH = { chest: 2.0, head: 3.8 };

/**
 * The bodies of the story's things: `[{ key, thing, prop, place, x, y, z, turn }]` (units; a stack of 3 boxes is
 * boxes#0, boxes#1, boxes#2 from the bottom).
 */
export function thingBodies(things) {
  const out = [];
  for (const [id, spec] of Object.entries(things ?? {})) {
    const shape = BODIES[spec?.prop];
    if (!shape) continue;
    const h = (shape.box ? shape.box[1] : shape.ball * 2) * U;
    const n = Math.max(1, Math.floor(spec.stack ?? 1));
    for (let k = 0; k < n; k++) {
      out.push({
        key: n > 1 ? `${id}#${k}` : id,
        thing: id,
        prop: spec.prop,
        place: spec.place ?? "home",
        x: spec.at?.x ?? 0,
        z: spec.at?.z ?? 0,
        y: (spec.at?.y ?? 0) + h / 2 + k * h,
        turn: (spec.turn ?? 0) + k * 0.12,
      });
    }
  }
  return out;
}

/** Where each thing starts, for the planner (walking up to it, picking it up): id -> { place, x, y, z } (a stack's top). */
export function thingSpots(things) {
  const spots = {};
  for (const body of thingBodies(things))
    spots[body.thing] = { place: body.place, x: body.x, y: body.y, z: body.z };
  return spots;
}

/**
 * The parts of a falling figure: the rig frame each hangs from, its box (size-1 units), where its middle is, and its
 * joint to its parent: a hinge around the joint's own x axis, held within the figure's range for that joint
 * (characters.js JOINTS), so a fall never bends a toy joint further than the toy can.
 */
const range = (joint) => JOINTS[joint].ranges[0];
const LIMBS = [
  { name: "pelvis", frame: "pelvis", box: [1.8, 0.6, 0.9], center: [0, 0, 0] },
  {
    name: "chest",
    frame: "torso",
    box: [1.9, 1.9, 0.95],
    center: [0, 1, 0],
    parent: "pelvis",
    anchor: [0, 0, 0],
    hinge: range("waist"),
  },
  {
    name: "head",
    frame: "neck",
    box: [1.25, 1.2, 1.25],
    center: [0, 0.72, 0],
    parent: "chest",
    anchor: [0, RIG.neckY, 0],
    hinge: range("neck"),
  },
  {
    name: "armL",
    frame: "shoulderL",
    box: [0.85, 0.8, 0.9],
    center: [0, -0.22, 0],
    parent: "chest",
    anchor: [RIG.shoulderX, RIG.shoulderY, 0],
    hinge: range("shoulderL"),
  },
  {
    name: "armR",
    frame: "shoulderR",
    box: [0.85, 0.8, 0.9],
    center: [0, -0.22, 0],
    parent: "chest",
    anchor: [-RIG.shoulderX, RIG.shoulderY, 0],
    hinge: range("shoulderR"),
  },
  // Elbows bend the other way round from their angle in poses (the rig turns them by minus the angle).
  {
    name: "foreL",
    frame: "elbowL",
    box: [0.82, 1.05, 0.88],
    center: [0, -0.52, 0],
    parent: "armL",
    anchor: [0, -RIG.upperArm, 0],
    hinge: [-range("elbowL")[1], -range("elbowL")[0]],
  },
  {
    name: "foreR",
    frame: "elbowR",
    box: [0.82, 1.05, 0.88],
    center: [0, -0.52, 0],
    parent: "armR",
    anchor: [0, -RIG.upperArm, 0],
    hinge: [-range("elbowR")[1], -range("elbowR")[0]],
  },
  {
    name: "thighL",
    frame: "hipL",
    box: [0.88, 0.78, 0.92],
    center: [0, -0.44, 0],
    parent: "pelvis",
    anchor: [RIG.hipX, 0, 0],
    hinge: range("hipL"),
  },
  {
    name: "thighR",
    frame: "hipR",
    box: [0.88, 0.78, 0.92],
    center: [0, -0.44, 0],
    parent: "pelvis",
    anchor: [-RIG.hipX, 0, 0],
    hinge: range("hipR"),
  },
  {
    name: "shinL",
    frame: "kneeL",
    box: [0.88, 1.08, 0.98],
    center: [0, -0.55, 0.02],
    parent: "thighL",
    anchor: [0, -RIG.thigh, 0],
    hinge: range("kneeL"),
  },
  {
    name: "shinR",
    frame: "kneeR",
    box: [0.88, 1.08, 0.98],
    center: [0, -0.55, 0.02],
    parent: "thighR",
    anchor: [0, -RIG.thigh, 0],
    hinge: range("kneeR"),
  },
];
export const LIMB_NAMES = LIMBS.map((limb) => limb.name);

/** A body's steps: `{ t0, hz, n, data }`, `data` holding n × [x, y, z, qx, qy, qz, qw] in the film's units. */
function newTrack(t0, hz, n) {
  return { t0, hz, n: 0, data: new Float32Array(n * 7) };
}
function record(track, [x, y, z, qx, qy, qz, qw]) {
  const o = track.n * 7;
  track.data[o] = x * U;
  track.data[o + 1] = y * U;
  track.data[o + 2] = z * U;
  track.data[o + 3] = qx;
  track.data[o + 4] = qy;
  track.data[o + 5] = qz;
  track.data[o + 6] = qw;
  track.n++;
}

/**
 * A body at time t (units): `{ position, quaternion }` blended between the two steps around t (before its first
 * step: the first; after its last: the last).
 */
export function sampleTrack(track, t) {
  const f = Math.min(Math.max((t - track.t0) * track.hz, 0), Math.max(track.n - 1, 0));
  const i = Math.floor(f);
  const j = Math.min(i + 1, track.n - 1);
  const k = f - i;
  const d = track.data;
  const a = i * 7;
  const b = j * 7;
  const position = new THREE.Vector3(
    d[a] + (d[b] - d[a]) * k,
    d[a + 1] + (d[b + 1] - d[a + 1]) * k,
    d[a + 2] + (d[b + 2] - d[a + 2]) * k,
  );
  const qa = new THREE.Quaternion(d[a + 3], d[a + 4], d[a + 5], d[a + 6]);
  const qb = new THREE.Quaternion(d[b + 3], d[b + 4], d[b + 5], d[b + 6]);
  return { position, quaternion: qa.slerp(qb, k) };
}

const toMeters = (v) => ({ x: meters(v.x), y: meters(v.y), z: meters(v.z) });
const yaw = (rot) => ({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) });

/**
 * Simulates the film. `createWorld` comes from `loadPhysics()`. `timeline`: the shots (timing.js); `placeOf(i)`: a
 * shot's place; `motion`: the plan (motion.js, with its holds, throws and punches); `things`: story.js THINGS;
 * `sizeOf(id)`; `isCharacter(id)`; `figureAt(i, id, t)`: someone's `{ root, pose }` at time t in shot i (the engine's,
 * so hands carry what is drawn in them).
 * Returns `{ hz, tracks: Map(key -> track), things: [bodies], limbs: Map(id -> [{ t0, t1, size, parts: Map }]),
 * grips: Map(key -> point), hits: [{ id, thing, t }], problems, stats }`.
 */
export function simulate(
  createWorld,
  { timeline, placeOf, motion, things, sizeOf, isCharacter, figureAt, hz = SIM_HZ },
) {
  const started = performance.now();
  const tracks = new Map();
  const limbs = new Map();
  const grips = new Map();
  const hits = [];
  const problems = [];
  const allThings = thingBodies(things);
  let steps = 0;
  let deepest = 0;

  // Runs of shots in one place.
  const runs = [];
  timeline.forEach((entry, i) => {
    const place = placeOf(i);
    const last = runs.at(-1);
    if (last && last.place === place) {
      last.i1 = i;
      last.t1 = entry.start + entry.seconds;
    } else runs.push({ place, i0: i, i1: i, t0: entry.start, t1: entry.start + entry.seconds });
  });

  for (const run of runs) {
    const layout = layoutOf(run.place);
    const world = createWorld({ hz });
    const n = Math.max(2, Math.ceil((run.t1 - run.t0) * hz) + 1);

    // The floor, the walls and the furniture.
    world.fixedBox({ x: 0, y: -0.5, z: 0, w: 400, h: 1, d: 400 });
    if (layout.walls) {
      const w = layout.walls;
      const cx = meters((w.minX + w.maxX) / 2);
      const cz = meters((w.minZ + w.maxZ) / 2);
      const sx = meters(w.maxX - w.minX);
      const sz = meters(w.maxZ - w.minZ);
      for (const [x, z, a, b] of [
        [meters(w.minX) - 0.5, cz, 1, sz + 2],
        [meters(w.maxX) + 0.5, cz, 1, sz + 2],
        [cx, meters(w.minZ) - 0.5, sx + 2, 1],
        [cx, meters(w.maxZ) + 0.5, sx + 2, 1],
      ]) {
        world.fixedBox({ x, y: 2, z, w: a, h: 4, d: b });
      }
    }
    for (const s of solidsOf(layout)) {
      world.fixedBox({
        x: meters(s.x),
        y: meters(s.y),
        z: meters(s.z),
        w: meters(s.w),
        h: meters(s.h),
        d: meters(s.d),
        rotY: s.rot ?? 0,
      });
    }

    // The story's things in this place.
    const bodies = new Map();
    const owner = new Map();
    for (const thing of allThings.filter((b) => b.place === run.place)) {
      const shape = BODIES[thing.prop];
      const size = shape.box ?? [shape.ball * 2, shape.ball * 2, shape.ball * 2];
      const volume = shape.box ? size[0] * size[1] * size[2] : (4 / 3) * Math.PI * shape.ball ** 3;
      const handle = world.body({
        shape: shape.box ? { box: shape.box } : { ball: shape.ball },
        at: toMeters(thing),
        q: yaw(thing.turn),
        density: shape.mass / volume,
        friction: shape.friction,
        restitution: shape.restitution,
        ccd: true,
        group: GROUPS.OBJECT,
        listen: true,
      });
      bodies.set(thing.key, handle);
      owner.set(handle, { kind: "thing", key: thing.key, thing: thing.thing });
      tracks.set(thing.key, newTrack(run.t0, hz, n));
    }

    // One capsule per character: where the walk plan has them, pushing what they meet.
    const people = [
      ...new Set(
        timeline
          .slice(run.i0, run.i1 + 1)
          .flatMap((entry) => entry.shot.who ?? [])
          .filter((id) => !isCharacter || isCharacter(id)),
      ),
    ];
    const capsules = new Map();
    for (const id of people) {
      const size = sizeOf(id);
      const r = meters(0.95 * size);
      const half = Math.max(0.05, (meters(5.0 * size) - 2 * r) / 2);
      const handle = world.body({
        shape: { capsule: [half, r] },
        at: { x: 0, y: -50, z: 0 },
        kind: "kinematic",
        group: GROUPS.PERSON,
        listen: true,
      });
      capsules.set(id, { handle, size, lift: r + half, last: null, bumped: new Set(), away: true });
      owner.set(handle, { kind: "person", id });
    }

    const entryAt = (t) => {
      let i = run.i0;
      while (i < run.i1 && timeline[i + 1].start <= t) i++;
      return i;
    };
    /** Where someone is at time t (their last known place when the shot leaves them out). */
    const stateOf = (id, t) => {
      const i = entryAt(t);
      const state = personState(motion, i, id, t, layout);
      const slot = capsules.get(id);
      if (state) slot.last = state;
      return { i, state: state ?? slot.last };
    };

    const holdsHere = (motion.holds ?? []).filter((h) =>
      allThings.some((b) => b.thing === h.thing && b.place === run.place),
    );
    const throwsHere = (motion.throws ?? []).filter((x) => x.t >= run.t0 && x.t < run.t1);
    const punchesHere = (motion.punches ?? []).filter(
      (p) => p.hard && p.t >= run.t0 && p.t < run.t1,
    );
    /** The body of a held thing (the top of a stack). */
    const bodyOf = (thingId) => {
      const keys = allThings.filter((b) => b.thing === thingId).map((b) => b.key);
      return keys.at(-1);
    };
    const flying = new Map();
    const fallen = [];
    const landed = new Set();

    for (let step = 0; step < n; step++) {
      const t = run.t0 + step / hz;
      const next = t + 1 / hz;

      // Keep what happened so far.
      for (const [key, handle] of bodies) record(tracks.get(key), world.read(handle));
      for (const fall of fallen) {
        if (t <= fall.t1 + 1e-9) {
          for (const [name, handle] of fall.handles)
            record(fall.parts.get(name), world.read(handle));
        }
      }
      if (step === n - 1) break;

      // Characters: their capsules go where the plan puts them next step (away while sitting, lying or falling).
      for (const [id, slot] of capsules) {
        const { state } = stateOf(id, next);
        const away =
          !state || state.hidden || state.posture !== "stand" || state.act?.kind === "knocked";
        const at = away
          ? { x: 0, y: -50, z: 0 }
          : { x: meters(state.x), y: meters(state.y ?? 0) + slot.lift, z: meters(state.z) };
        // Leaving or coming back jumps there at once: sweeping across the room would shove everything on the way.
        if (away !== slot.away) world.place(slot.handle, at);
        else world.moveTo(slot.handle, at);
        slot.away = away;
        if (!away && !state.act?.jump && world.touchesStatic(slot.handle)) {
          const entry = entryAt(t);
          if (!slot.bumped.has(entry)) {
            slot.bumped.add(entry);
            problems.push(
              `Shot ${entry + 1}: ${cap(id)} walks into the furniture at ${t.toFixed(1)} s: go around it (via) or to another spot.`,
            );
          }
        }
      }

      // Hands: a thing is gripped (it follows the hand), carried, and let go with the hand's speed toward someone.
      for (const hold of holdsHere) {
        const key = bodyOf(hold.thing);
        const handle = bodies.get(key);
        if (handle === undefined) continue;
        if (t < hold.t0 || t >= hold.t1) continue;
        const { i } = stateOf(hold.id, next);
        const figure = figureAt(i, hold.id, next);
        if (!figure) continue;
        const hand = new THREE.Vector3().setFromMatrixPosition(
          rigFrames(figure.pose, figure.root).hand,
        );
        if (!grips.has(key)) {
          grips.set(key, {
            t,
            ...Object.fromEntries(["x", "y", "z"].map((a, k) => [a, world.read(handle)[k] * U])),
          });
          world.setKind(handle, "kinematic");
        }
        world.moveTo(handle, toMeters(hand), yaw(figure.root.rot ?? 0));
      }
      for (const toss of throwsHere) {
        if (flying.has(toss) || next < toss.t) continue;
        const key = bodyOf(toss.thing);
        const handle = bodies.get(key);
        if (handle === undefined) continue;
        flying.set(toss, true);
        world.setKind(handle, "dynamic");
        const [x, y, z] = world.read(handle);
        const target = stateOf(toss.target, toss.t + 0.4).state;
        if (!target) continue;
        const aim = {
          x: meters(target.x),
          y: meters((target.y ?? 0) + 3.4 * sizeOf(toss.target)),
          z: meters(target.z),
        };
        const span = Math.hypot(aim.x - x, aim.z - z);
        const flight = Math.min(0.55, Math.max(0.22, span / 7.5));
        world.place(
          handle,
          { x, y, z },
          undefined,
          {
            x: (aim.x - x) / flight,
            y: (aim.y - y) / flight + (world.gravity * flight) / 2,
            z: (aim.z - z) / flight,
          },
          { x: 4, y: 1.5, z: -2 },
        );
      }

      // A hard punch lands: the one hit becomes a falling body, shoved along the punch.
      for (const punch of punchesHere) {
        if (landed.has(punch) || next < punch.t) continue;
        landed.add(punch);
        const { i } = stateOf(punch.target, punch.t);
        // The body as it stood just before the contact, and how fast each part was going then.
        const now = figureAt(i, punch.target, punch.t - 1 / hz);
        const before = figureAt(i, punch.target, punch.t - 2 / hz);
        if (!now || !before) continue;
        const size = sizeOf(punch.target);
        const framesNow = rigFrames(now.pose, now.root);
        const framesBefore = rigFrames(before.pose, before.root);
        const handles = new Map();
        const parts = new Map();
        const knocked = (motion.moves ?? []).find(
          (m) =>
            m.id === punch.target &&
            m.stages[0]?.kind === "knocked" &&
            Math.abs(m.t0 - punch.t) < 1e-6,
        );
        const t1 = knocked
          ? knocked.t0 + knocked.stages[0].fall + knocked.stages[0].lie
          : punch.t + 1.7;
        for (const limb of LIMBS) {
          const p = new THREE.Vector3();
          const q = new THREE.Quaternion();
          const s = new THREE.Vector3();
          framesNow[limb.frame].decompose(p, q, s);
          const was = new THREE.Vector3().setFromMatrixPosition(framesBefore[limb.frame]);
          const v = p.clone().sub(was).multiplyScalar(hz);
          const handle = world.body({
            shape: { box: limb.box.map((b) => meters(b * size)) },
            at: toMeters(p),
            q: { x: q.x, y: q.y, z: q.z, w: q.w },
            offset: {
              x: meters(limb.center[0] * size),
              y: meters(limb.center[1] * size),
              z: meters(limb.center[2] * size),
            },
            density: FIGURE_DENSITY,
            friction: 0.8,
            restitution: 0.05,
            group: GROUPS.LIMB,
            damping: [0.08, 2.2],
          });
          world.place(handle, toMeters(p), undefined, toMeters(v));
          handles.set(limb.name, handle);
          parts.set(limb.name, newTrack(t, hz, Math.ceil((t1 - t) * hz) + 3));
          if (limb.parent) {
            const anchorA = {
              x: meters(limb.anchor[0] * size),
              y: meters(limb.anchor[1] * size),
              z: meters(limb.anchor[2] * size),
            };
            const anchorB = { x: 0, y: 0, z: 0 };
            world.hinge(handles.get(limb.parent), handle, anchorA, anchorB, limb.hinge, 0.6);
          }
        }
        const push = (part, speed) => {
          const handle = handles.get(part);
          const j = world.mass(handle) * speed;
          world.impulse(handle, { x: punch.dir.x * j, y: 0.25 * j, z: punch.dir.z * j });
        };
        push("chest", PUNCH_PUSH.chest);
        push("head", PUNCH_PUSH.head);
        const fall = { id: punch.target, t0: t, t1, size, parts, handles };
        fallen.push(fall);
        const list = limbs.get(punch.target) ?? [];
        list.push(fall);
        limbs.set(punch.target, list);
      }

      world.step((a, b) => {
        const first = owner.get(a);
        const second = owner.get(b);
        const thing = first?.kind === "thing" ? first : second?.kind === "thing" ? second : null;
        const person = first?.kind === "person" ? first : second?.kind === "person" ? second : null;
        if (!thing || !person) return;
        // Something thrown hits someone (their flinch is drawn from this moment).
        const toss = throwsHere.find(
          (x) => flying.has(x) && bodyOf(x.thing) === thing.key && x.id !== person.id,
        );
        if (toss && !hits.some((h) => h.thing === thing.key && h.id === person.id)) {
          hits.push({ id: person.id, thing: thing.key, t: next });
        }
      });
      steps++;

      // A fallen body comes to rest: its limbs stay where they lie, out of the world.
      for (const fall of fallen) {
        if (!fall.done && next > fall.t1) {
          fall.done = true;
          for (const handle of fall.handles.values()) world.remove(handle);
        }
      }
    }

    // Checks: things sinking into the furniture or the floor, things still moving at the end.
    for (const [key, handle] of bodies) {
      deepest = Math.max(deepest, world.depthInStatic(handle));
      const v = world.velocity(handle);
      if (Math.hypot(v.x, v.y, v.z) > 0.35) {
        problems.push(`The ${key.split("#")[0]} still moves when the scene in ${run.place} ends.`);
      }
    }
    for (const toss of throwsHere) {
      if (!hits.some((h) => h.thing === bodyOf(toss.thing) && h.id === toss.target)) {
        const entry = entryAt(toss.t);
        problems.push(
          `Shot ${entry + 1}: the ${toss.thing} ${cap(toss.id)} throws misses ${cap(toss.target)}: stand them closer, or nothing in between.`,
        );
      }
    }
    if (deepest > 0.06) {
      problems.push(
        `Something sinks ${Math.round(deepest * 100)} cm into the furniture or the floor.`,
      );
    }
    world.free();
  }

  return {
    hz,
    tracks,
    things: allThings,
    limbs,
    grips,
    hits,
    problems,
    stats: { ms: performance.now() - started, steps, deepest },
  };
}
