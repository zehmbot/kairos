// Camera framing. A shot type says how much of the subject fills the frame; the camera distance is
// computed from the film's shape, so the same story frames well in vertical, wide or square films.
import * as THREE from "three";
import { clamp, easeInOut, easeOut, lerp, wobble } from "./util.js";

/** Shot types: vertical field of view (degrees), frame height and width around the subject (in units of
 * a 1-size character), and where the eyes sit above the frame center (fraction of frame height). */
export const SHOT_TYPES = {
  wide: null, // the place's establishing shot
  full: { fov: 42, height: 7.2, width: 5.0, eyes: 0.24 },
  medium: { fov: 38, height: 4.6, width: 4.6, eyes: 0.17 },
  close: { fov: 32, height: 2.5, width: 3.0, eyes: 0.1 },
  xclose: { fov: 28, height: 1.55, width: 1.8, eyes: 0.03 },
  ots: { fov: 34 },
  low: { fov: 44, height: 5.2, width: 3.6, eyes: 0.12 },
  high: { fov: 40, height: 5.6, width: 4.0, eyes: 0.2 },
  insert: { fov: 36 },
};
export const SHOT_NAMES = Object.keys(SHOT_TYPES);
export const MOVE_NAMES = ["hold", "push", "pull", "drift", "orbit", "rise", "zoom", "shake"];
export const ANGLES = {
  front: 0,
  left: 0.55,
  right: -0.55,
  side: 1.25,
  sideR: -1.25,
  back: Math.PI,
};

const up = new THREE.Vector3(0, 1, 0);

/** Horizontal half-angle of the view for a vertical fov and an aspect. */
const halfH = (fovDeg, aspect) =>
  Math.atan(Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * aspect);

/**
 * Where the camera is for this moment of the shot.
 * subjects: [{ head: Vector3, chest: Vector3, forward: Vector3, size }] (the first is the focus).
 * Returns { position, target, fov, focus, blur } (blur: whip motion blur 0-1).
 */
export function frameShot({ shot, subjects, place, aspect, u, seconds, index, object }) {
  const type =
    SHOT_TYPES[shot.shot] !== undefined ? shot.shot : subjects.length ? "medium" : "wide";
  const p = clamp(u / Math.max(seconds, 0.01));
  const k = easeInOut(p);
  const move = shot.move ?? (type === "wide" ? "drift" : "push");
  let position;
  let target;
  let fov;
  let cameraUp = up;

  if (type === "insert") {
    // A small object up close (it needs nobody in the shot), framed by its real size.
    fov = SHOT_TYPES.insert.fov;
    const radius = object?.radius ?? 1.2;
    target =
      object?.center.clone() ??
      new THREE.Vector3(...place.surface).add(new THREE.Vector3(0, 0.35, 0));
    const dist = Math.max(
      (radius * 1.25) / Math.tan(THREE.MathUtils.degToRad(fov) / 2),
      (radius * 1.25) / Math.tan(halfH(fov, aspect)),
    );
    const a = (index % 2 ? 0.35 : -0.35) + (ANGLES[shot.angle] ?? 0);
    const tall = object && object.height > object.radius * 1.2;
    const dir = new THREE.Vector3(Math.sin(a), tall ? 0.35 : 0.85, Math.cos(a)).normalize();
    position = target.clone().addScaledVector(dir, dist);
  } else if (type === "wide" || subjects.length === 0) {
    position = new THREE.Vector3(...place.wide.pos);
    target = new THREE.Vector3(...place.wide.target);
    fov = aspect < 1 ? 58 : 44;
    // A vertical frame sees less side to side: step back a little so the place still reads.
    if (aspect < 1) position.lerp(target, -0.25);
  } else if (type === "ots" && subjects.length > 1) {
    const [focus, other] = subjects;
    const toFocus = focus.head.clone().sub(other.head).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(toFocus, up).normalize();
    position = other.head
      .clone()
      .addScaledVector(toFocus, -2.6 * other.size)
      .addScaledVector(right, (index % 2 ? 1.4 : -1.4) * other.size)
      .add(new THREE.Vector3(0, 0.5 * other.size, 0));
    target = focus.head.clone().add(new THREE.Vector3(0, -0.35 * focus.size, 0));
    fov = SHOT_TYPES.ots.fov;
  } else {
    const spec = SHOT_TYPES[type === "ots" ? "close" : type];
    const focus = subjects[0];
    // Medium and wider shots frame everyone; closer shots frame the focus only.
    const framed = type === "close" || type === "xclose" ? [focus] : subjects;
    const size = Math.max(...framed.map((s) => s.size));
    const forward = framed.reduce((sum, s) => sum.add(s.forward), new THREE.Vector3()).setY(0);
    if (forward.lengthSq() < 0.01) forward.set(0, 0, 1);
    forward.normalize();
    const turn = ANGLES[shot.angle] ?? (index % 2 ? 0.32 : -0.32);
    // Someone lying down is filmed from the side of the bed, from above.
    const lying = framed.every((s) => s.lying);
    const dir = forward.clone().applyAxisAngle(up, turn);
    const center = framed
      .reduce((sum, s) => sum.add(s.head), new THREE.Vector3())
      .divideScalar(framed.length);
    // How wide the group is, seen from the camera.
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const offsets = framed.map((s) => s.head.clone().sub(center).dot(side));
    const span = Math.max(...offsets) - Math.min(...offsets);
    fov = spec.fov;
    const frameH = spec.height * size;
    const frameW = spec.width * size + span;
    const dist = Math.max(
      frameH / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2),
      frameW / 2 / Math.tan(halfH(fov, aspect)),
    );
    target = center.clone().add(new THREE.Vector3(0, -spec.eyes * frameH, 0));
    if (lying) {
      // From above the pillow, looking down, with the top of the head up in the picture.
      target = center.clone();
      position = target
        .clone()
        .add(new THREE.Vector3(0, dist * 0.95, 0))
        .addScaledVector(forward, dist * 0.3);
      cameraUp = forward.clone().negate();
    }
    const height = type === "low" ? -0.55 * dist : type === "high" ? 0.6 * dist : 0.06 * dist;
    if (!lying) {
      position = target
        .clone()
        .addScaledVector(dir, dist)
        .add(new THREE.Vector3(0, height, 0));
    }
    if (type === "low") target.y += 0.4 * size;
    position.y = Math.max(position.y, 0.6);
  }

  // Camera moves over the shot.
  const toTarget = target.clone().sub(position);
  const right = new THREE.Vector3().crossVectors(toTarget, up).normalize();
  switch (move) {
    case "push":
      position.lerp(target, lerp(0, 0.14, k));
      break;
    case "pull":
      position.lerp(target, lerp(0.14, -0.04, k));
      break;
    case "drift":
      position.addScaledVector(right, lerp(-1, 1, k) * toTarget.length() * 0.06);
      break;
    case "orbit": {
      const offset = position
        .clone()
        .sub(target)
        .applyAxisAngle(up, lerp(-0.22, 0.22, k));
      position = target.clone().add(offset);
      break;
    }
    case "rise":
      position.y += lerp(-0.6, 1.4, k);
      break;
    case "zoom":
      fov *= lerp(1, 0.68, easeOut(u / 0.3));
      break;
  }

  // Hand-held sway (always a little; a lot with "shake").
  const amount = move === "shake" ? 0.06 : 0.012;
  const speed = move === "shake" ? 9 : 1;
  const seed = index * 7.3;
  const dist = position.distanceTo(target);
  target = target
    .clone()
    .addScaledVector(right, wobble(u * speed, seed) * amount * dist)
    .add(new THREE.Vector3(0, wobble(u * speed, seed + 11) * amount * dist * 0.7, 0));

  // Whip: the shot starts with a fast swing into place, blurred sideways.
  let blur = 0;
  if (shot.whip) {
    const w = clamp(u / 0.24);
    if (w < 1) {
      const swing = (1 - easeOut(w)) * 0.55 * (index % 2 ? 1 : -1);
      target = position.clone().add(target.clone().sub(position).applyAxisAngle(up, swing));
      blur = 1 - easeOut(w);
    }
  }

  return {
    position,
    target,
    fov,
    up: cameraUp,
    focus: position.distanceTo(subjects[0]?.head ?? target),
    blur,
  };
}
