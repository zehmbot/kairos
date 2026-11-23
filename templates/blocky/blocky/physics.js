// Physics, behind a small interface: the only file that talks to the physics library (Rapier, its deterministic
// build: the same results on every computer, in Node and in the browser). Everything here is in meters, seconds
// and kilograms; simulation.js turns the film's units into meters and back.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";

let loading = null;

/** Loads the physics (its WebAssembly) once. Resolves to `createWorld`. */
export function loadPhysics() {
  loading ??= RAPIER.init().then(() => createWorld);
  return loading;
}

/** Who collides with whom: each body is in one group, and meets the groups in its filter. */
export const GROUPS = {
  STATIC: 1,
  OBJECT: 2,
  PERSON: 4,
  LIMB: 8,
};
const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
const FILTER = {
  [GROUPS.STATIC]: GROUPS.OBJECT | GROUPS.LIMB,
  [GROUPS.OBJECT]: GROUPS.STATIC | GROUPS.OBJECT | GROUPS.PERSON | GROUPS.LIMB,
  [GROUPS.PERSON]: GROUPS.OBJECT | GROUPS.LIMB,
  [GROUPS.LIMB]: GROUPS.STATIC | GROUPS.OBJECT | GROUPS.PERSON | GROUPS.LIMB,
};

/**
 * A new world stepping `hz` times a second, with gravity. Bodies are returned as handles (numbers); `read(handle)`
 * gives `[x, y, z, qx, qy, qz, qw]`.
 */
export function createWorld({ hz = 120, gravity = 9.81 } = {}) {
  const world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
  world.timestep = 1 / hz;
  const events = new RAPIER.EventQueue(true);
  const bodies = new Map();
  const colliderOwner = new Map();

  const shapeDesc = (shape) => {
    if (shape.box)
      return RAPIER.ColliderDesc.cuboid(shape.box[0] / 2, shape.box[1] / 2, shape.box[2] / 2);
    if (shape.ball) return RAPIER.ColliderDesc.ball(shape.ball);
    if (shape.capsule) return RAPIER.ColliderDesc.capsule(shape.capsule[0], shape.capsule[1]);
    throw new Error("A body needs a box, a ball or a capsule.");
  };

  return {
    hz,
    gravity,
    /** A fixed box (the floor, a wall, furniture): center, full size, turned `rotY` around the vertical. */
    fixedBox({ x, y, z, w, h, d, rotY = 0, friction = 0.8 }) {
      const half = rotY / 2;
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
          .setTranslation(x, y, z)
          .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
          .setFriction(friction)
          .setCollisionGroups(groups(GROUPS.STATIC, FILTER[GROUPS.STATIC])),
      );
    },
    /**
     * A body: `shape` ({ box: [w, h, d] } | { ball: r } | { capsule: [halfHeight, r] }), where it is (`at`, `q`),
     * `kind` "dynamic" or "kinematic", `density` (kg/m³), `friction`, `restitution`, `ccd` (fast things don't go
     * through thin ones), `group` (GROUPS), `offset` (the shape's center from the body's origin), `damping`.
     */
    body({
      shape,
      at,
      q = { x: 0, y: 0, z: 0, w: 1 },
      kind = "dynamic",
      density = 300,
      friction = 0.6,
      restitution = 0.15,
      ccd = false,
      group = GROUPS.OBJECT,
      offset,
      damping = [0.05, 0.1],
      listen = false,
    }) {
      const desc =
        kind === "kinematic"
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.dynamic()
              .setLinearDamping(damping[0])
              .setAngularDamping(damping[1])
              .setCcdEnabled(ccd);
      desc.setTranslation(at.x, at.y, at.z).setRotation(q);
      const body = world.createRigidBody(desc);
      const collider = shapeDesc(shape)
        .setDensity(density)
        .setFriction(friction)
        .setRestitution(restitution)
        .setCollisionGroups(groups(group, FILTER[group]));
      if (offset) collider.setTranslation(offset.x, offset.y, offset.z);
      if (listen) collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      if (kind === "kinematic") {
        collider.setActiveCollisionTypes(
          RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
        );
      }
      const made = world.createCollider(collider, body);
      bodies.set(body.handle, body);
      colliderOwner.set(made.handle, body.handle);
      return body.handle;
    },
    /** Moves a kinematic body to where it is next step (it pushes what it meets). */
    moveTo(handle, at, q) {
      const body = bodies.get(handle);
      body.setNextKinematicTranslation(at);
      if (q) body.setNextKinematicRotation(q);
    },
    /** Puts a body somewhere at once (no push), with a speed. */
    place(handle, at, q, velocity, spin) {
      const body = bodies.get(handle);
      body.setTranslation(at, true);
      if (q) body.setRotation(q, true);
      if (velocity) body.setLinvel(velocity, true);
      if (spin) body.setAngvel(spin, true);
    },
    /** Turns a body kinematic (held) or dynamic again (let go). */
    setKind(handle, kind) {
      bodies
        .get(handle)
        .setBodyType(
          kind === "kinematic"
            ? RAPIER.RigidBodyType.KinematicPositionBased
            : RAPIER.RigidBodyType.Dynamic,
          true,
        );
    },
    /** A push (N·s) at a point (or at the center). */
    impulse(handle, push, point) {
      const body = bodies.get(handle);
      if (point) body.applyImpulseAtPoint(push, point, true);
      else body.applyImpulse(push, true);
    },
    mass(handle) {
      return bodies.get(handle).mass();
    },
    velocity(handle) {
      const v = bodies.get(handle).linvel();
      return { x: v.x, y: v.y, z: v.z };
    },
    /** A ball joint (`anchors` in each body's frame). Its stiffness comes from the bodies' angular damping. */
    ballJoint(a, b, anchorA, anchorB) {
      const joint = world.createImpulseJoint(
        RAPIER.JointData.spherical(anchorA, anchorB),
        bodies.get(a),
        bodies.get(b),
        true,
      );
      joint.setContactsEnabled(false);
      return joint;
    },
    /** A hinge around the x axis of both frames (knees, elbows), between `min` and `max` radians. */
    hinge(a, b, anchorA, anchorB, [min, max], damping = 0) {
      const joint = world.createImpulseJoint(
        RAPIER.JointData.revolute(anchorA, anchorB, { x: 1, y: 0, z: 0 }),
        bodies.get(a),
        bodies.get(b),
        true,
      );
      joint.setContactsEnabled(false);
      joint.setLimits(min, max);
      if (damping > 0) joint.configureMotorVelocity(0, damping);
      return joint;
    },
    /** Takes a body out of the world (it stops colliding). */
    remove(handle) {
      const body = bodies.get(handle);
      if (!body) return;
      world.removeRigidBody(body);
      bodies.delete(handle);
    },
    /** One step. `contact(a, b)` hears every new contact between two listening bodies. */
    step(contact) {
      world.step(events);
      events.drainCollisionEvents((h1, h2, started) => {
        if (!started || !contact) return;
        const a = colliderOwner.get(h1);
        const b = colliderOwner.get(h2);
        if (a !== undefined && b !== undefined) contact(a, b);
      });
    },
    /** `[x, y, z, qx, qy, qz, qw]` of a body. */
    read(handle) {
      const body = bodies.get(handle);
      const p = body.translation();
      const q = body.rotation();
      return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
    },
    /** How deep a body goes into the fixed shapes (meters, 0 when it doesn't touch them). */
    depthInStatic(handle) {
      const body = bodies.get(handle);
      let deepest = 0;
      for (let i = 0; i < body.numColliders(); i++) {
        const collider = body.collider(i);
        world.contactPairsWith(collider, (other) => {
          if (colliderOwner.has(other.handle)) return;
          world.contactPair(collider, other, (manifold) => {
            for (let k = 0; k < manifold.numContacts(); k++) {
              deepest = Math.max(deepest, -manifold.contactDist(k));
            }
          });
        });
      }
      return deepest;
    },
    /** Does a kinematic body touch a fixed shape now (a character walking into furniture)? */
    touchesStatic(handle) {
      const body = bodies.get(handle);
      const collider = body.collider(0);
      let hit = false;
      world.contactPairsWith(collider, (other) => {
        if (colliderOwner.has(other.handle)) return;
        world.contactPair(collider, other, (manifold) => {
          for (let k = 0; k < manifold.numContacts(); k++) {
            if (manifold.contactDist(k) < -0.02) hit = true;
          }
        });
      });
      return hit;
    },
    free() {
      events.free();
      world.free();
    },
  };
}
