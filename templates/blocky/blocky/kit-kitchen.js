// The kitchen: a run of counters (cabinets, a granite top, a sink, a stove, a tiled backsplash, wall cabinets with
// a light under them), a fridge and a pendant lamp. Sizes come from shapes.js; `ctx` is { lit, night, sky }.
import * as THREE from "three";
import { glowing, group, part, tiledBox, tiledPlane } from "./kit-parts.js";
import { granite, tiles } from "./textures.js";
import { cachedGeometry, paint, roundedBox } from "./util.js";

/**
 * Counters `w` long against a wall (their back at −z): base cabinets with doors, a granite top, the sink at `sink`
 * and the stove at `stove` (x along them), a tiled backsplash, and wall cabinets over `uppers` ([from, to]).
 */
export function counter(p, ctx) {
  const w = p.w ?? 16;
  const cabinet = paint(p.color ?? "#e9e4d8", { roughness: 0.5 });
  const front = paint(p.front ?? "#dcd5c6", { roughness: 0.45 });
  const top = paint("#ffffff", { ...granite("#d9d4cc", [1, 1]), roughness: 0.35, bumpScale: 0.6 });
  const steel = paint("#c9ccd2", { roughness: 0.25, metalness: 0.8 });
  const dark = paint("#1e2026", { roughness: 0.35 });
  const g = group(
    part(
      new THREE.BoxGeometry(w, 0.35, 1.6),
      paint("#3a3a40", { roughness: 0.8 }),
      0,
      0.175,
      -0.05,
    ),
    part(new THREE.BoxGeometry(w, 2.0, 1.8), cabinet, 0, 1.35, 0),
    part(tiledBox(w + 0.1, 0.3, 1.95, 3), top, 0, 2.5, 0.02),
    part(
      tiledPlane(w, 1.6, 2),
      paint("#ffffff", { ...tiles("#e9eef0", null, [1, 1], 6), roughness: 0.3, bumpScale: 1 }),
      0,
      3.45,
      -0.93,
      { cast: false },
    ),
  );
  const stove = p.stove;
  const n = Math.floor(w / 2);
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + 1 + k * 2;
    if (stove !== undefined && Math.abs(x - stove) < 1.5) continue;
    g.add(part(new THREE.BoxGeometry(1.85, 1.75, 0.08), front, x, 1.35, 0.93));
    g.add(
      part(new THREE.BoxGeometry(0.1, 0.55, 0.12), steel, x + (k % 2 ? -0.62 : 0.62), 1.85, 1.0),
    );
  }
  if (p.sink !== undefined) {
    g.add(part(new THREE.BoxGeometry(2.4, 0.04, 1.3), steel, p.sink, 2.67, 0));
    g.add(
      part(
        new THREE.BoxGeometry(2.0, 0.05, 1.0),
        paint("#8f949c", { roughness: 0.3, metalness: 0.7 }),
        p.sink,
        2.68,
        0.02,
      ),
    );
    g.add(part(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 10), steel, p.sink, 3.1, -0.7));
    g.add(part(new THREE.BoxGeometry(0.14, 0.14, 0.75), steel, p.sink, 3.5, -0.38));
  }
  if (stove !== undefined) {
    g.add(part(new THREE.BoxGeometry(2.6, 0.06, 1.6), dark, stove, 2.69, 0));
    const ring = cachedGeometry("burner", () =>
      new THREE.TorusGeometry(0.32, 0.05, 6, 20).rotateX(Math.PI / 2),
    );
    for (const dx of [-0.6, 0.6]) {
      for (const dz of [-0.4, 0.4])
        g.add(part(ring, paint("#4a4d55", { roughness: 0.5 }), stove + dx, 2.74, dz));
    }
    g.add(part(new THREE.BoxGeometry(2.5, 1.75, 0.1), dark, stove, 1.35, 0.95));
    g.add(
      part(
        new THREE.BoxGeometry(1.7, 0.75, 0.03),
        paint("#3e4a56", { roughness: 0.08, metalness: 0.4 }),
        stove,
        1.4,
        1.01,
      ),
    );
    g.add(part(new THREE.BoxGeometry(1.9, 0.1, 0.12), steel, stove, 2.05, 1.06));
    for (let k = 0; k < 4; k++) {
      const knob = part(
        new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10),
        steel,
        stove - 0.9 + k * 0.6,
        2.25,
        0.99,
      );
      knob.rotation.x = Math.PI / 2;
      g.add(knob);
    }
    // A kettle on the stove, a jar of spoons beside it.
    g.add(
      part(
        new THREE.SphereGeometry(0.42, 14, 10),
        paint("#e8344e", { roughness: 0.3, metalness: 0.2 }),
        stove - 0.6,
        3.05,
        -0.4,
      ),
    );
    g.add(
      part(
        new THREE.CylinderGeometry(0.22, 0.2, 0.55, 10),
        paint("#f2efe6", { roughness: 0.4 }),
        stove - 2.2,
        2.93,
        -0.5,
      ),
    );
  }
  for (const [a, b] of p.uppers ?? []) {
    const mid = (a + b) / 2;
    const len = b - a;
    g.add(part(new THREE.BoxGeometry(len, 2.8, 1.2), cabinet, mid, 7.4, -0.35));
    const doors = Math.max(1, Math.round(len / 2));
    for (let k = 0; k < doors; k++) {
      const x = a + (k + 0.5) * (len / doors);
      g.add(part(new THREE.BoxGeometry(len / doors - 0.12, 2.6, 0.08), front, x, 7.4, 0.27));
      g.add(
        part(new THREE.BoxGeometry(0.1, 0.5, 0.12), steel, x + (k % 2 ? -0.6 : 0.6), 6.5, 0.33),
      );
    }
    g.add(
      part(
        new THREE.BoxGeometry(len - 0.4, 0.06, 0.25),
        ctx.lit ? glowing("#fff2d0", 1.6) : paint("#f4f1ea"),
        mid,
        5.97,
        0.05,
        { cast: false },
      ),
    );
  }
  return g;
}

export function fridge(p) {
  const body = paint(p.color ?? "#e9eef2", { roughness: 0.25, metalness: 0.25 });
  const steel = paint("#c9ccd2", { roughness: 0.25, metalness: 0.8 });
  const g = group(
    part(roundedBox(2.8, 5.6, 2.2, 0.15), body, 0, 2.8, 0),
    part(new THREE.BoxGeometry(2.7, 0.05, 0.05), paint("#9aa0aa"), 0, 3.9, 1.11),
    part(new THREE.BoxGeometry(0.12, 1.0, 0.15), steel, 1.05, 4.5, 1.16),
    part(new THREE.BoxGeometry(0.12, 1.6, 0.15), steel, 1.05, 2.9, 1.16),
  );
  // Magnets and a child's drawing.
  for (const [x, y, color] of [
    [-0.7, 4.9, "#e8344e"],
    [-0.2, 4.6, "#f4c542"],
    [0.3, 4.8, "#3b5dc9"],
  ]) {
    g.add(part(new THREE.BoxGeometry(0.18, 0.18, 0.06), paint(color), x, y, 1.12, { cast: false }));
  }
  g.add(
    part(
      new THREE.PlaneGeometry(0.9, 1.1),
      paint("#fbf8f1", { roughness: 0.8 }),
      -0.3,
      2.6,
      1.115,
      { cast: false },
    ),
  );
  return g;
}

/** A lamp hanging from the ceiling (the piece's y is the ceiling), `drop` down, lit when the lamps are on. */
export function pendant(p, ctx) {
  const drop = p.drop ?? 3;
  const shade = paint(p.color ?? "#2f4a3a", { roughness: 0.5, side: THREE.DoubleSide });
  return group(
    part(new THREE.CylinderGeometry(0.03, 0.03, drop, 6), paint("#1e2026"), 0, -drop / 2, 0, {
      cast: false,
    }),
    part(
      cachedGeometry("pendantShade", () => new THREE.ConeGeometry(1.1, 0.9, 24, 1, true)),
      shade,
      0,
      -drop - 0.35,
      0,
    ),
    part(
      cachedGeometry("pendantBulb", () => new THREE.SphereGeometry(0.28, 12, 8)),
      ctx.lit ? glowing("#fff0c8", 3) : paint("#f4f1ea", { roughness: 0.2 }),
      0,
      -drop - 0.7,
      0,
      { cast: false },
    ),
  );
}
