// Poses: each is a function of `u` (seconds into the shot) and a per-character phase, giving joint angles.
// Angles in radians. Arms: x < 0 swings forward, z > 0 lifts outward. Legs: x < 0 swings forward.
// lean > 0 bends the upper body forward. bodyY lifts the whole figure (sitting, jumping).

const TAU = Math.PI * 2;
const breathe = (u, p) => Math.sin(u * 1.9 + p * TAU);

const base = (u, p) => ({
  lean: 0.015 * breathe(u, p),
  headX: 0.02 * Math.sin(u * 1.1 + p * 5),
  headY: 0.05 * Math.sin(u * 0.6 + p * 3),
  armL: [0.04 * breathe(u, p + 0.3), 0.06],
  armR: [0.04 * breathe(u, p + 0.6), 0.06],
  legL: 0,
  legR: 0,
});

/** Walking-style swing: legs and arms in opposite phase. */
function stride(u, p, hz, legSwing, armSwing) {
  const s = Math.sin(u * hz * TAU + p * TAU);
  return {
    legL: -s * legSwing,
    legR: s * legSwing,
    armL: [s * armSwing, 0.08],
    armR: [-s * armSwing, 0.08],
    bodyY: Math.abs(Math.cos(u * hz * TAU + p * TAU)) * 0.12,
  };
}

const SIT = { legL: -1.57, legR: -1.57, armL: [-0.55, 0.06], armR: [-0.55, 0.06] };

export const POSES = {
  idle: (u, p) => base(u, p),
  talk: (u, p) => {
    const g = Math.max(0, Math.sin(u * 2.3 + p * TAU));
    return {
      ...base(u, p),
      armR: [-0.35 - 0.55 * g, 0.12 + 0.2 * g],
      armL: [-0.1 - 0.25 * Math.max(0, Math.sin(u * 1.7 + p * 9)), 0.1],
      headX: 0.05 * Math.sin(u * 6 + p),
      headZ: 0.04 * Math.sin(u * 1.3 + p * 4),
    };
  },
  wave: (u, p) => ({ ...base(u, p), armR: [-0.2, 2.55 + 0.3 * Math.sin(u * 9)], headZ: 0.08 }),
  point: (u, p) => ({ ...base(u, p), armR: [-1.5, 0.12], lean: 0.05, headY: 0.1 }),
  cheer: (u, p) => {
    const b = Math.abs(Math.sin(u * 5 + p));
    return {
      ...base(u, p),
      armL: [-0.2, 2.6 + 0.25 * b],
      armR: [-0.2, 2.6 + 0.25 * b],
      bodyY: 0.35 * b,
    };
  },
  shrug: (u, p) => ({
    ...base(u, p),
    armL: [-0.45, 0.62],
    armR: [-0.45, 0.62],
    headZ: 0.22,
    bodyY: 0.05 * Math.abs(Math.sin(u * 3)),
  }),
  cry: (u, p) => ({
    ...base(u, p),
    armL: [-2.25, -0.32],
    armR: [-2.25, -0.32],
    headX: 0.3,
    lean: 0.12,
    tilt: 0.04 * Math.sin(u * 22 + p),
  }),
  scared: (u, p) => ({
    ...base(u, p),
    armL: [-1.25, 0.35],
    armR: [-1.25, 0.35],
    lean: -0.12,
    headX: -0.08,
    tilt: 0.025 * Math.sin(u * 30 + p * 9),
  }),
  think: (u, p) => ({
    ...base(u, p),
    armR: [-2.3, -0.38],
    armL: [-0.7, -0.3],
    headZ: 0.16,
    headY: 0.18,
  }),
  facepalm: (u, p) => ({ ...base(u, p), armR: [-2.55, -0.32], headX: 0.32, lean: 0.08 }),
  hug: (u, p) => ({ ...base(u, p), armL: [-1.45, -0.32], armR: [-1.45, -0.32], lean: 0.08 }),
  angry: (u, p) => {
    const stomp = Math.max(0, Math.sin(u * 7 + p * TAU));
    return {
      ...base(u, p),
      armL: [0.2, 0.42],
      armR: [0.2, 0.42],
      lean: 0.12,
      bodyY: 0.12 * stomp,
      headX: 0.1,
    };
  },
  laugh: (u, p) => {
    const shake = Math.sin(u * 14 + p * 7);
    return {
      ...base(u, p),
      armL: [-0.95, -0.25],
      armR: [-0.95, -0.25],
      lean: 0.22 + 0.06 * shake,
      headX: -0.18,
    };
  },
  dance: (u, p) => {
    const s = Math.sin(u * 6 + p * TAU);
    return {
      ...base(u, p),
      armL: [-0.3, 1.2 + 1.2 * Math.max(0, s)],
      armR: [-0.3, 1.2 + 1.2 * Math.max(0, -s)],
      twist: 0.3 * s,
      bodyY: 0.2 * Math.abs(s),
      headZ: 0.12 * s,
    };
  },
  jump: (u, p) => {
    const k = (u * 1.4 + p) % 1;
    const up = Math.sin(k * Math.PI);
    return {
      ...base(u, p),
      bodyY: 1.5 * up,
      armL: [-0.2, 0.4 + 2 * up],
      armR: [-0.2, 0.4 + 2 * up],
      legL: -0.2 * up,
      legR: 0.2 * up,
    };
  },
  walk: (u, p) => ({ ...base(u, p), ...stride(u, p, 1.5, 0.62, 0.55) }),
  run: (u, p) => {
    const s = stride(u, p, 2.5, 1.05, 1.15);
    return { ...base(u, p), ...s, lean: 0.25, bodyY: s.bodyY * 2.2 };
  },
  sneak: (u, p) => ({
    ...base(u, p),
    ...stride(u, p, 0.9, 0.4, 0.15),
    lean: 0.24,
    armL: [-0.7, 0.2],
    armR: [-0.7, 0.2],
  }),
  sit: (u, p) => ({ ...base(u, p), ...SIT }),
  sitTalk: (u, p) => {
    const g = Math.max(0, Math.sin(u * 2.3 + p * TAU));
    return {
      ...base(u, p),
      ...SIT,
      armR: [-0.7 - 0.6 * g, 0.15 + 0.2 * g],
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
