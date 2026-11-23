// @ts-expect-error: three ships without type declarations in this project.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKY_CAST } from "../../templates/blocky-cinema/blocky/cast.js";
import { figureAt } from "../../templates/blocky-cinema/blocky/figure.js";
import { LAYOUTS, layoutOf, solidsOf } from "../../templates/blocky-cinema/blocky/layouts.js";
import {
  freeSpot,
  GRAVITY,
  insideBlock,
  personState,
  planMotion,
  roomAt,
} from "../../templates/blocky-cinema/blocky/motion.js";
import { loadPhysics } from "../../templates/blocky-cinema/blocky/physics.js";
import { gaitPose, legFK } from "../../templates/blocky-cinema/blocky/poses.js";
import { aimArm, framePoint, rigFrames } from "../../templates/blocky-cinema/blocky/rig.js";
import {
  sampleTrack,
  simulate,
  thingSpots,
} from "../../templates/blocky-cinema/blocky/simulation.js";
import { UNITS_PER_METER } from "../../templates/blocky-cinema/blocky/sizes.js";
import { planStory } from "../../templates/blocky-cinema/blocky/timing.js";
import { hash } from "../../templates/blocky-cinema/blocky/util.js";
import * as story from "../../templates/blocky-cinema/story.js";

type Shot = Record<string, unknown>;
type Track = { data: Float32Array; n: number };
type Sim = {
  tracks: Map<string, Track>;
  limbs: Map<string, { t0: number; t1: number; parts: Map<string, Track> }[]>;
  hits: { id: string; t: number; thing: string }[];
  grips: Map<string, unknown>;
  problems: string[];
  stats: { ms: number; steps: number; deepest: number };
};

const cast = BLOCKY_CAST as Record<string, { size?: number }>;
const sizeOf = (id: string) => cast[id]?.size ?? 1;
const isCharacter = (id: string) => Boolean(cast[id]);

/** Plans a story the way the engine does (no voices). */
function plan(shots: Shot[], things: Record<string, unknown> = {}) {
  const timeline = planStory(shots, []);
  const places: string[] = [];
  for (const entry of timeline.entries) places.push(entry.shot.place ?? places.at(-1) ?? "home");
  const motion = planMotion(timeline.entries, {
    aspect: 1080 / 1920,
    sizeOf,
    isCharacter,
    placeOf: (_entry: unknown, i: number) => places[i] ?? "home",
    things: thingSpots(things),
  });
  const posing = {
    plan: motion,
    timeline: timeline.entries,
    placeOf: (i: number) => places[i] ?? "home",
    layoutAt: (i: number) => layoutOf(places[i] ?? "home"),
    sizeOf,
    phaseOf: (id: string) => (hash(id) % 1000) / 1000,
  };
  return { timeline, places, motion, posing };
}

let createWorld: unknown;
beforeAll(async () => {
  createWorld = await loadPhysics();
});

/** The whole film's physics, the way the engine works it out. */
function physics(planned: ReturnType<typeof plan>, things: Record<string, unknown>, hz?: number) {
  return simulate(createWorld, {
    timeline: planned.timeline.entries,
    placeOf: (i: number) => planned.places[i] ?? "home",
    motion: planned.motion,
    things,
    sizeOf,
    isCharacter,
    figureAt: (i: number, id: string, t: number) =>
      figureAt({ ...planned.posing, sim: null }, i, id, t),
    hz,
  }) as Sim;
}

/** A fingerprint of every step of every body. */
function fingerprint(sim: Sim) {
  let h = 2166136261 >>> 0;
  const eat = (track: Track) => {
    const bytes = new Uint8Array(track.data.buffer, 0, track.n * 7 * 4);
    for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  };
  for (const key of [...sim.tracks.keys()].sort()) eat(sim.tracks.get(key) as Track);
  for (const [, falls] of [...sim.limbs].sort(([a], [b]) => a.localeCompare(b))) {
    for (const fall of falls)
      for (const name of [...fall.parts.keys()].sort()) eat(fall.parts.get(name) as Track);
  }
  return h.toString(16);
}

/** Everything that decides a frame at time t: each body's place, each person's root and pose. */
function frameState(planned: ReturnType<typeof plan>, sim: Sim, t: number) {
  const out: number[] = [];
  for (const track of sim.tracks.values()) {
    const { position, quaternion } = sampleTrack(track, t);
    out.push(...position.toArray(), ...quaternion.toArray());
  }
  const index = planned.timeline.entries.findLastIndex((e: { start: number }) => e.start <= t);
  for (const id of ["milo", "theo"]) {
    const figure = figureAt({ ...planned.posing, sim }, Math.max(0, index), id, t);
    if (!figure) continue;
    const frames = rigFrames(figure.pose, figure.root);
    for (const part of ["head", "fistR", "hand", "footL", "footR"])
      out.push(...framePoint(frames[part]).toArray());
  }
  return out;
}

describe("Blocky Cinema: physics any frame can read", () => {
  const things = story.THINGS as Record<string, unknown>;

  it("is the same every time, in any order, like separate render workers", () => {
    const first = plan(story.SHOTS as Shot[], things);
    const second = plan(story.SHOTS as Shot[], things);
    const a = physics(first, things);
    const b = physics(second, things);
    // Same physics every time, from two separately planned films (two render workers).
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.problems).toEqual([]);
    // Frames read forward, backward and in a shuffled order give the same states.
    const times = [0.4, 2.2, 3.5, 6.1, 10.2, 10.5, 11.4, 13.3, 16.1, 19.2, 20.1];
    const forward = new Map(times.map((t) => [t, frameState(first, a, t)]));
    for (const t of [...times].reverse()) expect(frameState(first, a, t)).toEqual(forward.get(t));
    const shuffled = [...times].sort((x, y) => Math.sin(x * 91.7) - Math.sin(y * 91.7));
    for (const t of shuffled) expect(frameState(second, b, t)).toEqual(forward.get(t));
  });

  it("compares 120 steps a second with 60", () => {
    const planned = plan(story.SHOTS as Shot[], things);
    const report: Record<string, unknown> = {};
    for (const hz of [120, 60]) {
      const sim = physics(planned, things, hz);
      // How much the boxes still shiver at rest at the end (m/s, from their last two steps).
      let jitter = 0;
      for (const [key, track] of sim.tracks) {
        if (!key.startsWith("boxes")) continue;
        const d = (k: number) => track.data[k] ?? 0;
        const o = (track.n - 1) * 7;
        const p = (track.n - 2) * 7;
        jitter = Math.max(
          jitter,
          (Math.hypot(d(o) - d(p), d(o + 1) - d(p + 1), d(o + 2) - d(p + 2)) / 2.944) * hz,
        );
      }
      report[hz] = {
        deepestCm: Math.round(sim.stats.deepest * 1000) / 10,
        jitter: Math.round(jitter * 1000) / 1000,
        ms: Math.round(sim.stats.ms),
        hits: sim.hits.length,
      };
      expect(sim.stats.deepest).toBeLessThan(0.03);
      expect(jitter).toBeLessThan(0.05);
      expect(sim.hits.map((h) => h.id)).toEqual(["theo"]);
    }
    console.log("physics, 120 against 60 steps a second:", JSON.stringify(report));
  });

  it("falls when a hard punch lands, and lies near where the plan gets up", () => {
    const planned = plan(story.SHOTS as Shot[], things);
    const sim = physics(planned, things);
    const fall = sim.limbs.get("milo")?.[0];
    expect(fall).toBeDefined();
    if (!fall) return;
    const pelvis = sampleTrack(fall.parts.get("pelvis") as Track, fall.t1).position;
    const head = sampleTrack(fall.parts.get("head") as Track, fall.t1).position;
    // On the floor (hips and head low), and close to where the getting up is planned.
    expect(pelvis.y).toBeLessThan(1.2);
    expect(head.y).toBeLessThan(1.6);
    const knocked = planned.motion.moves.find(
      (m: { kind: string; id: string; stages: { kind: string }[] }) =>
        m.id === "milo" && m.stages[0]?.kind === "knocked",
    ) as unknown as { stages: { to: { x: number; z: number } }[] };
    const to = knocked.stages[0]?.to as { x: number; z: number };
    expect(Math.hypot(pelvis.x - to.x, pelvis.z - to.z)).toBeLessThan(2);
    // Every joint stays a hinge within the toy's own range all the way down (characters.js JOINTS).
    const joints: [string, string, [number, number]][] = [
      ["pelvis", "chest", [-0.6, 1.3]],
      ["chest", "head", [-0.6, 0.7]],
      ["chest", "armL", [-3.3, 1.3]],
      ["chest", "armR", [-3.3, 1.3]],
      ["armL", "foreL", [-2.6, 0]],
      ["armR", "foreR", [-2.6, 0]],
      ["pelvis", "thighL", [-2.3, 1.0]],
      ["pelvis", "thighR", [-2.3, 1.0]],
      ["thighL", "shinL", [0, 2.6]],
      ["thighR", "shinR", [0, 2.6]],
    ];
    for (let t = fall.t0; t <= fall.t1; t += 0.05) {
      for (const [parent, child, [min, max]] of joints) {
        const a = sampleTrack(fall.parts.get(parent) as Track, t).quaternion;
        const b = sampleTrack(fall.parts.get(child) as Track, t).quaternion;
        const rel = a.clone().invert().multiply(b);
        const angle = 2 * Math.atan2(rel.x, rel.w);
        expect(angle, `${child} at ${t.toFixed(2)} s`).toBeGreaterThan(min - 0.12);
        expect(angle, `${child} at ${t.toFixed(2)} s`).toBeLessThan(max + 0.12);
        expect(Math.hypot(rel.y, rel.z), `${child} off its hinge`).toBeLessThan(0.12);
      }
    }
  });
});

describe("Blocky Cinema: moves and actions", () => {
  it("never stops inside furniture: an end point there moves out", () => {
    const home = layoutOf("home");
    const table = home.blocks.find((b: { name: string }) => b.name === "the coffee table");
    const inside = { x: table.x, z: table.z };
    expect(insideBlock(table, inside)).toBe(true);
    const free = freeSpot(home, inside, 1.2) as { x: number; z: number };
    expect(roomAt(home, free, 1.2)).toBe(true);
    // Walking up to someone sitting on the sofa: the coffee table is in front of them.
    const { motion } = plan([
      {
        place: "home",
        who: ["milo", "theo"],
        at: { theo: "sofaL", milo: "front" },
        pose: { theo: "sit" },
        say: "one two",
      },
      {
        who: ["milo", "theo"],
        go: { milo: "theo" },
        say: "three four five six seven eight nine ten",
      },
      { who: ["milo", "theo"], pose: { theo: "angry" }, say: "eleven twelve thirteen fourteen" },
    ]);
    const walk = motion.moves.find(
      (m: { id: string; kind: string }) => m.id === "milo" && m.kind === "go",
    ) as { end: { x: number; z: number } };
    for (const block of home.blocks) expect(insideBlock(block, walk.end, 0.9 * 0.88)).toBe(false);
    // Theo stands up with room: nobody stands inside anyone.
    expect(motion.problems).toEqual([]);
  });

  it("jumps over the coffee table in a real arc", () => {
    const { motion } = plan(story.SHOTS as Shot[], story.THINGS as Record<string, unknown>);
    const travel = motion.moves
      .flatMap(
        (m: { stages: { kind: string; jump?: { t0: number; t1: number; peak: number } }[] }) =>
          m.stages,
      )
      .find((s: { jump?: unknown }) => s.jump) as {
      jump: { t0: number; t1: number; peak: number };
    };
    expect(travel).toBeDefined();
    const { t0, t1, peak } = travel.jump;
    // The peak is where gravity puts it for that time in the air, high enough to clear the table with the knees up.
    expect(peak).toBeCloseTo((GRAVITY * (t1 - t0) ** 2) / 8, 5);
    expect(peak + 0.9 * 0.88).toBeGreaterThan(1.35);
    const middle = personState(motion, 1, "milo", (t0 + t1) / 2, layoutOf("home"));
    expect(middle.y).toBeCloseTo(peak, 2);
    expect(personState(motion, 1, "milo", t1 + 0.01, layoutOf("home")).y).toBeLessThan(0.05);
  });

  it("lands the punch's fist on the face at the contact", () => {
    const planned = plan(story.SHOTS as Shot[], story.THINGS as Record<string, unknown>);
    const punch = planned.motion.punches[0] as { id: string; target: string; t: number };
    const index = planned.timeline.entries.findLastIndex(
      (e: { start: number }) => e.start <= punch.t,
    );
    const t = punch.t - 1e-3;
    const puncher = figureAt(planned.posing, index, punch.id, t);
    const target = figureAt(planned.posing, index, punch.target, t);
    if (!puncher || !target) throw new Error("both are in the shot");
    const fist = framePoint(rigFrames(puncher.pose, puncher.root).fistR);
    const head = framePoint(rigFrames(target.pose, target.root).head);
    // Within the head's half-width (0.66) of its middle: on the face.
    expect(fist.distanceTo(head)).toBeLessThan(0.66 * sizeOf(punch.target) + 0.25);
  });

  it("aims an arm exactly where it can reach", () => {
    const root = { x: 1, y: 0, z: 2, rot: 0.4, size: 1.04 };
    // Within reach (the arm is 1.43 units long at size 1).
    const target = new THREE.Vector3(2.6, 4.2, 2.3);
    const aimed = aimArm({}, root, "L", target);
    expect(framePoint(rigFrames(aimed, root).fistL).distanceTo(target)).toBeLessThan(1e-3);
  });

  it("keeps a sprinting foot on the ground where it landed", () => {
    // In the stance, the foot goes back exactly as fast as the body goes forward.
    for (const phase of [0.02, 0.1, 0.2]) {
      const a = gaitPose("sprint", phase);
      const b = gaitPose("sprint", phase + 0.01);
      const footA = legFK(a.legL, a.kneeL).z;
      const footB = legFK(b.legL, b.kneeL).z;
      // 0.01 of a cycle is 0.046 units of ground (cycle 4.6).
      expect(footB - footA).toBeCloseTo(-0.046, 2);
    }
  });

  it("finds problems in plain words", () => {
    const { motion } = plan(
      [
        {
          place: "home",
          who: ["milo", "theo"],
          at: { milo: "left", theo: "right" },
          say: "one two",
        },
        { who: ["milo", "theo"], act: { milo: { punch: "theo" } }, say: "three four five" },
        { who: ["milo"], act: { milo: { throw: "theo" } }, say: "six seven" },
        {
          who: ["milo"],
          go: { milo: { to: "back", pace: "walk", over: "coffee table" } },
          say: "eight nine",
        },
        { who: ["milo"], act: { milo: { pickUp: "cake" } }, say: "ten eleven" },
      ],
      {},
    );
    expect(motion.problems).toEqual([
      expect.stringContaining("Milo is too far from Theo to punch"),
      expect.stringContaining("Milo throws, but holds nothing"),
      expect.stringContaining(
        'jumping over the coffee table needs a run-up: pace "run" or "sprint"',
      ),
      // Milo stays at "left" from the first shot, so his walk to the back is too long for the shots left here.
      expect.stringContaining("Milo's walk to the back takes"),
      expect.stringContaining('there\'s no "cake" in home to pick up'),
    ]);
  });
});

type Solid = { x: number; y: number; z: number; w: number; h: number; d: number; rot?: number };

/** The tour: a short scene in each place, with a walk, a pick-up and a throw, a run through crates, a punch. */
const TOUR = {
  THINGS: {
    ball: { prop: "ball", place: "bedroom", at: { x: 1.2, z: -1.2 } },
    cup: { prop: "cup", place: "bedroom", at: { x: 9.6, z: -5.2, y: 2.2 } },
    crates: { prop: "box", place: "school", at: { x: 0.6, z: -2.8 }, stack: 2 },
    parcel: { prop: "gift", place: "town", at: { x: 2.4, z: -11.6, y: 0.3 } },
    yardBall: { prop: "ball", place: "backyard", at: { x: 3, z: -1 } },
    classBook: { prop: "book", place: "classroom", at: { x: 4.4, z: -7.9, y: 2.2 } },
    present: { prop: "gift", place: "park", at: { x: 2, z: 0.4 } },
    crate: { prop: "box", place: "forest", at: { x: 1.6, z: 0.6 } },
  },
  SHOTS: [
    {
      place: "bedroom",
      light: "evening",
      shot: "full",
      who: ["milo", "zee"],
      at: { milo: "left", zee: "right" },
      go: { milo: "ball" },
      act: { milo: { pickUp: "ball" } },
      say: "Milo found his old ball",
    },
    {
      shot: "medium",
      who: ["milo", "zee"],
      act: { milo: { throw: "zee", at: "catch." } },
      say: "and yelled: catch.",
    },
    { shot: "close", who: ["zee"], say: "Zee caught it with his face." },
    {
      place: "school",
      light: "day",
      shot: "full",
      who: ["theo", "nadia"],
      at: { nadia: "right" },
      go: { theo: { from: "back", to: "center", pace: "run" } },
      say: "Theo ran late to class, right through the crates.",
    },
    {
      place: "town",
      light: "evening",
      shot: "wide",
      who: ["ruby"],
      go: { ruby: { from: "off-left", to: "center", pace: "run" } },
      say: "Ruby raced home before dark.",
    },
    {
      place: "backyard",
      light: "evening",
      shot: "wide",
      who: ["ruby", "bo"],
      at: { bo: "chair1" },
      pose: { bo: "sit" },
      go: { ruby: { from: "door", to: "center", pace: "run" } },
      say: "Out back, Ruby ran past Grandpa Bo,",
    },
    {
      shot: "full",
      who: ["ruby", "bo"],
      go: { ruby: "yardBall", bo: "back" },
      act: { ruby: { pickUp: "yardBall" } },
      say: "grabbed her ball from the grass",
    },
    {
      shot: "medium",
      who: ["ruby", "bo"],
      act: { ruby: { throw: "bo", at: "Grandpa." } },
      say: "and tossed it right to Grandpa.",
    },
    { shot: "close", who: ["bo", "ruby"], say: "He laughed so hard he cried." },
    {
      place: "kitchen",
      light: "evening",
      shot: "wide",
      who: ["theo", "nadia", "milo"],
      at: { theo: "chair1", nadia: "stove" },
      pose: { theo: "sit" },
      go: { milo: { from: "left", to: "chair3" } },
      say: "At dinner, Milo sat down by Dad",
    },
    { shot: "medium", who: ["milo", "theo"], say: "while Mom stirred the soup." },
    {
      place: "classroom",
      light: "day",
      shot: "wide",
      who: ["bo", "zee", "ruby"],
      at: { bo: "back", zee: "desk2", ruby: "desk5" },
      pose: { zee: "sit", ruby: "sit" },
      say: "In class, Grandpa taught fractions,",
    },
    {
      shot: "full",
      who: ["bo", "zee"],
      go: { bo: "classBook" },
      act: { bo: { pickUp: "classBook" } },
      say: "picked up his big math book",
    },
    { shot: "close", who: ["zee", "bo"], say: "and Zee gasped." },
    {
      place: "cafe",
      light: "day",
      shot: "wide",
      who: ["nadia", "zee"],
      at: { nadia: "barista" },
      go: { zee: { from: "center", to: "counter" } },
      say: "At the cafe, Zee walked up to the counter",
    },
    { shot: "medium", who: ["zee", "nadia"], say: "and ordered the biggest cupcake they had." },
    {
      shot: "full",
      who: ["zee"],
      go: { zee: "seat2" },
      say: "Then he sat down at the table by the window to eat every crumb.",
    },
    {
      place: "park",
      light: "day",
      shot: "full",
      who: ["zee"],
      at: { zee: "center" },
      go: { zee: { to: "right", pace: "sprint" } },
      say: "Zee sprinted to the swings and back again.",
    },
    {
      place: "forest",
      light: "night",
      shot: "medium",
      who: ["theo", "milo"],
      at: { milo: "left", theo: "right" },
      go: { theo: "milo" },
      say: "By the fire, Theo came closer,",
    },
    {
      shot: "medium",
      who: ["theo", "milo"],
      act: { theo: { punch: "milo", at: "shoulder." } },
      say: "and tapped him on the shoulder.",
    },
  ],
};

describe("Blocky Cinema: every place", () => {
  it("has its spots clear of the furniture, standing on its ground", () => {
    for (const [name, layout] of Object.entries(LAYOUTS) as [
      string,
      {
        spots: Record<string, { x: number; z: number; y?: number; seat?: number; bed?: number }>;
        blocks: { name: string; x: number; z: number; w: number; d: number; rot?: number }[];
        ground?: (x: number, z: number) => number;
      },
    ][]) {
      for (const [spot, at] of Object.entries(layout.spots)) {
        // A seat or a bed is on its furniture; everyone else stands clear of it.
        if (at.seat === undefined && at.bed === undefined) {
          const inside = layout.blocks.filter((b) => insideBlock(b, at, 0)).map((b) => b.name);
          expect(inside, `${name}: ${spot}`).toEqual([]);
        }
        const ground = layout.ground ? layout.ground(at.x, at.z) : 0;
        expect(ground, `${name}: ${spot} stands at y ${at.y ?? 0}`).toBeCloseTo(at.y ?? 0, 2);
      }
    }
  });

  it("has physics shapes inside its walls, and a height on every piece of furniture", () => {
    for (const [name, layout] of Object.entries(LAYOUTS) as [
      string,
      {
        walls?: { minX: number; maxX: number; minZ: number; maxZ: number };
        blocks: { name: string; h?: number }[];
      },
    ][]) {
      expect(solidsOf(layout).length, name).toBeGreaterThan(0);
      for (const block of layout.blocks)
        expect(block.h, `${name}: ${block.name}`).toBeGreaterThan(0);
      const walls = layout.walls;
      if (!walls) continue;
      for (const b of solidsOf(layout) as Solid[]) {
        // A turned box reaches out along x and z by its turned sides.
        const c = Math.abs(Math.cos(b.rot ?? 0));
        const n = Math.abs(Math.sin(b.rot ?? 0));
        const halfX = (c * b.w + n * b.d) / 2;
        const halfZ = (n * b.w + c * b.d) / 2;
        expect(b.x - halfX, name).toBeGreaterThanOrEqual(walls.minX - 0.01);
        expect(b.x + halfX, name).toBeLessThanOrEqual(walls.maxX + 0.01);
        expect(b.z - halfZ, name).toBeGreaterThanOrEqual(walls.minZ - 0.01);
        expect(b.z + halfZ, name).toBeLessThanOrEqual(walls.maxZ + 0.01);
      }
    }
  });

  it("lets a box dropped on any piece of furniture come to rest on it, never inside it", () => {
    const meters = (u: number) => u / UNITS_PER_METER;
    const create = createWorld as (o: { hz: number }) => {
      fixedBox: (b: Record<string, number>) => void;
      body: (b: Record<string, unknown>) => number;
      step: () => void;
      read: (h: number) => number[];
      free: () => void;
    };
    for (const [name, layout] of Object.entries(LAYOUTS)) {
      const solids = solidsOf(layout) as Solid[];
      // Furniture people meet (not the long rows of houses or the pavements).
      for (const target of solids.filter((b) => Math.max(b.w, b.d) < 30)) {
        const world = create({ hz: 120 });
        world.fixedBox({ x: 0, y: -0.5, z: 0, w: 400, h: 1, d: 400 });
        // Only the boxes near it can catch the box (a whole street would only slow the test down).
        const near = solids.filter(
          (b) =>
            Math.hypot(b.x - target.x, b.z - target.z) <
            (Math.hypot(b.w, b.d) + Math.hypot(target.w, target.d)) / 2 + 2,
        );
        for (const b of near) {
          world.fixedBox({
            x: meters(b.x),
            y: meters(b.y),
            z: meters(b.z),
            w: meters(b.w),
            h: meters(b.h),
            d: meters(b.d),
            rotY: b.rot ?? 0,
          });
        }
        // Above everything over that spot (a trunk's top is inside its crown).
        const over = (b: Solid) => {
          const c = Math.cos(b.rot ?? 0);
          const sn = Math.sin(b.rot ?? 0);
          const dx = target.x - b.x;
          const dz = target.z - b.z;
          return Math.abs(dx * c - dz * sn) <= b.w / 2 && Math.abs(dx * sn + dz * c) <= b.d / 2;
        };
        const top = Math.max(...solids.filter(over).map(b2top));
        const box = world.body({
          shape: { box: [0.3, 0.3, 0.3] },
          at: { x: meters(target.x), y: meters(top) + 0.4, z: meters(target.z) },
          density: 200,
        });
        for (let i = 0; i < 240; i++) world.step();
        const [x = 0, y = 0, z = 0] = world.read(box);
        world.free();
        const at = { x: x * UNITS_PER_METER, y: y * UNITS_PER_METER, z: z * UNITS_PER_METER };
        // Its middle isn't inside any piece of furniture (shrunk a little: resting on one touches it).
        const inside = solids.find((b) => {
          const c = Math.cos(b.rot ?? 0);
          const sn = Math.sin(b.rot ?? 0);
          const dx = at.x - b.x;
          const dz = at.z - b.z;
          return (
            Math.abs(dx * c - dz * sn) < b.w / 2 - 0.1 &&
            Math.abs(dx * sn + dz * c) < b.d / 2 - 0.1 &&
            Math.abs(at.y - b.y) < b.h / 2 - 0.1
          );
        });
        expect(
          inside,
          `${name}: a box dropped on the piece at ${target.x}, ${target.z}`,
        ).toBeUndefined();
        expect(at.y, `${name}: ${target.x}, ${target.z}`).toBeGreaterThan(0);
      }
    }
  });

  it("plays the tour of every place without problems", () => {
    const planned = plan(TOUR.SHOTS as Shot[], TOUR.THINGS);
    expect(planned.motion.problems).toEqual([]);
    const sim = physics(planned, TOUR.THINGS);
    expect(sim.problems).toEqual([]);
    expect(sim.hits.map((h) => h.id)).toEqual(["zee", "bo"]);
    // The cup rests on the desk, the parcel on the pavement: things on furniture stay on it.
    const end = planned.timeline.duration;
    const cup = sampleTrack(sim.tracks.get("cup") as Track, end).position;
    expect(cup.y).toBeGreaterThan(2.2);
    const parcel = sampleTrack(sim.tracks.get("parcel") as Track, end).position;
    expect(parcel.y).toBeGreaterThan(0.3);
    // Milo sat down at the kitchen table; Grandpa holds the book he picked up from his desk.
    expect(
      planned.motion.holds.map((h: { id: string; thing: string }) => `${h.id}:${h.thing}`),
    ).toContain("bo:classBook");
    // Grandpa got up from his garden chair on the deck, and the ball came to rest on the grass.
    const ball = sampleTrack(sim.tracks.get("yardBall") as Track, end).position;
    expect(ball.y).toBeLessThan(0.6);
    // Theo's run knocked the crates along the hall.
    const crate = sampleTrack(sim.tracks.get("crates#0") as Track, end).position;
    expect(Math.hypot(crate.x - 0.6, crate.z + 2.8)).toBeGreaterThan(1);
  });
});

/** The top of a physics shape (units). */
const b2top = (b: Solid) => b.y + b.h / 2;
