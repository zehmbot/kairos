// Gardens and parks: full round trees, bushes (with flowers), flower beds, picket and wooden fences, rocks, a pond,
// a picnic table, a sandbox, a trampoline, a barbecue, garden chairs and a garden table. Sizes come from shapes.js.
import * as THREE from "three";
import { group, kind, part, tiledBox, trim } from "./kit-parts.js";
import { bushSpec, treeSpec } from "./shapes.js";
import { meters, SEAT_HEIGHT } from "./sizes.js";
import { bark, leaves, planks, sand, stone } from "./textures.js";
import { cachedGeometry, paint, rng } from "./util.js";

const GREENS = ["#4f9e4f", "#5aa957", "#468f48", "#63b35c", "#3f8a4a"];
const FLOWERS = ["#e8344e", "#f4c542", "#ffffff", "#e86a8a", "#b46ee0", "#ff8a3a"];

/** A lumpy ball (a clump of leaves, a rock): an icosahedron nudged out of round, one of a few shapes. */
function lump(variant, detail = 2, amount = 0.12) {
  return cachedGeometry(`lump:${variant}:${detail}:${amount}`, () => {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const pos = geometry.getAttribute("position");
    const random = rng(`lump${variant}`);
    const bumps = Array.from({ length: 6 }, () => [random() * 6, random() * 6, random() * 6]);
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      let k = 1;
      for (const [a, b, c] of bumps)
        k += Math.sin(v.x * 3 + a) * Math.sin(v.y * 3 + b) * Math.sin(v.z * 3 + c) * amount;
      v.multiplyScalar(k);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
}

const leafPaint = (color) =>
  paint("#ffffff", { ...leaves(color, [2, 2]), roughness: 0.85, bumpScale: 2.2 });

export function tree(p) {
  const t = treeSpec(p);
  const random = rng(`treekit${p.seed ?? 0}`);
  const color = t.color ?? GREENS[Math.floor(random() * GREENS.length)];
  const trunk = paint("#ffffff", { ...bark("#7a5638", [1, 2]), roughness: 0.9, bumpScale: 2 });
  const g = group(
    part(
      new THREE.CylinderGeometry(t.trunkR * 0.65, t.trunkR, t.trunkH + 2 * t.s, 9),
      trunk,
      0,
      (t.trunkH + 2 * t.s) / 2,
      0,
    ),
  );
  // Two branches reaching into the crown.
  for (let b = 0; b < 2; b++) {
    const a = random() * Math.PI * 2;
    const branch = part(
      new THREE.CylinderGeometry(0.15 * t.s, 0.3 * t.s, 3.2 * t.s, 6),
      trunk,
      Math.cos(a) * 0.8 * t.s,
      t.trunkH + 0.6 * t.s,
      Math.sin(a) * 0.8 * t.s,
    );
    branch.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    g.add(branch);
  }
  const foliage = leafPaint(color);
  t.clumps.forEach((c, i) => {
    const m = part(lump((p.seed ?? 0) + i, 2, 0.1), foliage, c.x, c.y, c.z);
    m.scale.set(c.r, c.r * 0.88, c.r);
    m.rotation.y = random() * 6;
    g.add(m);
  });
  return g;
}

export function bush(p) {
  const b = bushSpec(p);
  const random = rng(`bushkit${p.seed ?? 0}`);
  const color = p.color ?? GREENS[Math.floor(random() * GREENS.length)];
  const g = group();
  const foliage = leafPaint(color);
  b.clumps.forEach((c, i) => {
    const m = part(lump(`b${(p.seed ?? 0) + i}`, 1, 0.12), foliage, c.x, c.y, c.z);
    m.scale.set(c.r, c.r * 0.82, c.r);
    g.add(m);
  });
  if (b.flowers) {
    const petal = paint(b.flowers, { roughness: 0.6 });
    const bloom = cachedGeometry("bloom", () => new THREE.IcosahedronGeometry(0.2, 0));
    for (const c of b.clumps) {
      for (let k = 0; k < 7; k++) {
        const a = random() * Math.PI * 2;
        const up = 0.25 + random() * 0.7;
        const r = Math.sqrt(1 - up * up) * c.r;
        g.add(
          part(bloom, petal, c.x + Math.cos(a) * r, c.y + up * c.r * 0.82, c.z + Math.sin(a) * r, {
            cast: false,
          }),
        );
      }
    }
  }
  return g;
}

export function flowerBed(p) {
  const w = p.w ?? 6;
  const d = p.d ?? 1.8;
  const random = rng(`bed${p.seed ?? 0}`);
  const edge = paint("#ffffff", { ...stone("#a8a49a"), roughness: 0.9 });
  const g = group(
    part(new THREE.BoxGeometry(w, 0.5, 0.3), edge, 0, 0.25, d / 2 - 0.15),
    part(new THREE.BoxGeometry(w, 0.5, 0.3), edge, 0, 0.25, -d / 2 + 0.15),
    part(new THREE.BoxGeometry(0.3, 0.5, d), edge, w / 2 - 0.15, 0.25, 0),
    part(new THREE.BoxGeometry(0.3, 0.5, d), edge, -w / 2 + 0.15, 0.25, 0),
    part(
      new THREE.BoxGeometry(w - 0.5, 0.4, d - 0.5),
      paint("#4a3426", { roughness: 1 }),
      0,
      0.2,
      0,
      { cast: false },
    ),
  );
  const colors = p.colors ?? [
    FLOWERS[Math.floor(random() * FLOWERS.length)],
    FLOWERS[Math.floor(random() * FLOWERS.length)],
  ];
  const leaf = paint("#3f8a3e", { roughness: 0.8 });
  const blob = cachedGeometry("flowerLeaf", () => new THREE.IcosahedronGeometry(0.32, 0));
  const head = cachedGeometry("flowerHead", () => new THREE.IcosahedronGeometry(0.2, 1));
  const count = Math.round((w * d) / 0.55);
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * (w - 0.8);
    const z = (random() - 0.5) * (d - 0.8);
    g.add(part(blob, leaf, x, 0.55, z, { cast: false }));
    g.add(
      part(
        head,
        paint(colors[i % colors.length], { roughness: 0.6 }),
        x + 0.05,
        0.85 + random() * 0.2,
        z,
        { cast: false },
      ),
    );
  }
  return g;
}

/** A straight fence (built in the place: its `from` and `to` are place coordinates), open at its gaps. */
export function fence(p) {
  const privacy = p.style === "privacy";
  const tall = privacy ? meters(1.8) : meters(0.9);
  const [ax, az] = p.from;
  const [bx, bz] = p.to;
  const length = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / length;
  const uz = (bz - az) / length;
  const rot = -Math.atan2(uz, ux);
  const cuts = (p.gaps ?? [])
    .map(([at, width]) => [at - width / 2, at + width / 2])
    .sort((a, b) => a[0] - b[0]);
  const runs = [];
  let start = 0;
  for (const [a, b] of cuts) {
    if (a > start + 0.2) runs.push([start, a]);
    start = Math.max(start, b);
  }
  if (length > start + 0.2) runs.push([start, length]);
  const g = group();
  const white = privacy
    ? paint("#ffffff", {
        ...planks("#9a7350", [1, 1], { count: 8, across: false }),
        roughness: 0.8,
        bumpScale: 1.5,
      })
    : trim();
  const post = privacy ? paint("#7a5a40", { roughness: 0.8 }) : trim();
  const picket = cachedGeometry("picket", () => {
    const shape = new THREE.Shape();
    const h = meters(0.9);
    shape.moveTo(-0.19, 0);
    shape.lineTo(0.19, 0);
    shape.lineTo(0.19, h - 0.3);
    shape.lineTo(0, h);
    shape.lineTo(-0.19, h - 0.3);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }).translate(
      0,
      0,
      -0.05,
    );
  });
  for (const [a, b] of runs) {
    const run = group();
    const len = b - a;
    const mid = (a + b) / 2;
    run.position.set(ax + ux * mid, 0, az + uz * mid);
    run.rotation.y = rot;
    const posts = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= posts; k++) {
      run.add(
        part(
          new THREE.BoxGeometry(0.4, tall + 0.25, 0.4),
          post,
          -len / 2 + (k * len) / posts,
          (tall + 0.25) / 2,
          0,
        ),
      );
    }
    if (privacy) {
      run.add(part(tiledBox(len, tall, 0.22, 4), white, 0, tall / 2, 0));
      run.add(part(new THREE.BoxGeometry(len, 0.2, 0.4), post, 0, tall + 0.1, 0));
    } else {
      for (const y of [0.7, tall - 0.6])
        run.add(part(new THREE.BoxGeometry(len, 0.22, 0.12), white, 0, y, -0.14));
      const count = Math.max(1, Math.floor(len / 0.6));
      for (let k = 0; k < count; k++)
        run.add(
          part(picket, white, -len / 2 + 0.3 + (k * (len - 0.6)) / Math.max(1, count - 1), 0, 0.02),
        );
    }
    g.add(run);
  }
  return g;
}

export function rock(p) {
  const s = p.size ?? 1.2;
  const m = part(
    lump(`rock${p.seed ?? 0}`, 1, 0.18),
    paint("#ffffff", { ...stone("#9a9aa2"), roughness: 0.95, bumpScale: 2 }),
    0,
    s * 0.35,
    0,
  );
  m.scale.set(s * 0.9, s * 0.42, s * 0.75);
  return group(m);
}

export function pond(p) {
  const r = p.r ?? 5;
  const random = rng(`pond${p.seed ?? 0}`);
  const water = part(
    cachedGeometry(`pondWater:${r}`, () => new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2)),
    paint("#2f6f7a", { roughness: 0.06, metalness: 0.3 }),
    0,
    0.06,
    0,
    { cast: false },
  );
  water.scale.set(1.05, 1, 0.8);
  const mud = part(
    cachedGeometry(`pondRim:${r}`, () =>
      new THREE.RingGeometry(r * 0.95, r * 1.08, 40).rotateX(-Math.PI / 2),
    ),
    paint("#6b5a40", { roughness: 1 }),
    0,
    0.04,
    0,
    { cast: false },
  );
  mud.scale.set(1.05, 1, 0.8);
  const g = group(water, mud);
  const rockPaint = paint("#ffffff", { ...stone("#8e8e96"), roughness: 0.95, bumpScale: 2 });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + random() * 0.2;
    const s = 0.5 + random() * 0.45;
    const m = part(
      lump(`pr${k}`, 1, 0.2),
      rockPaint,
      Math.cos(a) * r * 1.05 * 1.03,
      s * 0.3,
      Math.sin(a) * r * 0.8 * 1.03,
    );
    m.scale.set(s, s * 0.6, s * 0.8);
    g.add(m);
  }
  const pad = paint("#4f9e4f", { roughness: 0.6 });
  for (let k = 0; k < 5; k++) {
    const a = random() * Math.PI * 2;
    const d = random() * r * 0.6;
    g.add(
      part(
        cachedGeometry("lilyPad", () =>
          new THREE.CircleGeometry(0.55, 12, 0.4, Math.PI * 1.8).rotateX(-Math.PI / 2),
        ),
        pad,
        Math.cos(a) * d,
        0.08,
        Math.sin(a) * d * 0.8,
        { cast: false },
      ),
    );
  }
  const reed = paint("#5d7d3a", { roughness: 0.8 });
  for (let k = 0; k < 14; k++) {
    const a = 0.6 + random() * 0.9;
    const h = 1.2 + random() * 1.2;
    g.add(
      part(
        cachedGeometry(
          `reed:${Math.round(h * 4)}`,
          () => new THREE.CylinderGeometry(0.03, 0.06, h, 4),
        ),
        reed,
        Math.cos(a) * r * 0.95,
        h / 2,
        Math.sin(a) * r * 0.75,
      ),
    );
  }
  return g;
}

export function picnicTable() {
  const wood = paint("#ffffff", {
    ...planks("#a8744a", [1, 1], { count: 5 }),
    roughness: 0.75,
    bumpScale: 1.5,
  });
  const top = 1.9;
  const g = group(
    part(tiledBox(7, 0.3, 3, 3), wood, 0, top - 0.15, 0),
    kind(part(tiledBox(7, 0.3, 1.2, 3), wood, 0, SEAT_HEIGHT - 0.15, 2.6), "seat"),
    kind(part(tiledBox(7, 0.3, 1.2, 3), wood, 0, SEAT_HEIGHT - 0.15, -2.6), "seat"),
  );
  for (const x of [-2.8, 2.8]) {
    for (const side of [-1, 1]) {
      const leg = part(new THREE.BoxGeometry(0.3, 2.6, 0.3), wood, x, top / 2 - 0.1, side * 1.3);
      leg.rotation.x = side * 0.55;
      g.add(leg);
    }
    g.add(part(new THREE.BoxGeometry(0.3, 0.25, 6.2), wood, x, SEAT_HEIGHT - 0.42, 0));
  }
  // The whole table (floor to top) is what the Places sheet measures.
  return kind(g, "table");
}

export function sandbox(p) {
  const w = p.w ?? 8;
  const d = p.d ?? 6;
  const wood = paint("#ffffff", {
    ...planks("#b07a4a", [1, 1], { count: 3 }),
    roughness: 0.75,
    bumpScale: 1.5,
  });
  const g = group(
    part(tiledBox(w, 0.6, 0.5, 3), wood, 0, 0.3, -d / 2 + 0.25),
    part(tiledBox(w, 0.6, 0.5, 3), wood, 0, 0.3, d / 2 - 0.25),
    part(tiledBox(0.5, 0.6, d, 3), wood, -w / 2 + 0.25, 0.3, 0),
    part(tiledBox(0.5, 0.6, d, 3), wood, w / 2 - 0.25, 0.3, 0),
    part(
      tiledBox(w - 1, 0.3, d - 1, 3),
      paint("#ffffff", { ...sand("#e8d29a", [1, 1]), roughness: 1, bumpScale: 1.5 }),
      0,
      0.15,
      0,
      { cast: false },
    ),
  );
  // A bucket and a spade left in the sand.
  const bucket = part(
    new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12),
    paint("#e8344e", { roughness: 0.4 }),
    1.6,
    0.65,
    0.8,
  );
  const spade = part(
    new THREE.BoxGeometry(0.12, 0.12, 1.4),
    paint("#3b5dc9", { roughness: 0.4 }),
    -1.4,
    0.42,
    -0.6,
  );
  spade.rotation.y = 0.6;
  g.add(bucket, spade);
  return g;
}

export function trampoline(p) {
  const r = p.r ?? 4.4;
  const steel = paint("#8c929c", { roughness: 0.35, metalness: 0.7 });
  const g = group(
    part(
      cachedGeometry(`trampFrame:${r}`, () =>
        new THREE.TorusGeometry(r, 0.15, 6, 40).rotateX(Math.PI / 2),
      ),
      steel,
      0,
      2.35,
      0,
    ),
    part(
      cachedGeometry(`trampPad:${r}`, () =>
        new THREE.TorusGeometry(r - 0.45, 0.32, 8, 40).rotateX(Math.PI / 2),
      ),
      paint("#3b8fd6", { roughness: 0.5 }),
      0,
      2.45,
      0,
    ),
    part(
      cachedGeometry(`trampMat:${r}`, () =>
        new THREE.CircleGeometry(r - 0.6, 40).rotateX(-Math.PI / 2),
      ),
      paint("#1c1d22", { roughness: 0.7, side: THREE.DoubleSide }),
      0,
      2.42,
      0,
    ),
  );
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.add(
      part(
        new THREE.CylinderGeometry(0.12, 0.12, 2.35, 6),
        steel,
        Math.cos(a) * r,
        1.17,
        Math.sin(a) * r,
      ),
    );
  }
  return g;
}

export function grill() {
  const black = paint("#1e2026", { roughness: 0.35, metalness: 0.4 });
  const steel = paint("#8c929c", { roughness: 0.35, metalness: 0.7 });
  const g = group(
    part(
      new THREE.SphereGeometry(0.95, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      black,
      0,
      2.2,
      0,
    ),
    part(
      new THREE.SphereGeometry(0.97, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2),
      black,
      0,
      2.25,
      0,
    ),
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), steel, 0, 3.25, 0),
    part(new THREE.BoxGeometry(0.9, 0.08, 0.6), steel, 1.2, 1.9, 0),
  );
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = part(
      new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6),
      steel,
      Math.cos(a) * 0.55,
      0.8,
      Math.sin(a) * 0.55,
    );
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    g.add(leg);
  }
  return g;
}

export function gardenChair(p) {
  const wood = paint(p.color ?? "#f2efe6", { roughness: 0.6 });
  const g = group(
    kind(part(new THREE.BoxGeometry(2, 0.25, 2), wood, 0, SEAT_HEIGHT - 0.12, 0), "seat"),
  );
  const back = part(new THREE.BoxGeometry(2, 2.1, 0.22), wood, 0, SEAT_HEIGHT + 1, -0.85);
  back.rotation.x = -0.2;
  g.add(back);
  for (const x of [-0.9, 0.9]) {
    g.add(part(new THREE.BoxGeometry(0.22, 0.2, 2.1), wood, x, SEAT_HEIGHT + 0.75, 0.05));
    g.add(
      part(
        new THREE.BoxGeometry(0.2, SEAT_HEIGHT + 0.75, 0.2),
        wood,
        x,
        (SEAT_HEIGHT + 0.75) / 2,
        0.9,
      ),
    );
    g.add(
      part(
        new THREE.BoxGeometry(0.2, SEAT_HEIGHT - 0.25, 0.2),
        wood,
        x,
        (SEAT_HEIGHT - 0.25) / 2,
        -0.85,
      ),
    );
  }
  return g;
}

export function patioTable() {
  const top = paint("#cfc8b8", { roughness: 0.7 });
  const table = group(
    part(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 24), top, 0, 1.9, 0),
    part(
      new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8),
      paint("#4a4f57", { metalness: 0.5, roughness: 0.4 }),
      0,
      0.9,
      0,
    ),
    part(
      new THREE.CylinderGeometry(0.7, 0.8, 0.15, 16),
      paint("#4a4f57", { metalness: 0.5, roughness: 0.4 }),
      0,
      0.08,
      0,
    ),
  );
  // The whole table (floor to top) is what the Places sheet measures.
  return kind(table, "table");
}
