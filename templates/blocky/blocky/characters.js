// Blocky toy figures: a jointed body of softened boxes (15 parts), a rounded head with a drawn face.
// A figure is about 5.3 units tall (times its `size`), standing on y = 0 and facing +z.
import * as THREE from "three";
import { faceTexture } from "./faces.js";
import { cachedGeometry, canvasTexture, mesh, paint, roundedBox } from "./util.js";

const HEAD_R = 0.66;
const HEAD_H = 1.26;
const HEAD_CORNER = 0.22;

/** The head: a cylinder with rounded top and bottom edges. */
function headGeometry() {
  return cachedGeometry("head", () => {
    const points = [];
    const r = HEAD_R;
    const h = HEAD_H / 2;
    const c = HEAD_CORNER;
    points.push(new THREE.Vector2(0, -h));
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      points.push(new THREE.Vector2(r - c + Math.cos(a) * c, -h + c + Math.sin(a) * c));
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      points.push(new THREE.Vector2(r - c + Math.cos(a) * c, h - c + Math.sin(a) * c));
    }
    points.push(new THREE.Vector2(0, h));
    return new THREE.LatheGeometry(points, 40);
  });
}

/** The face: a curved strip just in front of the head's straight part. */
function faceGeometry() {
  return cachedGeometry("face", () => {
    // About as wide as it is tall, so the drawn eyes stay round.
    const height = HEAD_H - 0.2;
    return new THREE.CylinderGeometry(
      HEAD_R + 0.008,
      HEAD_R + 0.008,
      height,
      32,
      1,
      true,
      -0.95,
      1.9,
    );
  });
}

// ---------- Clothes, drawn on the torso ----------

function torsoTexture(spec, front) {
  const { top = "plain", shirt, shirt2 = "#ffffff", pants } = spec;
  return canvasTexture(`torso:${top}:${shirt}:${shirt2}:${pants}:${front}`, 256, (ctx, s) => {
    ctx.fillStyle = shirt;
    ctx.fillRect(0, 0, s, s);
    // Soft fabric shading.
    const shade = ctx.createLinearGradient(0, 0, 0, s);
    shade.addColorStop(0, "rgba(255,255,255,0.08)");
    shade.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, s, s);

    if (top === "stripes") {
      ctx.fillStyle = shirt2;
      for (let y = 18; y < s; y += 48) ctx.fillRect(0, y, s, 22);
    }
    if (top === "check") {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = shirt2;
      for (let i = 0; i < s; i += 64) {
        ctx.fillRect(i + 20, 0, 22, s);
        ctx.fillRect(0, i + 20, s, 22);
      }
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000000";
      for (let i = 0; i < s; i += 64) ctx.fillRect(i + 52, 0, 6, s);
      ctx.globalAlpha = 1;
    }
    if (top === "sweater") {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let x = 4; x < s; x += 14) ctx.fillRect(x, s - 34, 6, 34);
    }
    if (!front) {
      if (top === "overalls") {
        ctx.fillStyle = pants;
        ctx.fillRect(50, 0, 30, s);
        ctx.fillRect(176, 0, 30, s);
        ctx.fillRect(0, s * 0.62, s, s);
      }
      return;
    }
    switch (top) {
      case "hoodie": {
        ctx.fillStyle = "rgba(0,0,0,0.14)";
        ctx.beginPath();
        ctx.roundRect(56, 150, 144, 78, 18);
        ctx.fill();
        ctx.strokeStyle = "#f4f4f4";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(106, 6);
        ctx.lineTo(102, 82);
        ctx.moveTo(150, 6);
        ctx.lineTo(154, 82);
        ctx.stroke();
        break;
      }
      case "overalls": {
        ctx.fillStyle = pants;
        ctx.beginPath();
        ctx.roundRect(46, 110, 164, 160, 14);
        ctx.fill();
        ctx.fillRect(50, 0, 30, 120);
        ctx.fillRect(176, 0, 30, 120);
        ctx.fillStyle = "#f4d35e";
        for (const x of [65, 191]) {
          ctx.beginPath();
          ctx.arc(x, 118, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(96, 150, 64, 46);
        break;
      }
      case "cardigan": {
        ctx.fillStyle = shirt2;
        ctx.beginPath();
        ctx.moveTo(98, 0);
        ctx.lineTo(158, 0);
        ctx.lineTo(146, s);
        ctx.lineTo(110, s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#3a2a20";
        for (let y = 70; y < s; y += 52) {
          ctx.beginPath();
          ctx.arc(160, y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "sweater":
      case "tee": {
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(128, -30, 70, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        if (top === "tee") {
          // A little star print.
          ctx.fillStyle = shirt2;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const r = i % 2 ? 18 : 42;
            ctx.lineTo(128 + Math.cos(a) * r, 140 + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case "check":
      case "plain":
      case "stripes": {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let y = 50; y < s; y += 56) {
          ctx.beginPath();
          ctx.arc(128, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  });
}

// ---------- Hair and hats ----------

function addHair(head, spec) {
  const color = spec.hairColor ?? "#3a2a1e";
  const hair = paint(color, { roughness: 0.8 });
  const r = HEAD_R;
  const top = HEAD_H / 2;
  const add = (geometry, x, y, z, rx = 0, ry = 0, rz = 0, material = hair) => {
    const m = mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    head.add(m);
    return m;
  };
  const cap = (h = 0.42) =>
    add(roundedBox(r * 2.12, h, r * 2.12, 0.18), 0, top - h / 2 + 0.16, -0.02);
  const back = (h) => add(roundedBox(r * 2.06, h, 0.5, 0.16), 0, top - h / 2 + 0.05, -r + 0.12);
  switch (spec.hair) {
    case "short":
      cap(0.4);
      back(0.9);
      add(roundedBox(r * 1.9, 0.22, 0.34, 0.1), 0, top - 0.06, r - 0.18, 0.2);
      break;
    case "messy":
      cap(0.46);
      back(1.0);
      for (const [x, z, rz, rx] of [
        [-0.42, 0.42, 0.5, 0.4],
        [0, 0.5, 0.05, 0.55],
        [0.4, 0.42, -0.45, 0.4],
        [-0.25, 0.1, 0.3, -0.2],
        [0.3, -0.1, -0.35, -0.3],
      ]) {
        add(roundedBox(0.5, 0.55, 0.42, 0.12), x, top + 0.12, z, rx, 0, rz);
      }
      break;
    case "curly":
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const ring = i % 2 ? 0.48 : 0.3;
        add(
          cachedGeometry("curl", () => new THREE.IcosahedronGeometry(0.3, 1)),
          Math.cos(a) * ring,
          top + 0.05 + (i % 3) * 0.06,
          Math.sin(a) * ring - 0.05,
        );
      }
      back(0.8);
      break;
    case "bob":
      cap(0.42);
      add(roundedBox(0.34, 1.2, r * 2.0, 0.14), -r - 0.06, top - 0.56, -0.08);
      add(roundedBox(0.34, 1.2, r * 2.0, 0.14), r + 0.06, top - 0.56, -0.08);
      back(1.24);
      add(roundedBox(r * 1.7, 0.26, 0.3, 0.12), 0, top - 0.08, r - 0.14, 0.25);
      break;
    case "long":
      cap(0.42);
      add(roundedBox(0.3, 1.6, r * 1.9, 0.14), -r - 0.04, top - 0.82, -0.12);
      add(roundedBox(0.3, 1.6, r * 1.9, 0.14), r + 0.04, top - 0.82, -0.12);
      add(roundedBox(r * 2.1, 2.1, 0.5, 0.18), 0, top - 1.0, -r + 0.06);
      break;
    case "ponytail":
      cap(0.42);
      back(0.8);
      add(roundedBox(0.42, 1.3, 0.42, 0.18), 0, top - 0.75, -r - 0.32, -0.35);
      add(roundedBox(0.5, 0.3, 0.5, 0.12), 0, top - 0.18, -r - 0.1);
      break;
    case "buns":
      cap(0.42);
      back(0.8);
      for (const x of [-0.62, 0.62]) {
        add(
          cachedGeometry("bun", () => new THREE.SphereGeometry(0.34, 20, 14)),
          x,
          top + 0.08,
          -0.12,
        );
      }
      break;
    case "sides":
      // Short tufts above the ears and around the back.
      for (const x of [-r + 0.02, r - 0.02]) add(roundedBox(0.2, 0.42, 0.7, 0.1), x, 0.08, -0.2);
      add(roundedBox(r * 1.9, 0.42, 0.3, 0.12), 0, 0.06, -r + 0.1);
      break;
    case "spiky":
      for (let i = 0; i < 7; i++) {
        const x = -0.5 + (i % 4) * 0.33;
        const z = i < 4 ? 0.15 : -0.25;
        add(
          cachedGeometry("spike", () => new THREE.ConeGeometry(0.22, 0.6, 6)),
          x,
          top + 0.28,
          z,
          z * 0.8,
          0,
          -x * 0.6,
        );
      }
      cap(0.36);
      back(0.8);
      break;
    default:
      // "bald": no hair.
      break;
  }

  const hat = spec.hat;
  if (!hat) return;
  const fabric = paint(spec.hatColor ?? "#2bb3a3", { roughness: 0.85 });
  if (hat === "beanie") {
    add(roundedBox(r * 2.18, 0.62, r * 2.18, 0.26), 0, top + 0.06, 0, 0, 0, 0, fabric);
    add(
      roundedBox(r * 2.26, 0.26, r * 2.26, 0.1),
      0,
      top - 0.2,
      0,
      0,
      0,
      0,
      paint(spec.hatColor ?? "#2bb3a3", { roughness: 0.95 }),
    );
    add(
      cachedGeometry("pom", () => new THREE.SphereGeometry(0.2, 16, 12)),
      0,
      top + 0.44,
      0,
      0,
      0,
      0,
      fabric,
    );
  } else if (hat === "cap") {
    add(roundedBox(r * 2.14, 0.44, r * 2.14, 0.2), 0, top + 0.06, 0, 0, 0, 0, fabric);
    add(roundedBox(r * 1.5, 0.08, 0.7, 0.04), 0, top - 0.12, r + 0.3, 0.08, 0, 0, fabric);
  } else if (hat === "beret") {
    add(
      cachedGeometry("beret", () => new THREE.CylinderGeometry(0.82, 0.7, 0.26, 24)),
      0.1,
      top + 0.1,
      0,
      0,
      0,
      -0.18,
      fabric,
    );
  }
}

// ---------- The figure: a jointed toy ----------

/**
 * Every joint, the pose keys that move it and how far it can turn (radians). Poses can ask for more: the figure
 * stops at the limit, and the Poses sheet says so.
 */
export const JOINTS = {
  neck: {
    keys: ["headX", "headY", "headZ"],
    ranges: [
      [-0.6, 0.7],
      [-1.3, 1.3],
      [-0.5, 0.5],
    ],
  },
  waist: {
    keys: ["lean", "twist", "tilt"],
    ranges: [
      [-0.6, 1.3],
      [-1.0, 1.0],
      [-0.5, 0.5],
    ],
  },
  shoulderL: {
    keys: ["armL.0", "armL.1"],
    ranges: [
      [-3.3, 1.3],
      [-0.7, 3.1],
    ],
  },
  shoulderR: {
    keys: ["armR.0", "armR.1"],
    ranges: [
      [-3.3, 1.3],
      [-0.7, 3.1],
    ],
  },
  elbowL: { keys: ["elbowL"], ranges: [[0, 2.6]] },
  elbowR: { keys: ["elbowR"], ranges: [[0, 2.6]] },
  wristL: { keys: ["wristL"], ranges: [[-1.0, 1.0]] },
  wristR: { keys: ["wristR"], ranges: [[-1.0, 1.0]] },
  hipL: {
    keys: ["legL", "legLz"],
    ranges: [
      [-2.3, 1.0],
      [-0.4, 1.0],
    ],
  },
  hipR: {
    keys: ["legR", "legRz"],
    ranges: [
      [-2.3, 1.0],
      [-0.4, 1.0],
    ],
  },
  kneeL: { keys: ["kneeL"], ranges: [[0, 2.6]] },
  kneeR: { keys: ["kneeR"], ranges: [[0, 2.6]] },
  ankleL: { keys: ["ankleL"], ranges: [[-0.8, 0.8]] },
  ankleR: { keys: ["ankleR"], ranges: [[-0.8, 0.8]] },
};

/** A pose value by key ("armL.1" is the second number of armL). */
function poseValue(pose, key) {
  const [name, index] = key.split(".");
  const value = pose[name];
  if (index !== undefined) return Array.isArray(value) ? (value[Number(index)] ?? 0) : 0;
  return typeof value === "number" ? value : 0;
}

/** The pose's value for each key of a joint, kept within its ranges; `over` lists what was past a limit. */
function jointAngles(pose, name, over) {
  const joint = JOINTS[name];
  return joint.keys.map((key, i) => {
    const value = poseValue(pose, key);
    const [min, max] = joint.ranges[i];
    if (value < min - 1e-6 || value > max + 1e-6) over.push({ joint: name, key, value, min, max });
    return Math.min(max, Math.max(min, value));
  });
}

/** A rounded joint cap across x (elbows, knees, the waist): hides the seam when the joint bends. */
const capAcross = (radius, length, material) => {
  const m = mesh(
    cachedGeometry(`capX:${radius}:${length}`, () => {
      const g = new THREE.CylinderGeometry(radius, radius, length, 24);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    material,
  );
  return m;
};
const ball = (radius, material) =>
  mesh(
    cachedGeometry(`ball:${radius}`, () => new THREE.SphereGeometry(radius, 24, 16)),
    material,
  );

/**
 * Builds a character from a cast entry. Returns the group plus `apply(pose)` and `face(expression, state)`.
 * Spec: skin, hair, hairColor, hat, hatColor, top, shirt, shirt2, sleeves ("long" | "short"), pants, shoes,
 * beard (a color), size (1 = adult), features { glasses, freckles, lashes }.
 *
 * The rig, standing (units, size 1): ankles at 0.34, knees at 1.14, hips and waist at 2, shoulders at 3.52,
 * elbows at 3, wrists at 2.45, the neck at 4. Each part hangs from its joint, and a rounded cap at each joint keeps
 * the parts joined at any angle.
 */
export function makeCharacter(spec) {
  const size = spec.size ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group(); // moves for sitting, lying and bouncing
  root.add(body);
  root.scale.setScalar(size);

  const skin = new THREE.MeshStandardMaterial({ color: spec.skin ?? "#e8b48c", roughness: 0.55 });
  const skinColor = skin.color.clone();
  // Textured parts use a white base, so the texture shows its own colors.
  const shirtSide = paint("#ffffff", { map: torsoTexture(spec, false), roughness: 0.75 });
  const shirtFront = paint("#ffffff", { map: torsoTexture(spec, true), roughness: 0.75 });
  const sleeve = paint(spec.shirt, { roughness: 0.75 });
  const pants = paint(spec.pants ?? "#2f3e63", { roughness: 0.8 });
  const shoes = paint(spec.shoes ?? "#2a2a30", { roughness: 0.5 });

  /** Pairs of parts that must touch (a joint's parent part and its child part), for the sheet's checks. */
  const links = [];

  // Hips: a pelvis in the pants' color, hidden under the chest until the waist bends.
  const pelvis = mesh(roundedBox(1.96, 0.5, 0.98, 0.12), pants);
  pelvis.position.y = 2;
  body.add(pelvis);

  // Legs: hip → knee → ankle.
  const hips = [];
  const knees = [];
  const ankles = [];
  for (const side of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.5, 2, 0);
    const hipCap = capAcross(0.48, 0.94, pants);
    const thigh = mesh(roundedBox(0.96, 0.9, 1.0, 0.12), pants);
    thigh.position.y = -0.45;
    hip.add(hipCap, thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.86;
    const kneeCap = capAcross(0.48, 0.94, pants);
    const shin = mesh(roundedBox(0.96, 0.84, 1.0, 0.12), pants);
    shin.position.y = -0.4;
    knee.add(kneeCap, shin);
    const ankle = new THREE.Group();
    ankle.position.y = -0.8;
    const shoe = mesh(roundedBox(1.0, 0.34, 1.08, 0.12), shoes);
    shoe.position.set(0, -0.17, 0.04);
    ankle.add(shoe);
    knee.add(ankle);
    hip.add(knee);
    body.add(hip);
    hips.push(hip);
    knees.push(knee);
    ankles.push(ankle);
    const s = side === 1 ? "L" : "R";
    links.push(
      { joint: `hip${s}`, parent: [pelvis], child: [hipCap, thigh] },
      { joint: `knee${s}`, parent: [thigh], child: [kneeCap, shin] },
      { joint: `ankle${s}`, parent: [shin], child: [shoe] },
    );
  }

  // The waist: the chest turns on the hips.
  const torso = new THREE.Group();
  torso.position.y = 2;
  body.add(torso);
  const waistCap = capAcross(0.5, 1.94, pants);
  torso.add(waistCap);
  const chest = mesh(roundedBox(2, 2, 1, 0.14), [
    shirtSide,
    shirtSide,
    shirtSide,
    shirtSide,
    shirtFront,
    shirtSide,
  ]);
  chest.position.y = 1;
  torso.add(chest);
  links.push({ joint: "waist", parent: [pelvis], child: [waistCap, chest] });
  if (spec.top === "hoodie") {
    const hood = mesh(roundedBox(1.5, 0.5, 0.5, 0.2), sleeve);
    hood.position.set(0, 2.02, -0.42);
    torso.add(hood);
  }

  // Arms: shoulder → elbow → wrist. Sleeves cover the upper arm (short) or the whole arm (long).
  const short = spec.sleeves === "short";
  const shoulders = [];
  const elbows = [];
  const wrists = [];
  const hand = new THREE.Group();
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 1.5, 1.52, 0);
    const shoulderCap = ball(0.47, sleeve);
    const upper = new THREE.Group();
    if (short) {
      // A short sleeve, then bare arm down to the elbow.
      const cloth = mesh(roundedBox(0.96, 0.62, 1.0, 0.12), sleeve);
      cloth.position.y = 0.44 - 0.31;
      const arm = mesh(roundedBox(0.92, 0.4, 0.96, 0.12), skin);
      arm.position.y = -0.18 - 0.17;
      upper.add(cloth, arm);
    } else {
      const cloth = mesh(roundedBox(0.96, 0.96, 1.0, 0.12), sleeve);
      cloth.position.y = -0.04;
      upper.add(cloth);
    }
    shoulder.add(shoulderCap, upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.52;
    const elbowCap = capAcross(0.47, 0.92, short ? skin : sleeve);
    const forearm = mesh(
      roundedBox(short ? 0.92 : 0.96, 0.6, short ? 0.96 : 1.0, 0.12),
      short ? skin : sleeve,
    );
    forearm.position.y = -0.28;
    elbow.add(elbowCap, forearm);
    const wrist = new THREE.Group();
    wrist.position.y = -0.55;
    const wristCap = capAcross(0.45, 0.88, skin);
    const palm = mesh(roundedBox(0.9, 0.42, 0.94, 0.12), skin);
    palm.position.y = -0.18;
    wrist.add(wristCap, palm);
    if (side === -1) {
      // Things held in the right hand sit in front of the palm.
      hand.position.set(0, -0.3, 0.42);
      wrist.add(hand);
    }
    elbow.add(wrist);
    shoulder.add(elbow);
    torso.add(shoulder);
    shoulders.push(shoulder);
    elbows.push(elbow);
    wrists.push(wrist);
    const s = side === 1 ? "L" : "R";
    links.push(
      { joint: `shoulder${s}`, parent: [chest], child: [shoulderCap, ...upper.children] },
      { joint: `elbow${s}`, parent: [...upper.children], child: [elbowCap, forearm] },
      { joint: `wrist${s}`, parent: [forearm], child: [wristCap, palm] },
    );
  }

  // The neck and the head with its drawn face.
  const neck = new THREE.Group();
  neck.position.y = 2;
  torso.add(neck);
  const neckCap = mesh(
    cachedGeometry("neck", () => new THREE.CylinderGeometry(0.36, 0.38, 0.22, 20)),
    skin,
  );
  neckCap.position.y = 0.04;
  neck.add(neckCap);
  const head = new THREE.Group();
  head.position.y = HEAD_H / 2 + 0.04;
  neck.add(head);
  const skull = mesh(headGeometry(), skin);
  head.add(skull);
  links.push({ joint: "neck", parent: [chest], child: [neckCap, skull] });
  const faceMaterial = new THREE.MeshStandardMaterial({
    transparent: true,
    roughness: 0.6,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const face = mesh(faceGeometry(), faceMaterial, { cast: false });
  face.position.y = -0.02;
  head.add(face);
  if (spec.beard) {
    // The beard is drawn on the face around the mouth; this is the part below the chin.
    const chin = mesh(roundedBox(1.0, 0.34, 0.55, 0.16), paint(spec.beard, { roughness: 0.95 }));
    chin.position.set(0, -HEAD_H / 2 - 0.02, HEAD_R - 0.18);
    head.add(chin);
  }
  addHair(head, spec);

  const lightness = new THREE.Color(spec.skin ?? "#e8b48c").getHSL({}).l;
  const features = { ...(spec.features ?? {}), beard: spec.beard, dark: lightness < 0.36 };
  let lastFace = "";

  return {
    root,
    size,
    /** Things held in the right hand go in here. */
    hand,
    /** The parts each joint holds together (the Poses sheet checks that they still touch). */
    links,
    /** Where the eyes are, in world space (the camera aims here). */
    headWorld(target = new THREE.Vector3()) {
      return head.getWorldPosition(target);
    },
    chestWorld(target = new THREE.Vector3()) {
      return chest.getWorldPosition(target);
    },
    /**
     * Sets every joint from a pose (see poses.js), each within its range. Returns what the pose asked past a
     * joint's limit (the figure stops there).
     */
    apply(pose) {
      const over = [];
      body.position.set(0, pose.bodyY ?? 0, pose.bodyZ ?? 0);
      body.rotation.set(pose.bodyX ?? 0, 0, pose.bodyZr ?? 0);
      const [lean, twist, tilt] = jointAngles(pose, "waist", over);
      torso.rotation.set(lean, twist, tilt);
      const [hx, hy, hz] = jointAngles(pose, "neck", over);
      neck.rotation.set(hx, hy, hz);
      const [lx, lz] = jointAngles(pose, "shoulderL", over);
      const [rx, rz] = jointAngles(pose, "shoulderR", over);
      shoulders[0].rotation.set(lx, 0, lz);
      shoulders[1].rotation.set(rx, 0, -rz);
      // Elbows and wrists bend forward (toward +z); knees bend back; ankles tip the foot.
      elbows[0].rotation.set(-jointAngles(pose, "elbowL", over)[0], 0, 0);
      elbows[1].rotation.set(-jointAngles(pose, "elbowR", over)[0], 0, 0);
      wrists[0].rotation.set(-jointAngles(pose, "wristL", over)[0], 0, 0);
      wrists[1].rotation.set(-jointAngles(pose, "wristR", over)[0], 0, 0);
      const [llx, llz] = jointAngles(pose, "hipL", over);
      const [rlx, rlz] = jointAngles(pose, "hipR", over);
      hips[0].rotation.set(llx, 0, llz);
      hips[1].rotation.set(rlx, 0, -rlz);
      knees[0].rotation.set(jointAngles(pose, "kneeL", over)[0], 0, 0);
      knees[1].rotation.set(jointAngles(pose, "kneeR", over)[0], 0, 0);
      ankles[0].rotation.set(jointAngles(pose, "ankleL", over)[0], 0, 0);
      ankles[1].rotation.set(jointAngles(pose, "ankleR", over)[0], 0, 0);
      return over;
    },
    /** Shows an expression; `blink` closes the eyes, `talk` (0-2) opens the mouth. */
    face(expression, state) {
      const key = `${expression}|${state.blink}|${state.talk}`;
      if (key === lastFace) return;
      lastFace = key;
      const { texture, red } = faceTexture(features, expression, state);
      faceMaterial.map = texture;
      faceMaterial.needsUpdate = true;
      skin.color.copy(red ? new THREE.Color("#e8473a") : skinColor);
    },
  };
}
