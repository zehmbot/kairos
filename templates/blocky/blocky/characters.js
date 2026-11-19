// Blocky toy figures: box body, arms and legs with softened edges, a rounded head with a drawn face.
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

// ---------- The figure ----------

/**
 * Builds a character from a cast entry. Returns the group plus `apply(pose)` and `face(expression, state)`.
 * Spec: skin, hair, hairColor, hat, hatColor, top, shirt, shirt2, sleeves ("long" | "short"), pants, shoes,
 * beard (a color), size (1 = adult), features { glasses, freckles, lashes }.
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

  // Legs hang from the hips (y = 2).
  const legs = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, 2, 0);
    const leg = mesh(roundedBox(0.96, 1.72, 1.0, 0.12), pants);
    leg.position.y = -0.86;
    const shoe = mesh(roundedBox(1.0, 0.34, 1.08, 0.12), shoes);
    shoe.position.set(0, -1.83, 0.04);
    pivot.add(leg, shoe);
    body.add(pivot);
    legs.push(pivot);
  }

  const torso = new THREE.Group();
  torso.position.y = 2;
  body.add(torso);
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
  if (spec.top === "hoodie") {
    const hood = mesh(roundedBox(1.5, 0.5, 0.5, 0.2), sleeve);
    hood.position.set(0, 2.02, -0.42);
    torso.add(hood);
  }

  // Arms hang from the shoulders. The right hand has an anchor for things the character holds.
  const arms = [];
  const hand = new THREE.Group();
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.5, 1.86, 0);
    const short = spec.sleeves === "short";
    const sleeveLength = short ? 0.62 : 1.56;
    const upper = mesh(roundedBox(0.96, sleeveLength, 1.0, 0.12), sleeve);
    upper.position.y = 0.1 - sleeveLength / 2;
    const palm = mesh(roundedBox(0.9, 1.9 - sleeveLength, 0.94, 0.12), skin);
    palm.position.y = 0.1 - sleeveLength - (1.9 - sleeveLength) / 2;
    pivot.add(upper, palm);
    if (side === -1) {
      hand.position.set(0, -1.85, 0.35);
      pivot.add(hand);
    }
    torso.add(pivot);
    arms.push(pivot);
  }

  // Head with its drawn face.
  const head = new THREE.Group();
  head.position.y = 2 + HEAD_H / 2 + 0.04;
  torso.add(head);
  head.add(mesh(headGeometry(), skin));
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
    /** Where the eyes are, in world space (the camera aims here). */
    headWorld(target = new THREE.Vector3()) {
      return head.getWorldPosition(target);
    },
    chestWorld(target = new THREE.Vector3()) {
      return chest.getWorldPosition(target);
    },
    /** Sets every joint from a pose (see poses.js). */
    apply(pose) {
      body.position.set(0, pose.bodyY ?? 0, pose.bodyZ ?? 0);
      body.rotation.set(pose.bodyX ?? 0, 0, pose.bodyZr ?? 0);
      torso.rotation.set(pose.lean ?? 0, pose.twist ?? 0, pose.tilt ?? 0);
      head.rotation.set(pose.headX ?? 0, pose.headY ?? 0, pose.headZ ?? 0);
      const [lx = 0, lz = 0] = pose.armL ?? [];
      const [rx = 0, rz = 0] = pose.armR ?? [];
      arms[0].rotation.set(lx, 0, lz);
      arms[1].rotation.set(rx, 0, -rz);
      legs[0].rotation.set(pose.legL ?? 0, 0, pose.legLz ?? 0);
      legs[1].rotation.set(pose.legR ?? 0, 0, -(pose.legRz ?? 0));
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
