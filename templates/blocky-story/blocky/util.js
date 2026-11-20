// Small helpers shared by the Blocky engine. Everything here is pure or cached: no clocks, no Math.random.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => {
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};
export const easeOut = (k) => 1 - (1 - clamp(k)) ** 3;
export const easeInOut = (k) => {
  const x = clamp(k);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** A number from a string, for seeds ("mia" → always the same number). */
export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A seeded random generator (mulberry32): the same seed gives the same numbers on every frame. */
export function rng(seed) {
  let a = typeof seed === "string" ? hash(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth wobble from -1 to 1 (sum of sines): hand-held cameras, breathing, idle sways. */
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 1.3 + seed * 1.7) * 0.5 +
    Math.sin(t * 2.1 + seed * 3.1) * 0.3 +
    Math.sin(t * 3.7 + seed * 0.7) * 0.2
  );
}

// ---------- Geometry and materials (cached: built once, shared) ----------

const geometries = new Map();

/** A box with softened edges, the base of every Blocky shape. */
export function roundedBox(w, h, d, radius = 0.12, segments = 3) {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  const key = `rb:${w}:${h}:${d}:${r}:${segments}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(w, h, d, segments, r);
    geometries.set(key, geometry);
  }
  return geometry;
}

export function cachedGeometry(key, make) {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = make();
    geometries.set(key, geometry);
  }
  return geometry;
}

const materials = new Map();

/** A plastic-like toy material. Same color and options → the same material object. */
export function paint(color, options = {}) {
  const { map, ...rest } = options;
  const key = `${color}|${map ? map.uuid : ""}|${JSON.stringify(rest)}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.62,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ?? "#000000",
      emissiveIntensity: options.emissiveIntensity ?? 1,
      map: options.map ?? null,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
    });
    materials.set(key, material);
  }
  return material;
}

/** A mesh that casts and receives shadows. */
export function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** A rounded box mesh placed at x, y, z (y is the bottom, which makes stacking easy). */
export function block(w, h, d, color, x = 0, y = 0, z = 0, options = {}) {
  const m = mesh(
    roundedBox(w, h, d, options.radius ?? 0.08),
    options.material ?? paint(color, options),
  );
  m.position.set(x, y + h / 2, z);
  return m;
}

// ---------- Canvas textures ----------

const textures = new Map();

/** A texture drawn once on a canvas (floors, walls, signs). `draw(ctx, size)` paints it. */
export function canvasTexture(key, size, draw, { repeat = [1, 1], srgb = true } = {}) {
  const id = `${key}:${repeat.join("x")}`;
  let texture = textures.get(id);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    draw(canvas.getContext("2d"), size);
    texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = 4;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(id, texture);
  }
  return texture;
}

/** Soft speckles over a base color: makes big flat surfaces look less like plastic. */
export function speckle(ctx, size, base, spots, seed, amount = 900, radius = 3) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const random = rng(seed);
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = spots[Math.floor(random() * spots.length)];
    ctx.globalAlpha = 0.08 + random() * 0.12;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, radius * (0.4 + random()), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
