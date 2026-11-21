// @ts-expect-error: three ships without type declarations in this project.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FX_SOUNDS, moveEffects } from "../../templates/blocky-cinema/blocky/fx.js";
import {
  CLEARANCE,
  crossesBlock,
  findPath,
  MEET,
  offPoint,
  personState,
  planMotion,
  speedProfile,
} from "../../templates/blocky-cinema/blocky/motion.js";
import {
  ANKLE_Y,
  blendPoses,
  GAIT_NAMES,
  GAITS,
  gaitPose,
  HIP_Y,
  legFK,
  legIK,
  SEAT_REACH,
  seatBack,
  sitDownPose,
  speedOf,
  standUpPose,
} from "../../templates/blocky-cinema/blocky/poses.js";
import { cameraSide, viewBlocked } from "../../templates/blocky-cinema/blocky/shots.js";
import { planStory } from "../../templates/blocky-cinema/blocky/timing.js";
import { SOUND_NAMES } from "./sounds.ts";

type Move = {
  id: string;
  kind: string;
  t0: number;
  t1: number;
  pace: string;
  enters: boolean;
  exits: boolean;
  target: string | null;
  end: { x: number; z: number; rot: number; posture: string };
  stages: { kind: string; t0: number; t1: number; from?: number; to?: number }[];
  path?: { length: number; points: { x: number; z: number }[] };
};

/** A room to walk in: a seat at the back, a table in the middle. */
const room = {
  spots: {
    front: { x: 0, z: 6, rot: 0 },
    left: { x: -4, z: 2, rot: 0.6 },
    right: { x: 4, z: 2, rot: -0.6 },
    center: { x: 0, z: 2, rot: 0 },
    back: { x: 0, z: -8, rot: 0 },
    seat: { x: 0, z: -4, rot: 0, seat: 0.66 },
    door: { x: 8, z: -6, rot: -1.2 },
  },
  seats: ["seat"],
  beds: [],
  blocks: [{ name: "the table", x: 0, z: -1, w: 3, d: 1.6 }],
  bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
  wide: { pos: [0, 6, 18], target: [0, 2, 0] },
};
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const plan = (shots: object[], places: string[] = []) => {
  const story = planStory(shots, []);
  const motion = planMotion(story.entries, {
    layouts: () => room,
    placeOf: (_entry: unknown, i: number) => places[i] ?? "room",
    isCharacter: (id: string) => ["milo", "zee", "ruby"].includes(id),
  });
  return { story, motion, moves: motion.moves as Move[] };
};
const close = (a: number, b: number, digits = 4) => expect(a).toBeCloseTo(b, digits);
const LIMITS = { leg: [-2.3, 1.0], knee: [0, 2.6], ankle: [-0.8, 0.8] };

describe("Blocky Cinema legs: the feet stay where they are", () => {
  it("finds the leg angles for a foot, and the foot for the angles", () => {
    for (const [z, y] of [
      [0, -1.6],
      [0.5, -1.4],
      [-0.4, -1.3],
      [0.86, -0.82],
    ] as [number, number][]) {
      const { leg, knee } = legIK(z, y);
      const foot = legFK(leg, knee);
      close(foot.z, z);
      close(foot.y, y);
    }
  });

  it("walks, runs, sneaks and tiptoes with the foot on the ground planted, every joint within its limits", () => {
    for (const pace of GAIT_NAMES) {
      const g = GAITS[pace as keyof typeof GAITS];
      let planted: { z: number; y: number } | null = null;
      for (let i = 0; i <= 240; i++) {
        const phase = i / 120;
        const pose = gaitPose(pace, phase);
        for (const side of ["L", "R"]) {
          expect(pose[`leg${side}`]).toBeGreaterThanOrEqual(LIMITS.leg[0] ?? 0);
          expect(pose[`leg${side}`]).toBeLessThanOrEqual(LIMITS.leg[1] ?? 0);
          expect(pose[`knee${side}`]).toBeGreaterThanOrEqual(LIMITS.knee[0] ?? 0);
          expect(pose[`knee${side}`]).toBeLessThanOrEqual(LIMITS.knee[1] ?? 0);
        }
        // The left foot is on the ground for the first part of each cycle; the body goes `cycle` per cycle.
        const c = phase % 1;
        const fk = legFK(pose.legL, pose.kneeL);
        const foot = { z: phase * g.cycle + fk.z, y: HIP_Y + pose.bodyY + fk.y };
        if (c > 0.01 && c < g.stance - 0.01) {
          if (planted) {
            close(foot.z, planted.z);
            close(foot.y, planted.y);
          }
          planted ??= foot;
        } else {
          planted = null;
        }
      }
      expect(speedOf(pace)).toBeCloseTo(g.cycle * g.rate, 6);
    }
    expect(speedOf("run")).toBeGreaterThan(speedOf("walk"));
    expect(speedOf("sneak")).toBeLessThan(speedOf("walk"));
  });

  it("sits down and stands up over planted feet, ending in the sitting pose", () => {
    const drop = -0.84;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const pose = sitDownPose(k, drop);
      const foot = legFK(pose.legL, pose.kneeL);
      // The hips go back by SEAT_REACH * seatBack(k): the foot, seen from them, comes forward as much.
      close(foot.z, SEAT_REACH * seatBack(k), 3);
      close(HIP_Y + pose.bodyY + foot.y, ANKLE_Y, 3);
    }
    const seated = sitDownPose(1, drop);
    expect(seated.legL).toBeCloseTo(-1.57, 1);
    expect(seated.kneeL).toBeCloseTo(1.57, 1);
    expect(standUpPose(0, drop).legL).toBeCloseTo(seated.legL, 4);
    expect(Math.abs(standUpPose(1, drop).kneeL)).toBeLessThan(0.1);
  });

  it("blends poses joint by joint", () => {
    const a = { lean: 0.2, armL: [0, 1] };
    const b = { lean: 0.6, armL: [1, 3], headY: 1 };
    expect(blendPoses(a, b, 0)).toBe(a);
    expect(blendPoses(a, b, 1)).toBe(b);
    expect(blendPoses(a, b, 0.5)).toEqual({ lean: 0.4, armL: [0.5, 2], headY: 0.5 });
  });
});

describe("Blocky Cinema walks", () => {
  it("turns toward the way first, speeds up, slows down, turns around and sits down", () => {
    const { moves, motion } = plan([
      { who: ["milo"], at: { milo: "front" }, go: { milo: "seat" }, say: words(16) },
    ]);
    const [move] = moves;
    if (!move) throw new Error("no move");
    // He faces the camera side (+z) and the seat is behind him: a big turn first (toward the way round the table),
    // then the walk, then a turn to put his back to the seat, then sitting down.
    expect(move.stages.map((s) => s.kind)).toEqual(["turn", "travel", "turn", "sitDown"]);
    const first = move.stages[0];
    expect(Math.abs((first?.to ?? 0) - (first?.from ?? 0))).toBeGreaterThan(2);
    expect(move.end).toMatchObject({ x: 0, z: -4, posture: "sit" });
    // The walk ends in front of the seat, around the table.
    const last = move.path?.points.at(-1);
    close(last?.x ?? 99, 0);
    close(last?.z ?? 99, -4 + SEAT_REACH);
    expect(move.path?.points.length).toBeGreaterThan(2);
    // Mid-walk: the gait's phase is the distance walked, so the feet don't slide.
    const travel = move.stages[1];
    if (!travel) throw new Error("no walk");
    const mid = (travel.t0 + travel.t1) / 2;
    const state = personState(motion, 0, "milo", mid);
    expect(state.act.kind).toBe("gait");
    // Sitting, after it.
    const after = personState(motion, 0, "milo", move.t1 + 0.1);
    expect(after).toMatchObject({ posture: "sit", act: null, seat: 0.66 });
  });

  it("goes as fast as its pace, starting and stopping smoothly", () => {
    const profile = speedProfile(12, 3, [0.35, 0.4]);
    expect(profile.speed(0)).toBe(0);
    expect(profile.speed(profile.seconds / 2)).toBeCloseTo(3, 6);
    expect(profile.at(profile.seconds)).toBeCloseTo(12, 6);
    expect(profile.speed(profile.seconds)).toBe(0);
    // Already walking (coming into the picture): full speed at once.
    expect(speedProfile(6, 3, [0, 0.4]).speed(0)).toBe(3);
    const walk = plan([
      { who: ["milo"], at: { milo: "left" }, go: { milo: "right" }, say: words(20) },
    ]).moves[0];
    const run = plan([
      {
        who: ["milo"],
        at: { milo: "left" },
        go: { milo: { to: "right", pace: "run" } },
        say: words(20),
      },
    ]).moves[0];
    expect((run?.t1 ?? 0) - (run?.t0 ?? 0)).toBeLessThan((walk?.t1 ?? 0) - (walk?.t0 ?? 0));
  });

  it("finds a way around furniture, and says what is in the way when there is none", () => {
    const table = room.blocks[0];
    const found = findPath(room, { x: 0, z: 3 }, { x: 0, z: -5 });
    expect(found.blocked).toBeNull();
    expect(found.points.length).toBeGreaterThan(2);
    for (let i = 1; i < found.points.length; i++) {
      expect(crossesBlock(table, found.points[i - 1], found.points[i], CLEARANCE - 0.01)).toBe(
        false,
      );
    }
    const walled = {
      ...room,
      blocks: [{ name: "a wall", x: 0, z: 0, w: 60, d: 1 }],
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    };
    expect(findPath(walled, { x: 0, z: 3 }, { x: 0, z: -5 }).blocked).toBe("a wall");
  });

  it("comes in and goes out on the sides of the picture the camera sees", () => {
    const framed = [{ x: 0, z: 2, fx: 0, fz: 1 }];
    const options = { shot: { shot: "medium" }, index: 0, aspect: 16 / 9, layout: room, framed };
    // The camera looks from +z toward -z: the picture's left is -x.
    expect(offPoint("off-left", { x: 0, z: 2 }, options).point.x).toBeLessThan(-4);
    expect(offPoint("off-right", { x: 0, z: 2 }, options).point.x).toBeGreaterThan(4);
    const { moves, motion, story } = plan([
      {
        who: ["milo"],
        go: { milo: { from: "off-left", to: "center", at: "word3" } },
        say: words(14),
      },
    ]);
    const move = moves[0];
    if (!move) throw new Error("no move");
    expect(move.enters).toBe(true);
    expect(move.stages[0]?.kind).toBe("travel");
    // Not there before the word, then walking in.
    expect(personState(motion, 0, "milo", 0.2).hidden).toBe(true);
    expect(personState(motion, 0, "milo", move.t0 + 0.1).hidden).toBe(false);
    const word = story.entries[0]?.words.find((w: { text: string }) => w.text === "word3");
    expect(move.t0).toBeCloseTo(word.start, 6);
  });

  it("keeps people where they went, and sitting people seated, until the place changes", () => {
    const { motion, moves } = plan(
      [
        {
          who: ["milo", "ruby"],
          at: { milo: "front" },
          pose: { ruby: "sit" },
          go: { milo: "door" },
          say: words(20),
        },
        { who: ["milo", "ruby"], say: words(6) },
        { who: ["milo", "ruby"], pose: { ruby: "wave" }, say: words(6) },
        { who: ["milo"], say: words(6) },
      ],
      ["room", "room", "room", "other"],
    );
    const second = motion.entries[1].people;
    expect(second.get("milo").base).toMatchObject({ x: 8, z: -6 });
    expect(second.get("ruby").base).toMatchObject({ posture: "sit", x: 0, z: -4 });
    // Ruby gets up when a shot gives her a standing pose.
    expect(moves.find((m) => m.id === "ruby")?.stages.map((s) => s.kind)).toEqual(["standUp"]);
    // Another place: placed as usual again.
    expect(motion.entries[3].people.get("milo").base).toMatchObject({ x: 2 * 0, z: 2 });
  });

  it("walks up to someone's front, and they turn to face the one coming", () => {
    const { moves } = plan([
      {
        who: ["milo", "zee"],
        at: { milo: "back", zee: "center" },
        go: { milo: "zee" },
        say: words(24),
      },
    ]);
    const walk = moves.find((m) => m.id === "milo");
    if (!walk) throw new Error("no walk");
    // Zee faces +z; Milo comes from behind her and goes round to her front side.
    expect(walk.end.z).toBeGreaterThan(2);
    expect(Math.hypot(walk.end.x - 0, walk.end.z - 2)).toBeCloseTo(MEET, 4);
    const turn = moves.find((m) => m.id === "zee");
    expect(turn?.kind).toBe("look");
    expect(turn?.t1).toBeGreaterThan(walk.t1 - 0.5);
  });

  it("explains walks that can't happen", () => {
    const { motion } = plan([
      { who: ["milo"], go: { milo: "kitchen" }, say: words(6) },
      { who: ["milo"], go: { milo: "door" }, pose: { milo: "sit" }, say: words(30) },
      { who: ["milo"], go: { zee: "door", milo: { to: "front", pace: "jog" } }, say: words(6) },
      { who: ["milo"], look: { milo: "ruby" }, go: { milo: "ruby" }, say: words(6) },
      {
        who: ["milo"],
        at: { milo: "back" },
        go: { milo: { to: "front", pace: "sneak" } },
        say: "go",
      },
    ]);
    expect(motion.problems).toEqual([
      expect.stringContaining('Shot 1: Milo can\'t go to "kitchen"'),
      expect.stringContaining('Shot 2: Milo sits at "door", which isn\'t a seat'),
      expect.stringContaining('Shot 3: "go" moves Zee, who isn\'t in the shot'),
      expect.stringContaining('Shot 3: "jog" isn\'t a pace'),
      expect.stringContaining("Shot 4: Milo walks up to Ruby, who isn't in the shot"),
      expect.stringContaining('Shot 4: Milo looks at "ruby", who isn\'t in the shot.'),
      expect.stringMatching(/^Shot 5: Milo's sneak to the front takes .* s, but the shot lasts/),
    ]);
  });
});

describe("Blocky Cinema runs and the camera", () => {
  it("puts dust where a run sets off and stops, and the patter of feet on the Effects lane", () => {
    const shots = [
      {
        who: ["milo"],
        at: { milo: "left" },
        go: { milo: { to: "door", pace: "run" } },
        say: words(20),
      },
      { who: ["zee"], at: { zee: "left" }, go: { zee: "right" }, say: words(12) },
    ];
    const { story, moves } = plan(shots);
    const events = moveEffects(moves, story.entries);
    expect(events.filter((e: { type: string }) => e.type === "dust")).toHaveLength(2);
    expect(events.every((e: { on: string }) => e.on === "milo")).toBe(true);
    expect(events[0]).toMatchObject({ type: "dust", sound: "patter" });
    expect(events.at(-1)).toMatchObject({ type: "dust", sound: null });
    // The same story gives the same keys.
    const again = moveEffects(plan(shots).moves, plan(shots).story.entries);
    expect(again.map((e: { key: string }) => e.key)).toEqual(
      events.map((e: { key: string }) => e.key),
    );
    expect(FX_SOUNDS).toContain("patter");
    expect(SOUND_NAMES).toContain("patter");
  });

  it("films people facing each other from the side, and sees when someone is in the way", () => {
    // Two people face each other along x: the camera comes from the place's open side (+z), across the line.
    const side = cameraSide(
      [
        { x: -2, z: 0, fx: 1, fz: 0 },
        { x: 2, z: 0, fx: -1, fz: 0 },
      ],
      [0, 6, 18],
    );
    close(side.x, 0);
    close(side.z, 1);
    const camera = new THREE.Vector3(0, 4, 10);
    const target = new THREE.Vector3(0, 4, 0);
    expect(viewBlocked(camera, target, [{ head: new THREE.Vector3(0, 4, 5), size: 1 }])).toBe(true);
    expect(viewBlocked(camera, target, [{ head: new THREE.Vector3(5, 4, 5), size: 1 }])).toBe(
      false,
    );
  });
});
