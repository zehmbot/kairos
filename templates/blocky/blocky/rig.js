// The figure's skeleton as numbers: where every joint is for a pose, without building the figure. characters.js
// builds the same jointed toy (the Moves sheet checks that both agree); this file lets the planner, the physics and
// the tests know where a fist, a hand or a head is at any moment, in Node as in the browser.
import * as THREE from "three";
import { JOINTS } from "./characters.js";

/** The rig of a size-1 figure (units), as characters.js builds it. */
export const RIG = {
  /** Hips and waist, above the body's origin. */
  hipY: 2,
  hipX: 0.5,
  thigh: 0.86,
  shin: 0.8,
  /** The neck, above the waist; the head's middle above the neck. */
  neckY: 2,
  head: 0.67,
  /** The shoulders, from the waist. */
  shoulderX: 1.5,
  shoulderY: 1.52,
  upperArm: 0.52,
  forearm: 0.55,
  /** From the wrist to the front of the fist, and to where a held thing sits. */
  fist: 0.36,
  hand: { y: -0.3, z: 0.42 },
};

/** A pose value by key ("armL.1" is the second number of armL). */
function poseValue(pose, key) {
  const [name, index] = key.split(".");
  const value = pose[name];
  if (index !== undefined) return Array.isArray(value) ? (value[Number(index)] ?? 0) : 0;
  return typeof value === "number" ? value : 0;
}

/** A joint's angles from a pose, kept within its ranges (as the figure does). */
function angles(pose, joint) {
  const spec = JOINTS[joint];
  return spec.keys.map((key, i) => {
    const [min, max] = spec.ranges[i];
    return Math.min(max, Math.max(min, poseValue(pose, key)));
  });
}

const euler = new THREE.Euler();
const step = (parent, x, y, z, rx = 0, ry = 0, rz = 0) =>
  parent
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(euler.set(rx, ry, rz)));

/**
 * Every joint's frame in the world for a pose. `root`: `{ x, y, z, rot, size }`, or `quaternion` (a
 * THREE.Quaternion) instead of `rot`. Returns THREE.Matrix4s: `root`, `body`, `pelvis` (the hips' middle, the waist's
 * pivot), `torso`, `neck`, `head` (its middle), and per side (`L` is the figure's left, +x): `shoulder`, `elbow`,
 * `wrist`, `fist`, `hip`, `knee`, `ankle`, `foot`; `hand` is where the right hand holds things.
 * @param {Record<string, any>} pose
 * @param {{ x?: number, y?: number, z?: number, rot?: number, size?: number, quaternion?: any }} root
 * @returns {Record<string, any>}
 */
export function rigFrames(pose, root) {
  const size = root.size ?? 1;
  const quaternion =
    root.quaternion ??
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), root.rot ?? 0);
  const rootMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(root.x ?? 0, root.y ?? 0, root.z ?? 0),
    quaternion,
    new THREE.Vector3(size, size, size),
  );
  const body = step(
    rootMatrix,
    0,
    pose.bodyY ?? 0,
    pose.bodyZ ?? 0,
    pose.bodyX ?? 0,
    0,
    pose.bodyZr ?? 0,
  );
  const [lean, twist, tilt] = angles(pose, "waist");
  const torso = step(body, 0, RIG.hipY, 0, lean, twist, tilt);
  const [hx, hy, hz] = angles(pose, "neck");
  const neck = step(torso, 0, RIG.neckY, 0, hx, hy, hz);
  const frames = {
    root: rootMatrix,
    body,
    pelvis: step(body, 0, RIG.hipY, 0),
    torso,
    neck,
    head: step(neck, 0, RIG.head, 0),
  };
  for (const [side, s] of [
    ["L", 1],
    ["R", -1],
  ]) {
    const [ax, az] = angles(pose, `shoulder${side}`);
    const shoulder = step(torso, s * RIG.shoulderX, RIG.shoulderY, 0, ax, 0, s * az);
    const [e] = angles(pose, `elbow${side}`);
    const elbow = step(shoulder, 0, -RIG.upperArm, 0, -e);
    const [w] = angles(pose, `wrist${side}`);
    const wrist = step(elbow, 0, -RIG.forearm, 0, -w);
    const [lx, lz] = angles(pose, `hip${side}`);
    const hip = step(body, s * RIG.hipX, RIG.hipY, 0, lx, 0, s * lz);
    const [k] = angles(pose, `knee${side}`);
    const knee = step(hip, 0, -RIG.thigh, 0, k);
    const [a] = angles(pose, `ankle${side}`);
    const ankle = step(knee, 0, -RIG.shin, 0, a);
    Object.assign(frames, {
      [`shoulder${side}`]: shoulder,
      [`elbow${side}`]: elbow,
      [`wrist${side}`]: wrist,
      [`fist${side}`]: step(wrist, 0, -RIG.fist, 0),
      [`hip${side}`]: hip,
      [`knee${side}`]: knee,
      [`ankle${side}`]: ankle,
      [`foot${side}`]: step(ankle, 0, -0.17, 0.04),
    });
    if (side === "R") frames.hand = step(wrist, 0, RIG.hand.y, RIG.hand.z);
  }
  return frames;
}

/** Where a frame is in the world. */
export const framePoint = (frame) => new THREE.Vector3().setFromMatrixPosition(frame);

/**
 * The pose with one arm (`side` "L" or "R") aimed so its fist reaches `target` (a world point), or as close as the
 * arm reaches: the elbow bends to fit the distance, the shoulder turns the arm toward it. The rest of the pose stays.
 */
export function aimArm(pose, root, side, target) {
  const s = side === "L" ? 1 : -1;
  const frames = rigFrames(pose, root);
  // The target in the torso's own frame, from the shoulder (in a size-1 figure's units).
  const local = target.clone().applyMatrix4(frames.torso.clone().invert());
  local.x -= s * RIG.shoulderX;
  local.y -= RIG.shoulderY;
  const upper = RIG.upperArm;
  const lower = RIG.forearm + RIG.fist;
  const reach = upper + lower;
  const d = Math.min(Math.max(local.length(), Math.abs(upper - lower) + 1e-3), reach - 1e-4);
  const [minE, maxE] = JOINTS[`elbow${side}`].ranges[0];
  const bend = Math.min(
    maxE,
    Math.max(
      minE,
      Math.acos(
        Math.min(1, Math.max(-1, (d * d - upper * upper - lower * lower) / (2 * upper * lower))),
      ),
    ),
  );
  // Where the fist points from the shoulder in the upper arm's frame (the forearm bends toward +z).
  const wy = -upper - lower * Math.cos(bend);
  const wz = lower * Math.sin(bend);
  const wLength = Math.hypot(wy, wz);
  const v = local.clone().normalize();
  const ny = wy / wLength;
  const nz = wz / wLength;
  // Rotation x then z (Euler XYZ): Rx(a)·Rz(b)·(0, ny, nz) = v.
  const b = Math.asin(Math.min(1, Math.max(-1, -v.x / ny)));
  const c = ny * Math.cos(b);
  const a = Math.atan2(v.z, v.y) - Math.atan2(nz, c);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  return {
    ...pose,
    [`arm${side}`]: [wrap(a), s * b],
    [`elbow${side}`]: bend,
    [`wrist${side}`]: 0,
  };
}

// ---------- Frames: the figure as joint rotations ----------
// A figure can also be set by rotations instead of angles: where the hips are (`pelvis`: position and
// rotation in the world) and each joint's rotation in its parent. Falling bodies (the physics) give these, poses
// give these, and the two blend (getting up from wherever the fall left someone).

const JOINT_PARTS = [
  ["torso", "pelvis", "chest"],
  ["neck", "chest", "head"],
  ["shoulderL", "chest", "armL"],
  ["elbowL", "armL", "foreL"],
  ["shoulderR", "chest", "armR"],
  ["elbowR", "armR", "foreR"],
  ["hipL", "pelvis", "thighL"],
  ["kneeL", "thighL", "shinL"],
  ["hipR", "pelvis", "thighR"],
  ["kneeR", "thighR", "shinR"],
];
const STILL = ["wristL", "wristR", "ankleL", "ankleR"];

const quat = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

/** A pose as frames: `{ pelvis: { position, quaternion }, joints: { torso, neck, ... } }`. */
export function poseFrames(pose, root) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  rigFrames(pose, root).pelvis.decompose(position, quaternion, new THREE.Vector3());
  const [lean, twist, tilt] = angles(pose, "waist");
  const [hx, hy, hz] = angles(pose, "neck");
  const joints = { torso: quat(lean, twist, tilt), neck: quat(hx, hy, hz) };
  for (const [side, s] of [
    ["L", 1],
    ["R", -1],
  ]) {
    const [ax, az] = angles(pose, `shoulder${side}`);
    const [lx, lz] = angles(pose, `hip${side}`);
    joints[`shoulder${side}`] = quat(ax, 0, s * az);
    joints[`elbow${side}`] = quat(-angles(pose, `elbow${side}`)[0], 0, 0);
    joints[`wrist${side}`] = quat(-angles(pose, `wrist${side}`)[0], 0, 0);
    joints[`hip${side}`] = quat(lx, 0, s * lz);
    joints[`knee${side}`] = quat(angles(pose, `knee${side}`)[0], 0, 0);
    joints[`ankle${side}`] = quat(angles(pose, `ankle${side}`)[0], 0, 0);
  }
  return { pelvis: { position, quaternion }, joints };
}

/** A falling body's parts (`name -> { position, quaternion }` in the world) as frames. */
export function partFrames(parts) {
  const joints = {};
  for (const [joint, parent, child] of JOINT_PARTS) {
    joints[joint] = parts[parent].quaternion.clone().invert().multiply(parts[child].quaternion);
  }
  for (const joint of STILL) joints[joint] = new THREE.Quaternion();
  return {
    pelvis: {
      position: parts.pelvis.position.clone(),
      quaternion: parts.pelvis.quaternion.clone(),
    },
    joints,
  };
}

/** Two sets of frames blended: `k` of the way from `a` to `b`. */
export function blendFrames(a, b, k) {
  const joints = {};
  for (const name of Object.keys(b.joints)) {
    joints[name] = (a.joints[name] ?? new THREE.Quaternion()).clone().slerp(b.joints[name], k);
  }
  return {
    pelvis: {
      position: a.pelvis.position.clone().lerp(b.pelvis.position, k),
      quaternion: a.pelvis.quaternion.clone().slerp(b.pelvis.quaternion, k),
    },
    joints,
  };
}
