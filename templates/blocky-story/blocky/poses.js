// Poses: each is a function of `u` (seconds into the shot) and a per-character phase, giving joint angles.
// Angles in radians (each joint stops at its limit: JOINTS in characters.js).
// - Arms (`armL`, `armR`: [x, z]): x < 0 swings forward, z > 0 lifts outward. `elbowL/R` > 0 bends the forearm
//   forward, `wristL/R` tips the hand.
// - Legs (`legL`, `legR`): x < 0 swings forward. `kneeL/R` > 0 bends the shin back, `ankleL/R` tips the foot.
// - Body: `lean` > 0 bends forward at the waist, `twist` turns it, `tilt` leans sideways; `headX/Y/Z` turn the head
//   on its neck. `bodyY` lifts the whole figure (sitting, jumping); `bodyX` tips it (lying).
// Walking, running, sneaking and tiptoeing are gaits: the legs come from where the feet are (leg IK), so a foot on
// the ground stays put while the body goes over it. Sitting down and standing up keep the feet planted the same way.

const TAU = Math.PI * 2;
const breathe = (u, p) => Math.sin(u * 1.9 + p * TAU);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, k) => a + (b - a) * k;
const smoothstep = (k) => {
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};
const frac = (x) => x - Math.floor(x);

/** The leg of a size-1 figure (units): hip to knee, knee to ankle, the ankle over the floor, the hips. */
export const THIGH = 0.86;
export const SHIN = 0.8;
export const ANKLE_Y = 0.34;
export const HIP_Y = 2;
const LEG = THIGH + SHIN;

/**
 * Leg angles that put the ankle `z` forward and `y` up from the hip (below the hip, `y` is negative), the knee
 * bending back and the foot flat on the ground (`toe` > 0 lifts the heel).
 */
export function legIK(z, y, toe = 0) {
  const d = clamp(Math.hypot(z, y), 0.3, LEG - 1e-4);
  const toward = Math.atan2(z, -y);
  const atHip = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const atKnee = Math.acos(
    clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1),
  );
  const thigh = toward + atHip;
  const bend = Math.PI - atKnee;
  return { leg: -thigh, knee: bend, ankle: clamp(thigh - bend + toe, -0.8, 0.8) };
}

/** Where the ankle is from the hip, for leg angles (`legIK` the other way round): `{ z, y }`. */
export function legFK(leg, knee) {
  const thigh = -leg;
  const shin = thigh - knee;
  return {
    z: THIGH * Math.sin(thigh) + SHIN * Math.sin(shin),
    y: -THIGH * Math.cos(thigh) - SHIN * Math.cos(shin),
  };
}

/**
 * The gaits:
 * - `cycle`: how far the body goes in one cycle (two steps, units); `rate`: cycles per second;
 * - `stance`: the part of a cycle a foot is on the ground; `lift`: how high a foot swings; `reach`: how straight a
 *   leg is on the ground (1 = straight); `flight`: a run's hop; `toe` and `raise`: the heels up (tiptoe);
 * - the body: `lean`, the arms' swing (`arms`), `elbows`, the arms held `forward` and `out`.
 */
export const GAITS = {
  walk: {
    cycle: 2.0,
    rate: 1.5,
    stance: 0.62,
    lift: 0.3,
    reach: 0.975,
    lean: 0.05,
    arms: 0.45,
    elbows: 0.3,
  },
  run: {
    cycle: 3.8,
    rate: 2.2,
    stance: 0.38,
    lift: 0.75,
    reach: 0.93,
    flight: 0.2,
    lean: 0.24,
    arms: 0.95,
    elbows: 1.35,
  },
  sneak: {
    cycle: 1.5,
    rate: 0.85,
    stance: 0.72,
    lift: 0.4,
    reach: 0.82,
    lean: 0.3,
    arms: 0.12,
    elbows: 0.9,
    forward: -0.55,
  },
  tiptoe: {
    cycle: 1.2,
    rate: 1.5,
    stance: 0.6,
    lift: 0.3,
    reach: 0.97,
    toe: 0.5,
    raise: 0.16,
    lean: 0.04,
    arms: 0.1,
    elbows: 1.4,
    forward: -0.35,
    out: 0.5,
  },
};
export const GAIT_NAMES = Object.keys(GAITS);

/** How fast a gait goes, in units per second. */
export function speedOf(pace) {
  const g = GAITS[pace] ?? GAITS.walk;
  return g.cycle * g.rate;
}

/**
 * A gait at `phase` (in cycles: the distance walked divided by the cycle, so the feet don't slide). `scale`
 * shortens the steps (turning on the spot). The left foot lands at phase 0, the right one at 0.5.
 * @param {string} pace
 * @param {number} phase
 * @param {{ scale?: number }} [options]
 * @returns {Record<string, any>}
 */
export function gaitPose(pace, phase, { scale = 1 } = {}) {
  /** @type {Record<string, any>} */
  const gaits = GAITS;
  const g = gaits[pace] ?? GAITS.walk;
  const stride = g.stance * g.cycle * scale;
  const reach = g.reach * LEG;
  const feet = [0, 0.5].map((offset) => {
    const c = frac(phase + offset);
    if (c < g.stance) {
      const k = c / g.stance;
      // On the ground: it goes back under the body; the heel comes up at the end (toe-off).
      return { z: (0.5 - k) * stride, lift: 0, ground: true, toe: 0.45 * clamp((k - 0.78) / 0.22) };
    }
    const k = (c - g.stance) / (1 - g.stance);
    return {
      z: (smoothstep(k) - 0.5) * stride,
      lift: g.lift * scale * Math.sin(Math.PI * k),
      ground: false,
      toe: -0.18 * Math.sin(Math.PI * k),
    };
  });
  // The hips ride on the leg(s) on the ground: highest over the foot, lowest between steps.
  let hip = Number.POSITIVE_INFINITY;
  for (const foot of feet) {
    if (foot.ground) hip = Math.min(hip, Math.sqrt(reach * reach - foot.z * foot.z));
  }
  if (!Number.isFinite(hip)) {
    // A run's flight: both feet off the ground, a little hop.
    const edge = Math.sqrt(reach * reach - (stride / 2) ** 2);
    const c = frac(phase);
    const into = (c < 0.5 ? c - g.stance : c - 0.5 - g.stance) / (0.5 - g.stance);
    hip = edge + (g.flight ?? 0) * scale * Math.sin(Math.PI * clamp(into));
  }
  const raise = g.raise ?? 0;
  const pose = { bodyY: ANKLE_Y + raise + hip - HIP_Y };
  feet.forEach((foot, i) => {
    const side = i === 0 ? "L" : "R";
    const legs = legIK(foot.z, -(hip - foot.lift), foot.toe + (g.toe ?? 0));
    pose[`leg${side}`] = legs.leg;
    pose[`knee${side}`] = legs.knee;
    pose[`ankle${side}`] = legs.ankle;
  });
  // The arms swing against the legs: the right arm comes forward with the left foot.
  const swing = Math.cos(TAU * phase) * g.arms * Math.min(1, scale * 2);
  const forward = g.forward ?? 0;
  pose.armL = [forward + swing, 0.08 + (g.out ?? 0)];
  pose.armR = [forward - swing, 0.08 + (g.out ?? 0)];
  pose.elbowL = g.elbows;
  pose.elbowR = g.elbows;
  pose.lean = g.lean;
  pose.twist = 0.07 * Math.cos(TAU * phase) * scale;
  pose.tilt = 0.025 * Math.sin(TAU * phase) * scale;
  pose.headX = -0.5 * g.lean;
  return pose;
}

/** Two poses mixed: every joint `k` of the way from `a` to `b`. */
export function blendPoses(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xs = Array.isArray(x) ? x : [0, 0];
      const ys = Array.isArray(y) ? y : [0, 0];
      out[key] = xs.map((v, i) => mix(v, ys[i] ?? 0, k));
    } else {
      out[key] = mix(x ?? 0, y ?? 0, k);
    }
  }
  return out;
}

/** How far the hips go back from the planted feet to sit, for a size-1 figure (units). */
export const SEAT_REACH = THIGH;

/** How far back the hips are while sitting down (0 = over the feet, 1 = on the seat). */
export const seatBack = (k) => smoothstep((k - 0.08) / 0.72);

/**
 * Sitting down (`k` 0 to 1) on a seat that makes the body drop by `drop` (the sitting `bodyY`, negative): a lean
 * forward, the hips go back and down over the planted feet, then the back settles. The root goes back
 * `SEAT_REACH * seatBack(k)` (times the figure's size) meanwhile.
 */
export function sitDownPose(k, drop) {
  const back = seatBack(k);
  const down = smoothstep((k - 0.12) / 0.68);
  const settle = 0.05 * Math.sin(Math.PI * clamp((k - 0.78) / 0.22));
  const bodyY = drop * down - settle;
  const legs = legIK(SEAT_REACH * back, -(HIP_Y + bodyY - ANKLE_Y));
  const lean = 0.55 * Math.sin(Math.PI * clamp(k / 0.9));
  const reach = Math.sin(Math.PI * clamp((k - 0.1) / 0.75));
  const lap = smoothstep(k);
  return {
    bodyY,
    legL: legs.leg,
    legR: legs.leg,
    kneeL: legs.knee,
    kneeR: legs.knee,
    ankleL: legs.ankle,
    ankleR: legs.ankle,
    lean,
    headX: -0.45 * lean,
    armL: [mix(0.02, -0.5, lap) - 0.35 * reach, 0.08],
    armR: [mix(0.02, -0.5, lap) - 0.35 * reach, 0.08],
    elbowL: mix(0.12, 0.75, lap),
    elbowR: mix(0.12, 0.75, lap),
  };
}

/** How far back the hips are while standing up (1 = still on the seat). */
export const standBack = (k) => seatBack(1 - k);

/** Standing up (`k` 0 to 1): the weight goes forward over the feet first, then the legs push up and straighten. */
export function standUpPose(k, drop) {
  const pose = sitDownPose(1 - k, drop);
  const lean = 0.65 * Math.sin(Math.PI * clamp(k / 0.85)) ** 0.8;
  return { ...pose, lean, headX: -0.45 * lean };
}

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

/** The weight going from one leg to the other now and then, each character at their own rhythm. */
function weightShift(u, p) {
  const period = 5.5 + p * 3.5;
  const wave = Math.sin((u / period + p) * TAU);
  const s = Math.tanh(2.6 * wave) / Math.tanh(2.6);
  // The relaxed leg bends a little; its foot stays flat.
  const relaxed = (side) => {
    const k = Math.max(0, side * s);
    return { leg: -0.1 * k, knee: 0.22 * k, ankle: -0.12 * k };
  };
  const l = relaxed(1);
  const r = relaxed(-1);
  return {
    legL: l.leg,
    kneeL: l.knee,
    ankleL: l.ankle,
    legR: r.leg,
    kneeR: r.knee,
    ankleR: r.ankle,
    bodyY: -0.02 * Math.abs(s),
    tilt: 0.035 * s,
    headZ: -0.025 * s,
  };
}

/** Standing: breathing, a little head movement and the weight going from one leg to the other. */
const stand = (u, p) => ({ ...base(u, p), ...weightShift(u, p) });

/**
 * A gesture's strength around the moments in `times` (in the pose's time): it rises just before a moment, peaks
 * on it and falls away. `which` says which moment (to change hands).
 */
function cueAt(u, times = []) {
  let g = 0;
  let which = 0;
  times.forEach((at, i) => {
    const d = u - at;
    const value = d < 0 ? Math.exp(-((d / 0.16) ** 2)) : Math.exp(-((d / 0.42) ** 2));
    if (value > g) {
      g = value;
      which = i;
    }
  });
  return { g, which };
}

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
  idle: (u, p) => stand(u, p),
  // Talking: the hands move with the words, a gesture lands on each key word (`cue.beats`, one hand then the
  // other), and the head nods at the end of a sentence (`cue.nods`).
  talk: (u, p, cue) => {
    const beat = cueAt(u, cue?.beats);
    const nod = cueAt(u, cue?.nods).g;
    const right = beat.which % 2 === 0 ? beat.g : 0;
    const left = beat.which % 2 === 1 ? beat.g : 0;
    const g = 0.55 * Math.max(0, Math.sin(u * 2.3 + p * TAU)) + right;
    const h = 0.3 * Math.max(0, Math.sin(u * 1.7 + p * 9)) + left;
    return {
      ...stand(u, p),
      armR: [-0.3 - 0.45 * g, 0.12 + 0.22 * g],
      elbowR: 0.7 + 0.75 * g,
      wristR: -0.3 * g,
      armL: [-0.1 - 0.5 * h, 0.1 + 0.2 * h],
      elbowL: 0.35 + 0.8 * h,
      wristL: -0.25 * h,
      headX: 0.05 * Math.sin(u * 6 + p) + 0.1 * beat.g + 0.14 * nod,
      headZ: 0.04 * Math.sin(u * 1.3 + p * 4),
      lean: 0.03 * beat.g,
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
    ...stand(u, p),
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
  // Gaits on the spot: the engine moves the figure at the gait's speed (TRAVEL), so the feet stay planted.
  walk: (u, p) => ({ ...base(u, p), ...gaitPose("walk", u * GAITS.walk.rate + p) }),
  run: (u, p) => ({ ...base(u, p), ...gaitPose("run", u * GAITS.run.rate + p) }),
  sneak: (u, p) => ({ ...base(u, p), ...gaitPose("sneak", u * GAITS.sneak.rate + p) }),
  tiptoe: (u, p) => ({ ...base(u, p), ...gaitPose("tiptoe", u * GAITS.tiptoe.rate + p) }),
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

/** How fast each gait pose moves the character forward (units per second): its feet stay planted. */
export const TRAVEL = Object.fromEntries(GAIT_NAMES.map((name) => [name, speedOf(name)]));

export const POSE_NAMES = Object.keys(POSES);

/** Sitting and lying poses. */
export const isSitting = (pose) => typeof pose === "string" && pose.startsWith("sit");
export const isLying = (pose) => pose === "lie" || pose === "sleep";

/**
 * The joint angles of `name` at `u` seconds, for a character whose phase is `phase` (0-1). `cue`: moments for
 * gestures (`beats`, `nods`, in the same time as `u`).
 */
export function poseAt(name, u, phase, cue) {
  return (POSES[name] ?? POSES.idle)(u, phase, cue);
}
