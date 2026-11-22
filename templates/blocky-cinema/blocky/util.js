// Small helpers shared by the Blocky engine. Everything here is pure or cached: no clocks, no Math.random.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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

/**
 * A plastic-like toy material. Same color and options → the same material object. `map` paints it, `bumpMap`
 * (with `bumpScale`) gives its surface relief that catches the light (wood grain, siding, shingles).
 */
export function paint(color, options = {}) {
  const { map, bumpMap, ...rest } = options;
  const key = `${color}|${map ? map.uuid : ""}|${bumpMap ? bumpMap.uuid : ""}|${JSON.stringify(rest)}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.62,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ?? "#000000",
      emissiveIntensity: options.emissiveIntensity ?? 1,
      map: map ?? null,
      bumpMap: bumpMap ?? null,
      bumpScale: options.bumpScale ?? 1,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
    });
    materials.set(key, material);
  }
  return material;
}

/**
 * Merges a built piece's meshes that share a material (and shadow settings) into one mesh each: a detailed house
 * draws in a few calls instead of dozens. Meshes marked for the Places sheet (`userData.kind`), kept on purpose
 * (`userData.keep`), animated pieces' parts, instanced meshes and meshes with several materials stay as they are.
 */
export function freeze(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    if (o.userData.kind || o.userData.keep || o.visible === false) return;
    for (let p = o.parent; p && p !== root.parent; p = p.parent) {
      if (p.userData.kind || p.userData.keep) return;
    }
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      let geometry = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const kept = new THREE.BufferGeometry();
      kept.setAttribute("position", geometry.getAttribute("position"));
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      kept.setAttribute("normal", geometry.getAttribute("normal"));
      const count = geometry.getAttribute("position").count;
      kept.setAttribute(
        "uv",
        geometry.getAttribute("uv") ?? new THREE.BufferAttribute(new Float32Array(count * 2), 2),
      );
      geometry = kept;
      geometry.applyMatrix4(inverse.clone().multiply(m.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(parts, false);
    if (!merged) continue;
    const first = meshes[0];
    const one = new THREE.Mesh(merged, first.material);
    one.castShadow = first.castShadow;
    one.receiveShadow = first.receiveShadow;
    for (const m of meshes) m.removeFromParent();
    root.add(one);
  }
  return root;
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
