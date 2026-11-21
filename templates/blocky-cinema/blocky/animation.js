// The animation layer, on top of the poses: what the body does for any moment of a move or an action. Leaning into
// speed changes, jumping (crouch, take-off, tuck, landing), the punch in its stages, staggering and getting up,
// reaching, carrying and throwing, flinching, and the body side of feelings. Everything is a pure function of time;
// springs are written out (a damped wave from the moment that set them off), so any frame stands on its own.
import { blendPoses, gaitPose } from "./poses.js";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (k) => {
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};
/** A spring let go at u = 0: a damped wave that starts at 1 (or at 0 with `fromRest`). */
export const spring = (u, hz = 2.2, decay = 5, fromRest = false) =>
  u < 0
    ? fromRest
      ? 0
      : 1
    : Math.exp(-decay * u) *
      (fromRest ? Math.sin(Math.PI * 2 * hz * u) : Math.cos(Math.PI * 2 * hz * u));
/** Rises over `rise`, holds, falls over `fall` (seconds since it started). */
const envelope = (u, rise, hold, fall) =>
  u < 0
    ? 0
    : u < rise
      ? smoothstep(u / rise)
      : u < rise + hold
        ? 1
        : 1 - smoothstep((u - rise - hold) / fall);

/** Adds `extra` joint angles onto `pose` (`k` of them): additive layers. */
export function addPose(pose, extra, k = 1) {
  if (k <= 0) return pose;
  const out = { ...pose };
  for (const [key, value] of Object.entries(extra)) {
    if (Array.isArray(value)) {
      const base = Array.isArray(out[key]) ? out[key] : [0, 0];
      out[key] = base.map((v, i) => v + (value[i] ?? 0) * k);
    } else out[key] = (out[key] ?? 0) + value * k;
  }
  return out;
}

/** Both knees bent with the feet flat: thighs forward `a`, the body down to keep the feet on the floor. */
function crouch(a) {
  return {
    legL: -a,
    legR: -a,
    kneeL: 2 * a,
    kneeR: 2 * a,
    ankleL: a,
    ankleR: a,
    bodyY: -1.66 * (1 - Math.cos(a)),
  };
}

// ---------- Moving ----------

/**
 * A gait with its body mechanics: leaning into speeding up and back when stopping (`accel`, in top speeds per
 * second), the head kept level against the lean.
 */
export function gaitWithWeight(pace, phase, accel = 0) {
  const pose = gaitPose(pace, phase);
  const lean = clamp(0.16 * accel, -0.2, 0.22);
  pose.lean = (pose.lean ?? 0) + lean;
  pose.headX = (pose.headX ?? 0) - 0.7 * lean;
  return pose;
}

/** The settle after stopping: the body sways forward and back a little (seconds since arriving). */
export const arrivalSway = (u) => ({
  lean: 0.07 * spring(u, 1.6, 4.5, true),
  headX: -0.04 * spring(u, 1.6, 4.5, true),
});

/**
 * A jump on top of a gait (`jump`: `before` take-off, `after` landing, `air` time, `k` through the air): the crouch
 * before, the push off, the knees tucked over the top, the legs reaching down, and the landing taken in the knees.
 */
export function jumpPose(gait, jump) {
  if (!jump) return gait;
  if (jump.before > 0) {
    // Gathering for the take-off.
    const k = clamp(1 - jump.before / 0.16);
    if (k <= 0) return gait;
    return blendPoses(
      gait,
      {
        ...crouch(0.55),
        lean: 0.42,
        headX: -0.3,
        armL: [0.7, 0.18],
        armR: [0.7, 0.18],
        elbowL: 0.5,
        elbowR: 0.5,
      },
      smoothstep(k),
    );
  }
  if (jump.after < 0) {
    const k = jump.k;
    // Pushing off, then tucked, then the legs reach for the floor.
    const push = {
      legL: -0.5,
      legR: 0.45,
      kneeL: 0.9,
      kneeR: 0.35,
      ankleL: 0.2,
      ankleR: -0.4,
      lean: 0.3,
      armL: [-1.9, 0.3],
      armR: [-1.2, 0.3],
      elbowL: 0.6,
      elbowR: 0.8,
      headX: -0.2,
    };
    const tuck = {
      legL: -1.45,
      legR: -1.1,
      kneeL: 2.1,
      kneeR: 1.8,
      ankleL: 0.4,
      ankleR: 0.3,
      lean: 0.22,
      armL: [-2.1, 0.45],
      armR: [-1.8, 0.4],
      elbowL: 0.45,
      elbowR: 0.5,
      headX: -0.15,
    };
    const reach = {
      legL: -0.55,
      legR: -0.3,
      kneeL: 0.5,
      kneeR: 0.4,
      ankleL: 0.1,
      ankleR: 0.1,
      lean: 0.15,
      armL: [-1.4, 0.5],
      armR: [-1.2, 0.5],
      elbowL: 0.4,
      elbowR: 0.4,
      headX: -0.05,
    };
    if (k < 0.3) return blendPoses(push, tuck, smoothstep(k / 0.3));
    if (k < 0.72) return tuck;
    return blendPoses(tuck, reach, smoothstep((k - 0.72) / 0.28));
  }
  // Landing: the knees take the weight, then the run goes on.
  const u = jump.after;
  if (u > 0.34) return gait;
  const depth = 0.75 * Math.sin(Math.PI * clamp(u / 0.34) ** 0.6);
  const land = {
    ...crouch(depth),
    lean: 0.35 * depth + 0.1,
    headX: -0.25 * depth,
    armL: [-0.9, 0.35],
    armR: [-0.7, 0.35],
    elbowL: 0.5,
    elbowR: 0.5,
  };
  return blendPoses(land, gait, smoothstep((u - 0.12) / 0.22));
}

// ---------- Punching and being hit ----------

/** A fighting stance: lead foot forward, knees soft, fists up. */
const GUARD = {
  legL: -0.28,
  legR: 0.22,
  kneeL: 0.3,
  kneeR: 0.3,
  ankleL: 0.15,
  ankleR: 0.1,
  bodyY: -0.08,
  lean: 0.08,
  armL: [-1.25, 0.22],
  armR: [-0.95, 0.3],
  elbowL: 2.1,
  elbowR: 2.25,
};

/**
 * A punch (`act` from motion.js: `phase` windUp | drive | follow | recover, `k` through it), as an
 * anticipation, the body turning, the weight going forward, the arm speeding up to the contact, following through
 * and recovering. Returns the pose and `aim`: how much the punching arm reaches for the target (0 to 1).
 */
export function punchPose(act, idle) {
  const side = act.side ?? "R";
  const s = side === "R" ? 1 : -1;
  const arm = `arm${side}`;
  const elbow = `elbow${side}`;
  // Anticipation: turned away, weight back, the fist pulled back.
  const windUp = {
    ...GUARD,
    twist: -0.42 * s,
    lean: -0.08,
    tilt: 0.06 * s,
    headY: 0.3 * s,
    legR: 0.32,
    kneeR: 0.45,
    [arm]: [0.35, 0.3],
    [elbow]: 2.3,
  };
  // The drive: hips and chest turn through, the weight goes onto the front foot.
  const drive = {
    ...GUARD,
    twist: 0.5 * s,
    lean: 0.28,
    tilt: -0.05 * s,
    headY: -0.3 * s,
    legL: -0.35,
    legR: 0.5,
    kneeL: 0.42,
    kneeR: 0.12,
    ankleR: -0.35,
  };
  if (act.phase === "windUp") {
    return {
      pose: blendPoses(blendPoses(idle, GUARD, smoothstep(act.k * 2)), windUp, smoothstep(act.k)),
      aim: 0,
    };
  }
  if (act.phase === "drive") {
    // The arm speeds up: slow from the shoulder, fast at the end.
    const k = act.k;
    return { pose: blendPoses(windUp, drive, smoothstep(k)), aim: k ** 1.6 };
  }
  if (act.phase === "follow") {
    const over = { ...drive, twist: 0.62 * s, lean: 0.34 };
    return { pose: blendPoses(drive, over, smoothstep(act.k)), aim: 1 - 0.35 * act.k };
  }
  // Recovery: back to standing.
  return {
    pose: blendPoses({ ...drive, twist: 0.62 * s, lean: 0.34 }, idle, smoothstep(act.k)),
    aim: 0.65 * (1 - smoothstep(act.k * 1.6)),
  };
}

/**
 * Taking a light hit (`act.since` seconds after the contact, along `act.dir`): the head snaps back and springs,
 * the body leans back, the arms fly out, then it steadies.
 */
export function hitPose(act, idle) {
  const u = act.since;
  const snap = spring(u, 1.8, 4.2);
  const fling = envelope(u, 0.06, 0.12, 0.5);
  const shove = {
    headX: -0.55 * snap,
    headZ: 0.12 * snap,
    lean: -0.38 * envelope(u, 0.05, 0.08, 0.55),
    armL: [0.35, 0.75],
    armR: [0.25, 0.7],
    elbowL: 0.5,
    elbowR: 0.6,
    legL: -0.35 * fling,
    kneeL: 0.3 * fling,
  };
  return addPose(idle, shove, Math.max(fling, Math.abs(snap) * 0.6));
}

/** Falling without physics (a fallback): tipping backward onto the floor, then lying. */
export function fallPose(k) {
  const e = smoothstep(k);
  return {
    bodyX: -1.5708 * e,
    bodyY: 0.5 * e,
    armL: [0.4 * e - 0.6 * Math.sin(Math.PI * k), 0.9 * e],
    armR: [0.4 * e - 0.6 * Math.sin(Math.PI * k), 0.9 * e],
    legL: -0.3 * Math.sin(Math.PI * k),
    legR: -0.15 * Math.sin(Math.PI * k),
    kneeL: 0.4 * Math.sin(Math.PI * k),
    headX: 0.4 * Math.sin(Math.PI * k),
  };
}

/**
 * Getting up from lying on the back (`k` 0 to 1), standing at the end where the root is. The hips' path is set
 * (`hipY`, `hipZ`, the body's tip `bodyX`), and the body follows it: rolling up to sit, a hand pushing on the floor,
 * a squat with the feet under the hips, and standing up tired.
 */
export function getUpPose(k) {
  const keys = [
    // Lying on the back.
    {
      at: 0,
      hipY: 0.5,
      hipZ: -2,
      bodyX: -1.5708,
      lean: 0,
      legs: -0.1,
      knees: 0.15,
      arms: [0.3, 0.8],
      elbows: 0.3,
      headX: 0.1,
    },
    // Sitting up, hands behind on the floor.
    {
      at: 0.3,
      hipY: 0.3,
      hipZ: -1.9,
      bodyX: 0,
      lean: 0.55,
      legs: -1.45,
      knees: 0.6,
      arms: [0.75, 0.35],
      elbows: 0.15,
      headX: -0.1,
    },
    // A squat, the feet planted under the hips, hands pushing on the knees.
    {
      at: 0.65,
      hipY: 1.1,
      hipZ: -0.55,
      bodyX: 0,
      lean: 0.75,
      legs: -1.6,
      knees: 2.3,
      arms: [-0.9, 0.2],
      elbows: 0.5,
      headX: -0.35,
    },
    // Standing, still bent a little.
    {
      at: 1,
      hipY: 2,
      hipZ: 0,
      bodyX: 0,
      lean: 0.12,
      legs: 0,
      knees: 0,
      arms: [0.05, 0.08],
      elbows: 0.2,
      headX: 0.15,
    },
  ];
  let a = keys[0];
  let b = keys[1];
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i].at) {
      a = keys[i - 1];
      b = keys[i];
      break;
    }
    a = keys[i - 1];
    b = keys[i];
  }
  const e = smoothstep((k - a.at) / (b.at - a.at));
  const mix = (x, y) => x + (y - x) * e;
  const bodyX = mix(a.bodyX, b.bodyX);
  const hipY = mix(a.hipY, b.hipY);
  const hipZ = mix(a.hipZ, b.hipZ);
  const legs = mix(a.legs, b.legs);
  const knees = mix(a.knees, b.knees);
  return {
    bodyX,
    // The body hangs from its feet: put it where the hips should be.
    bodyY: hipY - 2 * Math.cos(bodyX),
    bodyZ: hipZ - 2 * Math.sin(bodyX),
    lean: mix(a.lean, b.lean),
    legL: legs,
    legR: legs * 0.92,
    kneeL: knees,
    kneeR: knees * 0.95,
    ankleL: clamp(-legs - knees, -0.8, 0.8),
    ankleR: clamp(-legs * 0.92 - knees * 0.95, -0.8, 0.8),
    armL: [mix(a.arms[0], b.arms[0]), mix(a.arms[1], b.arms[1])],
    armR: [mix(a.arms[0], b.arms[0]), mix(a.arms[1], b.arms[1])],
    elbowL: mix(a.elbows, b.elbows),
    elbowR: mix(a.elbows, b.elbows),
    headX: mix(a.headX, b.headX),
  };
}

// ---------- Things in hand ----------

/** Holding something in the right hand in front of the chest. */
export const CARRY = { armR: [-1.05, 0.22], elbowR: 1.35, wristR: 0.2 };

/**
 * Picking something up (`act.phase` reach | lift): bending (and crouching for things low down) while the hand
 * reaches for it, then lifting it to the chest. `low` is how far below the waist the thing is (0 to 1). Returns the
 * pose and `aim`: how much the right hand goes to the thing.
 */
export function pickUpPose(act, idle, low = 0.5) {
  const bend = {
    ...crouch(0.6 * low),
    lean: 0.35 + 0.55 * low,
    headX: -0.25,
    armL: [-0.6, 0.25],
    elbowL: 0.6,
  };
  if (act.phase === "reach") {
    return {
      pose: blendPoses(idle, bend, smoothstep(act.k * 1.2)),
      aim: smoothstep((act.k - 0.15) / 0.85),
    };
  }
  return {
    pose: blendPoses(bend, { ...idle, ...CARRY }, smoothstep(act.k)),
    aim: 1 - smoothstep(act.k),
  };
}

/** Throwing (`act.phase` windUp | follow): the arm back and up, the body turned away, then all of it forward. */
export function throwPose(act, idle) {
  const back = {
    twist: -0.45,
    lean: -0.12,
    legL: -0.3,
    legR: 0.25,
    kneeL: 0.25,
    kneeR: 0.35,
    armR: [-2.6, 0.55],
    elbowR: 1.7,
    armL: [-1.0, 0.3],
    elbowL: 0.4,
    headY: 0.25,
  };
  const through = {
    twist: 0.5,
    lean: 0.35,
    legL: -0.4,
    legR: 0.45,
    kneeL: 0.4,
    kneeR: 0.1,
    armR: [-1.1, 0.1],
    elbowR: 0.15,
    armL: [0.3, 0.3],
    elbowL: 0.5,
    headY: -0.15,
  };
  if (act.phase === "windUp") {
    // Back and up, then the arm whips through: the hand lets go out in front, at the end of the wind-up.
    if (act.k < 0.62) return blendPoses({ ...idle, ...CARRY }, back, smoothstep(act.k / 0.62));
    const k = (act.k - 0.62) / 0.38;
    return blendPoses(back, through, k * k);
  }
  // Following through, then back to standing.
  const over = { ...through, armR: [-0.6, 0.05], lean: 0.42, twist: 0.6 };
  if (act.k < 0.3) return blendPoses(through, over, smoothstep(act.k / 0.3));
  return blendPoses(over, idle, smoothstep((act.k - 0.3) / 0.7));
}

/** Flinching from something flying at you (seconds since it hit): arms up over the face, the head ducking. */
export function flinch(pose, u) {
  const k = envelope(u, 0.07, 0.32, 0.45);
  if (k <= 0) return pose;
  return blendPoses(
    pose,
    {
      ...pose,
      armL: [-2.25, 0.35],
      armR: [-2.15, 0.35],
      elbowL: 2.1,
      elbowR: 2.15,
      lean: 0.12,
      headX: 0.35,
      twist: 0.15,
    },
    k,
  );
}

// ---------- Feelings ----------

/** The body side of each feeling: what changes in the body, held at 60% once the first wave has passed. */
const REACTIONS = {
  surprise: {
    lean: -0.16,
    headX: -0.18,
    armL: [-0.35, 0.45],
    armR: [-0.35, 0.45],
    elbowL: 0.6,
    elbowR: 0.6,
  },
  fear: {
    lean: 0.12,
    headX: 0.22,
    armL: [-0.7, -0.05],
    armR: [-0.7, -0.05],
    elbowL: 1.6,
    elbowR: 1.6,
    kneeL: 0.18,
    kneeR: 0.18,
  },
  anger: {
    lean: 0.16,
    headX: 0.12,
    armL: [-0.25, 0.3],
    armR: [-0.25, 0.3],
    elbowL: 1.3,
    elbowR: 1.3,
  },
  happy: { lean: -0.06, headX: -0.08, armL: [0, 0.22], armR: [0, 0.22] },
  sad: { lean: 0.22, headX: 0.32, armL: [0.05, -0.04], armR: [0.05, -0.04], tilt: 0.04 },
  pain: { lean: 0.3, headX: 0.2, armR: [-2.5, 0.35], elbowR: 2.35, headZ: 0.12 },
  confusion: { headZ: 0.24, headY: 0.12, armR: [-2.7, 0.5], elbowR: 2.25 },
  tired: {
    lean: 0.28,
    headX: 0.3,
    armL: [0.06, -0.02],
    armR: [0.06, -0.02],
    kneeL: 0.14,
    kneeR: 0.14,
    bodyY: -0.06,
  },
};

/** Which feeling a face shows (faces.js expressions). */
export const FEELING_OF = {
  shocked: "surprise",
  scared: "fear",
  angry: "anger",
  furious: "anger",
  suspicious: "anger",
  happy: "happy",
  grin: "happy",
  laugh: "happy",
  love: "happy",
  sad: "sad",
  crying: "sad",
  pain: "pain",
  dizzy: "pain",
  confused: "confusion",
  thinking: "confusion",
  tired: "tired",
  sleepy: "tired",
};

/**
 * The body's reaction to a feeling the face shows (`since`: seconds since the face changed to it): a first wave
 * (with a little overshoot), then held. `busy` (walking, acting) keeps only the chest and head.
 */
export function reaction(pose, expression, since, busy = false) {
  const feeling = FEELING_OF[expression];
  const layer = feeling && REACTIONS[feeling];
  if (!layer) return pose;
  const k = smoothstep(since / 0.18) * (0.6 + 0.4 * (1 - smoothstep((since - 0.25) / 0.5)));
  if (!busy) return addPose(pose, layer, k);
  const upper = Object.fromEntries(
    Object.entries(layer).filter(([key]) =>
      ["lean", "headX", "headY", "headZ", "tilt"].includes(key),
    ),
  );
  return addPose(pose, upper, k);
}
