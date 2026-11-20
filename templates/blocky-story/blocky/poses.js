// Poses: each is a function of `u` (seconds into the shot) and a per-character phase, giving joint angles.
// Angles in radians (each joint stops at its limit: JOINTS in characters.js).
// - Arms (`armL`, `armR`: [x, z]): x < 0 swings forward, z > 0 lifts outward. `elbowL/R` > 0 bends the forearm
//   forward, `wristL/R` tips the hand.
// - Legs (`legL`, `legR`): x < 0 swings forward. `kneeL/R` > 0 bends the shin back, `ankleL/R` tips the foot.
// - Body: `lean` > 0 bends forward at the waist, `twist` turns it, `tilt` leans sideways; `headX/Y/Z` turn the head
//   on its neck. `bodyY` lifts the whole figure (sitting, jumping); `bodyX` tips it (lying).

const TAU = Math.PI * 2;
const breathe = (u, p) => Math.sin(u * 1.9 + p * TAU);

/** A thigh and a shin, from the hip to the ankle (units). */
const LEG = 1.66;

const base = (u, p) => ({
  lean: 0.015 * breathe(u, p),
  headX: 0.02 * Math.sin(u * 1.1 + p * 5),
  headY: 0.05 * Math.sin(u * 0.6 + p * 3),
  armL: [0.04 * breathe(u, p + 0.3), 0.06],
  armR: [0.04 * breathe(u, p + 0.6), 0.06],
  elbowL: 0.12,
  elbowR: 0.12,
  legL: 0,
  legR: 0,
});

/**
 * Bending both knees with the feet flat on the ground: the thighs go forward by `a`, the knees bend twice that,
 * and the body comes down so the feet stay on the floor.
 */
function crouch(a) {
  return {
    legL: -a,
    legR: -a,
    kneeL: 2 * a,
    kneeR: 2 * a,
    ankleL: a,
    ankleR: a,
    bodyY: -LEG * (1 - Math.cos(a)),
  };
}

/** Walking-style swing: legs and arms in opposite phase; a leg bends its knee while it swings forward. */
function stride(u, p, hz, legSwing, armSwing, kneeBend, elbowBend) {
  const phase = u * hz * TAU + p * TAU;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  return {
    legL: -s * legSwing,
    legR: s * legSwing,
    kneeL: kneeBend * Math.max(0, c),
    kneeR: kneeBend * Math.max(0, -c),
    ankleL: 0.25 * kneeBend * Math.max(0, c),
    ankleR: 0.25 * kneeBend * Math.max(0, -c),
    armL: [s * armSwing, 0.08],
    armR: [-s * armSwing, 0.08],
    elbowL: elbowBend,
    elbowR: elbowBend,
    bodyY: Math.abs(c) * 0.12,
  };
}

/** Sitting: thighs forward, shins straight down (the seat is at knee height), hands on the lap. */
const SIT = {
  legL: -1.57,
  legR: -1.57,
  kneeL: 1.57,
  kneeR: 1.57,
  armL: [-0.5, 0.08],
  armR: [-0.5, 0.08],
  elbowL: 0.75,
  elbowR: 0.75,
};

export const POSES = {
  idle: (u, p) => base(u, p),
  talk: (u, p) => {
    const g = Math.max(0, Math.sin(u * 2.3 + p * TAU));
    return {
      ...base(u, p),
      armR: [-0.3 - 0.35 * g, 0.12 + 0.15 * g],
      elbowR: 0.7 + 0.6 * g,
      wristR: -0.2 * g,
      armL: [-0.1 - 0.2 * Math.max(0, Math.sin(u * 1.7 + p * 9)), 0.1],
      elbowL: 0.35,
      headX: 0.05 * Math.sin(u * 6 + p),
      headZ: 0.04 * Math.sin(u * 1.3 + p * 4),
    };
  },
  wave: (u, p) => ({
    ...base(u, p),
    armR: [-0.25, 2.2],
    elbowR: 0.55 + 0.4 * Math.sin(u * 9),
    headZ: 0.08,
  }),
  point: (u, p) => ({ ...base(u, p), armR: [-1.5, 0.12], elbowR: 0, lean: 0.05, headY: 0.1 }),
  cheer: (u, p) => {
    const b = Math.abs(Math.sin(u * 5 + p));
    return {
      ...base(u, p),
      armL: [-0.2, 2.55 + 0.25 * b],
      armR: [-0.2, 2.55 + 0.25 * b],
      elbowL: 0.25,
      elbowR: 0.25,
      bodyY: 0.35 * b,
    };
  },
  shrug: (u, p) => ({
    ...base(u, p),
    armL: [-0.15, 0.4],
    armR: [-0.15, 0.4],
    elbowL: 1.35,
    elbowR: 1.35,
    wristL: -0.4,
    wristR: -0.4,
    headZ: 0.22,
    bodyY: 0.05 * Math.abs(Math.sin(u * 3)),
  }),
  cry: (u, p) => ({
    ...base(u, p),
    // Hands to the eyes.
    armL: [-1.05, -0.2],
    armR: [-1.05, -0.2],
    elbowL: 2.05,
    elbowR: 2.05,
    headX: 0.3,
    lean: 0.12,
    tilt: 0.04 * Math.sin(u * 22 + p),
  }),
  scared: (u, p) => ({
    ...base(u, p),
    armL: [-0.75, 0.3],
    armR: [-0.75, 0.3],
    elbowL: 1.25,
    elbowR: 1.25,
    wristL: -0.5,
    wristR: -0.5,
    lean: -0.12,
    headX: -0.08,
    tilt: 0.025 * Math.sin(u * 30 + p * 9),
  }),
  think: (u, p) => ({
    ...base(u, p),
    // A hand to the chin, the other arm across the body.
    armR: [-0.95, -0.3],
    elbowR: 2.1,
    armL: [-0.45, -0.25],
    elbowL: 1.5,
    headZ: 0.16,
    headY: 0.18,
  }),
  facepalm: (u, p) => ({
    ...base(u, p),
    armR: [-1.15, -0.32],
    elbowR: 2.15,
    headX: 0.32,
    lean: 0.08,
  }),
  hug: (u, p) => ({
    ...base(u, p),
    armL: [-1.35, -0.15],
    armR: [-1.35, -0.15],
    elbowL: 0.75,
    elbowR: 0.75,
    lean: 0.08,
  }),
  angry: (u, p) => {
    const stomp = Math.max(0, Math.sin(u * 7 + p * TAU));
    return {
      ...base(u, p),
      armL: [0.15, 0.35],
      armR: [0.15, 0.35],
      elbowL: 0.5,
      elbowR: 0.5,
      lean: 0.12,
      bodyY: 0.12 * stomp,
      headX: 0.1,
    };
  },
  laugh: (u, p) => {
    const shake = Math.sin(u * 14 + p * 7);
    return {
      ...base(u, p),
      // Holding the belly.
      armL: [-0.55, -0.15],
      armR: [-0.55, -0.15],
      elbowL: 1.2,
      elbowR: 1.2,
      lean: 0.22 + 0.06 * shake,
      headX: -0.18,
    };
  },
  dance: (u, p) => {
    const s = Math.sin(u * 6 + p * TAU);
    const bounce = Math.abs(s);
    const legs = crouch(0.18 * bounce);
    return {
      ...base(u, p),
      ...legs,
      armL: [-0.3, 1.0 + 0.9 * Math.max(0, s)],
      armR: [-0.3, 1.0 + 0.9 * Math.max(0, -s)],
      elbowL: 1.1 - 0.5 * Math.max(0, s),
      elbowR: 1.1 - 0.5 * Math.max(0, -s),
      twist: 0.3 * s,
      headZ: 0.12 * s,
    };
  },
  jump: (u, p) => {
    const k = (u * 1.4 + p) % 1;
    const up = Math.sin(k * Math.PI);
    // Knees bend to take off and to land; straight in the air.
    const legs = crouch(0.45 * (1 - up) ** 2);
    return {
      ...base(u, p),
      ...legs,
      bodyY: legs.bodyY + 1.5 * up,
      armL: [-0.2, 0.4 + 2 * up],
      armR: [-0.2, 0.4 + 2 * up],
      elbowL: 0.3,
      elbowR: 0.3,
    };
  },
  walk: (u, p) => ({ ...base(u, p), ...stride(u, p, 1.5, 0.55, 0.5, 0.75, 0.3) }),
  run: (u, p) => {
    const s = stride(u, p, 2.5, 0.95, 1.0, 1.5, 1.35);
    return { ...base(u, p), ...s, lean: 0.25, bodyY: s.bodyY * 2.2 };
  },
  sneak: (u, p) => {
    const s = stride(u, p, 0.9, 0.35, 0.15, 0.6, 0.9);
    const low = crouch(0.35);
    return {
      ...base(u, p),
      ...s,
      kneeL: s.kneeL + low.kneeL,
      kneeR: s.kneeR + low.kneeR,
      legL: s.legL + low.legL,
      legR: s.legR + low.legR,
      ankleL: low.ankleL,
      ankleR: low.ankleR,
      bodyY: low.bodyY,
      lean: 0.3,
      armL: [-0.55, 0.2],
      armR: [-0.55, 0.2],
    };
  },
  sit: (u, p) => ({ ...base(u, p), ...SIT }),
  sitTalk: (u, p) => {
    const g = Math.max(0, Math.sin(u * 2.3 + p * TAU));
    return {
      ...base(u, p),
      ...SIT,
      armR: [-0.55 - 0.3 * g, 0.15 + 0.15 * g],
      elbowR: 0.9 + 0.6 * g,
      headX: 0.05 * Math.sin(u * 6),
    };
  },
  sitSad: (u, p) => ({ ...base(u, p), ...SIT, headX: 0.35, lean: 0.15 }),
  lie: (u, p) => ({
    ...base(u, p),
    bodyX: -Math.PI / 2,
    armL: [0, 0.12],
    armR: [0, 0.12],
    headX: 0,
  }),
  sleep: (u, p) => ({
    ...base(u, p),
    bodyX: -Math.PI / 2,
    armL: [0, 0.1],
    armR: [0, 0.1],
    lean: 0.02 * breathe(u * 0.6, p),
  }),
  faint: (u, p) => {
    const k = Math.min(1, u / 0.45);
    return {
      ...base(u, p),
      bodyX: (-Math.PI / 2) * k * k,
      armL: [0, 0.3 + 0.6 * k],
      armR: [0, 0.3 + 0.6 * k],
      elbowL: 0.4 * k,
      elbowR: 0.4 * k,
    };
  },
};

/** How fast each pose moves the character forward (units per second). */
export const TRAVEL = { walk: 2.6, run: 5.5, sneak: 1.2 };

export const POSE_NAMES = Object.keys(POSES);

/** The joint angles of `name` at `u` seconds, for a character whose phase is `phase` (0-1). */
export function poseAt(name, u, phase) {
  return (POSES[name] ?? POSES.idle)(u, phase);
}
