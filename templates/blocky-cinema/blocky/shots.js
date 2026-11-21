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
export const MOVE_NAMES = [
  "hold",
  "push",
  "pull",
  "drift",
  "orbit",
  "rise",
  "zoom",
  "shake",
  "follow",
  "pan",
];
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
 * Which way the camera films people from: a flat unit vector `{ x, z }` from them toward the camera, and the
 * `forward` it starts from. Along the way they face; from the side when they face each other (on the open side of
 * the place, where its wide shot stands); then turned by `turn`. `people`: `[{ x, z, fx, fz }]`, where each one is
 * and which way they face. frameShot and the walks (motion.js: where "off-left" is) both use it.
 */
export function cameraSide(people, wide, turn = 0) {
  let fx = 0;
  let fz = 0;
  for (const p of people) {
    fx += p.fx;
    fz += p.fz;
  }
  if (people.length > 1 && Math.hypot(fx, fz) < 0.5 * people.length) {
    const a = people[0];
    const b = people.at(-1);
    let ax = -(b.z - a.z);
    let az = b.x - a.x;
    const ox = wide[0] - (a.x + b.x) / 2;
    const oz = wide[2] - (a.z + b.z) / 2;
    if (ax * ox + az * oz < 0) {
      ax = -ax;
      az = -az;
    }
    if (ax * ax + az * az > 1e-6) {
      fx = ax;
      fz = az;
    }
  }
  let length = Math.hypot(fx, fz);
  if (length < 0.1) {
    fx = 0;
    fz = 1;
    length = 1;
  }
  fx /= length;
  fz /= length;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return { x: fx * c + fz * s, z: -fx * s + fz * c, forward: { x: fx, z: fz } };
}

/**
 * Is the view from `position` to `target` blocked by someone in `others` (`[{ head, size }]`): their head or chest
 * close to the line between the camera and what it looks at?
 */
export function viewBlocked(position, target, others) {
  const line = target.clone().sub(position);
  const length = line.length();
  if (length < 1e-6) return false;
  line.divideScalar(length);
  return others.some((other) =>
    [0, -1.6].some((down) => {
      const point = other.head.clone().add(new THREE.Vector3(0, down * other.size, 0));
      const along = point.clone().sub(position).dot(line);
      if (along < length * 0.04 || along > length * 0.96) return false;
      const closest = position.clone().addScaledVector(line, along);
      return closest.distanceTo(point) < 1.3 * other.size;
    }),
  );
}

/**
 * Where the camera is for this moment of the shot.
 * subjects: [{ head: Vector3, chest: Vector3, forward: Vector3, size }] (the first is the focus).
 * `extraTurn` turns the camera around the subject and `extraRise` raises it (a fraction of its distance), to see
 * past someone or something in the way.
 * Returns { position, target, fov, focus, blur } (blur: whip motion blur 0-1).
 */
export function frameShot({
  shot,
  subjects,
  place,
  aspect,
  u,
  seconds,
  index,
  object,
  extraTurn = 0,
  extraRise = 0,
}) {
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
    const turn = (ANGLES[shot.angle] ?? (index % 2 ? 0.32 : -0.32)) + extraTurn;
    const facing = cameraSide(
      framed.map((s) => ({ x: s.head.x, z: s.head.z, fx: s.forward.x, fz: s.forward.z })),
      place.wide.pos,
      turn,
    );
    const forward = new THREE.Vector3(facing.forward.x, 0, facing.forward.z);
    // Someone lying down is filmed from the side of the bed, from above.
    const lying = framed.every((s) => s.lying);
    const dir = new THREE.Vector3(facing.x, 0, facing.z);
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
    const fit = Math.max(
      frameH / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2),
      frameW / 2 / Math.tan(halfH(fov, aspect)),
    );
    // People standing at different depths (one on the sofa, one in front of it): the camera steps back so the
    // nearest one is as far as the framing wants, instead of the camera ending up in them.
    const depth = Math.max(0, ...framed.map((s) => s.head.clone().sub(center).dot(dir)));
    const dist = fit + depth;
    target = center.clone().add(new THREE.Vector3(0, -spec.eyes * frameH, 0));
    // A group with people sitting and standing: the highest head stays in the picture (even after a push in).
    if (framed.length > 1) {
      const highest = Math.max(...framed.map((s) => s.head.y + 1.2 * s.size));
      const top = target.y + (frameH / 2) * 0.86;
      if (highest > top) target.y += highest - top;
    }
    if (lying) {
      // From above the pillow, looking down, with the top of the head up in the picture.
      target = center.clone();
      position = target
        .clone()
        .add(new THREE.Vector3(0, dist * 0.95, 0))
        .addScaledVector(forward, dist * 0.3);
      cameraUp = forward.clone().negate();
    }
    // A tall picture that is wider than the full shot needs (its width sets the distance): the feet go near the
    // bottom, so the extra room is above the heads, not an empty floor under them.
    const seen = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    if (aspect < 1 && type === "full" && !lying && seen > frameH * 1.1) {
      const feet = Math.min(...framed.map((s) => s.head.y - 4.7 * s.size));
      target.y = Math.min(target.y, feet + 0.42 * seen);
    }
    const height =
      (type === "low" ? -0.55 * dist : type === "high" ? 0.6 * dist : 0.06 * dist) +
      extraRise * dist;
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
