// Someone's whole body at a moment: where they stand (motion.js), their pose with its moves and actions
// (animation.js), what they carry, how they react to what they feel and to what hits them, and arms that aim (a
// punch at a face, a hand at a thing). The engine draws it, the physics carries things in its hands, and the tests
// check it, all from this one function of time.
import * as THREE from "three";
import { addPose, CARRY, flinch, reaction } from "./animation.js";
import { composePose, personState, poseFor } from "./motion.js";
import { blendPoses, poseAt, TRAVEL } from "./poses.js";
import { aimArm, rigFrames } from "./rig.js";

/**
 * The face someone has in shot `index`, and since when (the first shot in a row of the same place where they have it):
 * `{ expression, from, since }` (`from`: the face before, `since`: the time it changed).
 */
export function faceAt(timeline, placeOf, index, id) {
  const faceIn = (i) => timeline[i]?.shot.face?.[id] ?? "neutral";
  const expression = faceIn(index);
  let i = index;
  while (i > 0 && placeOf(i - 1) === placeOf(index) && faceIn(i - 1) === expression) i--;
  const changed = i > 0 && placeOf(i - 1) === placeOf(index);
  return { expression, from: changed ? faceIn(i - 1) : expression, since: timeline[i].start };
}

/**
 * Someone at time t in shot `index`: `{ state, root, pose }` (`root`: `{ x, y, z, rot, size }`), or null when they
 * aren't in the shot. `ctx`: `{ plan, timeline, placeOf, layoutAt(i), sizeOf, phaseOf, cueFor, sim, aim }` (`sim`: the
 * physics, for what hit them and where things were gripped; `aim` false skips aiming arms).
 */
export function figureAt(ctx, index, id, t) {
  const { plan, timeline, sizeOf, phaseOf } = ctx;
  const layout = ctx.layoutAt?.(index) ?? ctx.layout;
  const entry = timeline[index];
  const state = personState(plan, index, id, t, layout);
  if (!state) return null;
  const size = sizeOf(id);
  const phase = phaseOf(id);
  const poseName = poseFor(entry, id, state.posture);
  const uPose = t - entry.start + phase * 3;
  const root = { x: state.x, y: state.y ?? 0, z: state.z, rot: state.rot, size };
  if (!state.act && !state.lastMove && TRAVEL[poseName]) {
    // A gait pose without a walk goes straight ahead at its speed, its feet planted.
    const travel = TRAVEL[poseName] * (t - entry.start) * size;
    root.x += Math.sin(state.rot) * travel;
    root.z += Math.cos(state.rot) * travel;
  }
  const idle = () => poseAt("idle", uPose, phase);
  let pose = composePose(state, poseAt(poseName, uPose, phase, ctx.cueFor?.(entry, id, phase)), {
    idle,
    size,
    t,
    poseTime: uPose,
    phase,
  });

  // Carrying something: the right hand holds it in front of the chest (a gait keeps the other arm swinging).
  const kind = state.act?.kind;
  const holding = (plan.holds ?? []).some((h) => h.id === id && t >= h.t0 && t < h.t1);
  if (holding && kind !== "pickUp" && kind !== "throw") {
    pose = blendPoses(pose, { ...pose, ...CARRY }, 1);
  }

  // The body side of what the face shows, blending in as the face changes.
  if (ctx.placeOf && state.posture === "stand" && kind !== "knocked") {
    const face = faceAt(timeline, ctx.placeOf, index, id);
    pose = reaction(pose, face.expression, t - face.since, Boolean(kind));
  }

  // Hit by something thrown: a flinch.
  const hit = (ctx.sim?.hits ?? []).findLast((h) => h.id === id && h.t <= t);
  if (hit && t - hit.t < 1.2) pose = flinch(pose, t - hit.t);

  // Arms that aim: a punch at the face, a hand at what it picks up.
  if (pose.aim && ctx.aim !== false) {
    const { side, weight } = pose.aim;
    let target = null;
    if (pose.aim.person) {
      const other = figureAt({ ...ctx, aim: false }, index, pose.aim.person, t);
      if (other) {
        const head = new THREE.Vector3().setFromMatrixPosition(
          rigFrames(other.pose, other.root).head,
        );
        const toward = new THREE.Vector3(root.x - head.x, 0, root.z - head.z).normalize();
        target = head.add(toward.multiplyScalar(0.62 * other.root.size));
      }
    } else if (pose.aim.point) {
      const grip = ctx.sim?.grips?.get(pose.aim.thing ?? "");
      const p = grip ?? pose.aim.point;
      target = new THREE.Vector3(p.x, p.y, p.z);
    }
    if (target && weight > 0) {
      const aimed = aimArm(pose, root, side, target);
      const arm = `arm${side}`;
      const elbow = `elbow${side}`;
      const wrist = `wrist${side}`;
      pose = {
        ...pose,
        ...blendPoses(
          { [arm]: pose[arm] ?? [0, 0], [elbow]: pose[elbow] ?? 0, [wrist]: pose[wrist] ?? 0 },
          { [arm]: aimed[arm], [elbow]: aimed[elbow], [wrist]: aimed[wrist] },
          Math.min(1, weight),
        ),
      };
    }
  }
  delete pose.aim;
  return { state, root, pose: addPose(pose, {}) };
}
