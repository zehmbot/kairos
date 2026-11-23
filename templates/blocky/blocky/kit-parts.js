// Small parts the place kit is built from: boxes and planes whose textures keep one size in the world (siding
// boards stay the same height on a wide wall and a narrow one), and shared materials.
import * as THREE from "three";
import { cachedGeometry, canvasTexture, paint, rng } from "./util.js";

export const group = (...children) => {
  const g = new THREE.Group();
  for (const child of children) g.add(child);
  return g;
};

/** Marks a piece for the Places sheet's size checks ("door", "table", "seat"). */
export const kind = (object, name) => {
  object.userData.kind = name;
  return object;
};

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * A box whose texture repeats every `tile` units on each face (its UVs are in world units / tile). Centered on its
 * middle, like BoxGeometry.
 */
export function tiledBox(w, h, d, tile = 4) {
  return cachedGeometry(`tbox:${round(w)}:${round(h)}:${round(d)}:${tile}`, () => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const uv = geometry.getAttribute("uv");
    // Faces in order: +x, −x (depth × height), +y, −y (width × depth), +z, −z (width × height); 4 vertices each.
    const sizes = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let face = 0; face < 6; face++) {
      const [su, sv] = sizes[face];
      for (let k = 0; k < 4; k++) {
        const i = face * 4 + k;
        uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
      }
    }
    return geometry;
  });
}

/** A plane (facing +z) whose texture repeats every `tile` units. */
export function tiledPlane(w, h, tile = 4) {
  return cachedGeometry(`tplane:${round(w)}:${round(h)}:${tile}`, () => {
    const geometry = new THREE.PlaneGeometry(w, h);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
    return geometry;
  });
}

/** A flat shape (in its x, y) with its texture repeating every `tile` units. */
export function tiledShape(key, points, tile = 4) {
  return cachedGeometry(`tshape:${key}:${tile}`, () => {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ShapeGeometry(shape);
    const pos = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
    return geometry;
  });
}

/** A mesh of `geometry` placed at x, y, z (its middle), casting and receiving shadows. */
export function part(
  geometry,
  material,
  x = 0,
  y = 0,
  z = 0,
  { cast = true, receive = true } = {},
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const glows = new Map();
/** Something that glows (a lit window, a bulb): one shared material per color and strength. */
export function glowing(color, intensity = 1, map = null) {
  const key = `${color}|${intensity}|${map ? map.uuid : ""}`;
  let material = glows.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: "#000000",
      emissive: color,
      emissiveIntensity: intensity,
      emissiveMap: map,
      roughness: 1,
    });
    glows.set(key, material);
  }
  return material;
}

/** White painted wood: trims, frames, posts, pickets. */
export const trim = () => paint("#f4f2ec", { roughness: 0.55 });

/**
 * A window pane's picture: by day, glass reflecting the sky with curtains drawn to the sides; lit at night, a
 * warm room behind the same curtains.
 */
export function paneTexture(curtain, lit, seed = 0) {
  return canvasTexture(`pane:${curtain}:${lit}:${seed}`, 128, (ctx, s) => {
    const random = rng(`pane${seed}`);
    if (lit) {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, "#ffd48a");
      grad.addColorStop(1, "#ff9f4a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      // A lamp's pool of light somewhere in the room.
      const glow = ctx.createRadialGradient(
        s * (0.3 + random() * 0.4),
        s * 0.45,
        2,
        s / 2,
        s / 2,
        s * 0.7,
      );
      glow.addColorStop(0, "rgba(255,245,210,0.9)");
      glow.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, s, s);
    } else {
      const grad = ctx.createLinearGradient(0, 0, s * 0.3, s);
      grad.addColorStop(0, "#9fc4e6");
      grad.addColorStop(0.55, "#3e5d7c");
      grad.addColorStop(1, "#22364c");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(s * 0.15, 0);
      ctx.lineTo(s * 0.35, 0);
      ctx.lineTo(s * 0.05, s);
      ctx.lineTo(-s * 0.15, s);
      ctx.fill();
    }
    // Curtains on both sides, with folds.
    for (const side of [0, 1]) {
      const w = s * (0.18 + random() * 0.08);
      const x0 = side ? s - w : 0;
      ctx.fillStyle = curtain;
      ctx.globalAlpha = lit ? 0.85 : 0.95;
      ctx.fillRect(x0, 0, w, s);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000000";
      for (let f = 0; f < 4; f++) ctx.fillRect(x0 + (f + 0.5) * (w / 4), 0, 2, s);
      ctx.globalAlpha = 1;
    }
  });
}

/** A white-framed window with a cross of glazing bars, a sill, and shutters when `shutters` is a color. */
export function windowUnit(
  w,
  h,
  { curtain = "#f2e6c9", lit = false, shutters = null, seed = 0 } = {},
) {
  const frame = trim();
  const pane = lit
    ? glowing("#ffffff", 1.15, paneTexture(curtain, true, seed))
    : paint("#ffffff", {
        map: paneTexture(curtain, false, seed),
        roughness: 0.12,
        metalness: 0.15,
      });
  const g = group(
    part(
      cachedGeometry(`pane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
      pane,
      0,
      h / 2,
      0.06,
      {
        cast: false,
      },
    ),
    part(new THREE.BoxGeometry(w + 0.7, 0.32, 0.35), frame, 0, h + 0.16, 0.12),
    part(new THREE.BoxGeometry(w + 1.0, 0.28, 0.7), frame, 0, -0.14, 0.3),
    part(new THREE.BoxGeometry(0.32, h, 0.35), frame, -w / 2 - 0.16, h / 2, 0.12),
    part(new THREE.BoxGeometry(0.32, h, 0.35), frame, w / 2 + 0.16, h / 2, 0.12),
    part(new THREE.BoxGeometry(0.14, h, 0.16), frame, 0, h / 2, 0.1),
    part(new THREE.BoxGeometry(w, 0.14, 0.16), frame, 0, h * 0.55, 0.1),
  );
  if (shutters) {
    const board = paint(shutters, { roughness: 0.6 });
    for (const side of [-1, 1]) {
      g.add(
        part(
          new THREE.BoxGeometry(w * 0.42, h + 0.2, 0.18),
          board,
          side * (w / 2 + 0.35 + w * 0.21),
          h / 2,
          0.12,
        ),
      );
    }
  }
  return g;
}
