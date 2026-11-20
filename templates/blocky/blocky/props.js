// Furniture, buildings, nature and small objects, all from softened boxes and simple shapes.
// Every builder returns a THREE.Group standing on y = 0 (unless said otherwise). Furniture fits the figures (see
// sizes.js): seats at their knee height, tables and doors at real sizes. `userData.kind` marks what the Places
// sheet checks ("door", "table", "seat").

/** Marks a piece for the Places sheet's size checks. */
const kind = (object, name) => {
  object.userData.kind = name;
  return object;
};

import * as THREE from "three";
import { BED_HEIGHT, meters, SEAT_HEIGHT } from "./sizes.js";
import { block, cachedGeometry, canvasTexture, mesh, paint, rng, roundedBox } from "./util.js";

const group = (...children) => {
  const g = new THREE.Group();
  for (const child of children) g.add(child);
  return g;
};

/** Something that glows (lamp shades, screens, windows at night). Not lit, never casts shadows. */
export const glow = (color, intensity = 1) =>
  new THREE.MeshStandardMaterial({
    color: "#000000",
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 1,
  });

// ---------- Home ----------

export function sofa(color = "#4f7f8a", width = 9) {
  const cushion = paint(color, { roughness: 0.9 });
  const frame = paint(new THREE.Color(color).multiplyScalar(0.8).getStyle(), { roughness: 0.9 });
  // The seat cushion's top is at the figures' knee height.
  const seat = SEAT_HEIGHT;
  const g = group(
    block(width, seat - 0.38, 3.4, null, 0, 0.12, 0, { material: frame, radius: 0.18 }),
    kind(
      block(width - 1.8, 0.3, 3.0, null, 0, seat - 0.3, 0.15, { material: cushion, radius: 0.15 }),
      "seat",
    ),
    block(width, 2.5, 1.0, null, 0, 0.12, -1.2, { material: frame, radius: 0.25 }),
    block(1.0, seat + 0.9, 3.4, null, -width / 2 + 0.5, 0.12, 0, { material: frame, radius: 0.25 }),
    block(1.0, seat + 0.9, 3.4, null, width / 2 - 0.5, 0.12, 0, { material: frame, radius: 0.25 }),
  );
  for (const x of [-width / 4, width / 4]) {
    g.add(
      block(width / 2 - 1.1, 1.6, 0.6, null, x, seat, -0.6, { material: cushion, radius: 0.25 }),
    );
  }
  for (const x of [-width / 2 + 0.4, width / 2 - 0.4]) {
    for (const z of [-1.4, 1.4]) g.add(block(0.3, 0.12, 0.3, "#3a2a20", x, 0, z));
  }
  return g;
}

/** A plain chair (desks, tables): its seat at the figures' knee height. */
export function chair(color = "#8b5a35") {
  const wood = paint(color, { roughness: 0.55 });
  const seat = SEAT_HEIGHT;
  const g = group(
    kind(block(1.9, 0.2, 1.9, null, 0, seat - 0.2, 0, { material: wood, radius: 0.06 }), "seat"),
    block(1.9, 2.2, 0.2, null, 0, seat, -0.85, { material: wood, radius: 0.06 }),
  );
  for (const x of [-0.8, 0.8]) {
    for (const z of [-0.8, 0.8])
      g.add(block(0.2, seat - 0.2, 0.2, null, x, 0, z, { material: wood }));
  }
  return g;
}

/** A table `h` units high (a desk: 2.2, 75 cm; a coffee table: 1.35, 46 cm). */
export function table(w = 5, d = 2.4, h = 1.35, color = "#8b5a35") {
  const wood = paint(color, { roughness: 0.55 });
  const g = group(block(w, 0.3, d, null, 0, h - 0.3, 0, { material: wood, radius: 0.08 }));
  for (const x of [-w / 2 + 0.35, w / 2 - 0.35]) {
    for (const z of [-d / 2 + 0.35, d / 2 - 0.35])
      g.add(block(0.3, h - 0.3, 0.3, null, x, 0, z, { material: wood }));
  }
  return kind(g, "table");
}

export function floorLamp(on, color = "#ffd59a") {
  const g = group(
    block(1.2, 0.2, 1.2, "#2b2b30", 0, 0, 0),
    block(0.18, 5.6, 0.18, "#2b2b30", 0, 0.2, 0),
  );
  const shade = mesh(
    cachedGeometry("shade", () => new THREE.CylinderGeometry(0.8, 1.2, 1.4, 20, 1, true)),
    on ? glow(color, 1.6) : paint("#f0e2c8", { side: THREE.DoubleSide }),
    { cast: false },
  );
  shade.position.y = 6.2;
  g.add(shade);
  return g;
}

export function tableLamp(on) {
  const g = group(
    block(0.6, 0.15, 0.6, "#c9a36a", 0, 0, 0),
    block(0.15, 1.0, 0.15, "#c9a36a", 0, 0.15, 0),
  );
  const shade = mesh(
    cachedGeometry("smallShade", () => new THREE.CylinderGeometry(0.45, 0.65, 0.8, 18, 1, true)),
    on ? glow("#ffd59a", 1.6) : paint("#f0e2c8", { side: THREE.DoubleSide }),
    { cast: false },
  );
  shade.position.y = 1.45;
  g.add(shade);
  return g;
}

/** A bed: the mattress top at `BED_HEIGHT` (low, so a figure sitting on its edge nearly reaches the floor). */
export function bed(color = "#e46a6a") {
  const wood = paint("#9a6a42", { roughness: 0.6 });
  const top = BED_HEIGHT;
  return group(
    block(5.4, top - 0.9, 9.4, null, 0, 0.15, 0, { material: wood, radius: 0.12 }),
    block(5.6, 3.2, 0.6, null, 0, 0, -4.6, { material: wood, radius: 0.15 }),
    block(5.0, 0.8, 9.0, "#f4f1ea", 0, top - 0.8, 0, { radius: 0.25 }),
    block(5.2, 0.45, 6.0, color, 0, top - 0.25, 1.5, { radius: 0.2, roughness: 0.95 }),
    block(3.4, 0.55, 1.6, "#ffffff", 0, top - 0.05, -3.4, { radius: 0.3, roughness: 0.95 }),
  );
}

export function nightstand() {
  return group(
    block(2, 2, 1.8, "#b88a5a", 0, 0, 0, { radius: 0.1 }),
    block(1.6, 0.1, 0.05, "#7a5638", 0, 1.3, 0.9),
  );
}

export function plant() {
  const leaf = paint("#3f9a52", { roughness: 0.7 });
  const g = group(block(1.2, 1.2, 1.2, "#c4643c", 0, 0, 0, { radius: 0.15 }));
  const random = rng("plant");
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = mesh(roundedBox(0.5, 1.6, 0.25, 0.12), leaf);
    m.position.set(Math.cos(a) * 0.3, 1.9 + random() * 0.4, Math.sin(a) * 0.3);
    m.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
    g.add(m);
  }
  return g;
}

export function shelf() {
  const wood = paint("#7a5638");
  const g = group(block(4, 6, 1.4, null, 0, 0, 0, { material: wood, radius: 0.08 }));
  const colors = ["#e8344e", "#3b5dc9", "#f4c542", "#38b764", "#ef7d57", "#5d275d"];
  const random = rng("books");
  for (let row = 0; row < 3; row++) {
    g.add(block(3.6, 0.12, 1.2, "#5e412b", 0, 0.5 + row * 1.8, 0.12));
    let x = -1.6;
    while (x < 1.4) {
      const w = 0.22 + random() * 0.2;
      const h = 0.9 + random() * 0.5;
      g.add(
        block(
          w,
          h,
          0.9,
          colors[Math.floor(random() * colors.length)],
          x + w / 2,
          0.62 + row * 1.8,
          0.15,
          { radius: 0.03 },
        ),
      );
      x += w + 0.04;
    }
  }
  return g;
}

export function tv(on) {
  const g = group(
    block(5, 1.6, 1.4, "#3a2a20", 0, 0, 0, { radius: 0.1 }),
    block(4.6, 2.7, 0.25, "#16161c", 0, 1.9, 0, { radius: 0.08 }),
  );
  const screen = mesh(
    new THREE.PlaneGeometry(4.3, 2.4),
    on ? glow("#6fa8dc", 0.8) : paint("#0b0b10", { roughness: 0.2 }),
    { cast: false },
  );
  screen.position.set(0, 3.25, 0.14);
  g.add(screen);
  return g;
}

export function picture(w, h, seed) {
  const texture = canvasTexture(`art:${seed}`, 128, (ctx, s) => {
    const random = rng(seed);
    const palette = ["#ef7d57", "#ffcd75", "#41a6f6", "#38b764", "#b13e53", "#73eff7"];
    ctx.fillStyle = palette[Math.floor(random() * palette.length)];
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      ctx.beginPath();
      ctx.arc(random() * s, random() * s, 15 + random() * 35, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const g = group(block(w + 0.3, h + 0.3, 0.15, "#f4f4f4", 0, 0, 0, { radius: 0.04 }));
  const art = mesh(new THREE.PlaneGeometry(w, h), paint("#ffffff", { map: texture }), {
    cast: false,
  });
  art.position.set(0, (h + 0.3) / 2, 0.09);
  g.add(art);
  return g;
}

/** A window: frame plus a glowing pane showing the sky outside. */
export function windowPane(w, h, skyColor, intensity = 1) {
  const frame = paint("#f4f4f4");
  const pane = mesh(new THREE.PlaneGeometry(w, h), glow(skyColor, intensity), { cast: false });
  pane.position.set(0, h / 2, 0.02);
  return group(
    pane,
    block(w + 0.5, 0.3, 0.4, null, 0, -0.3, 0.1, { material: frame }),
    block(w + 0.5, 0.3, 0.4, null, 0, h, 0.1, { material: frame }),
    block(0.3, h, 0.4, null, -w / 2 - 0.1, 0, 0.1, { material: frame }),
    block(0.3, h, 0.4, null, w / 2 + 0.1, 0, 0.1, { material: frame }),
    block(0.18, h, 0.3, null, 0, 0, 0.1, { material: frame }),
    block(w, 0.18, 0.3, null, 0, h / 2, 0.1, { material: frame }),
  );
}

/** A door: 2.1 m by 90 cm. */
export function door(color = "#8b5a35") {
  return kind(
    group(
      block(meters(0.9), meters(2.1), 0.3, color, 0, 0, 0, { radius: 0.06 }),
      block(0.25, 0.25, 0.3, "#e0b84a", meters(0.9) / 2 - 0.4, meters(1.0), 0.2),
    ),
    "door",
  );
}

export function rug(w, d, colors) {
  const texture = canvasTexture(`rug:${colors.join()}`, 256, (ctx, s) => {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = 14;
    ctx.strokeRect(18, 18, s - 36, s - 36);
    ctx.lineWidth = 6;
    ctx.strokeRect(44, 44, s - 88, s - 88);
  });
  const m = mesh(new THREE.PlaneGeometry(w, d), paint("#ffffff", { map: texture, roughness: 1 }), {
    cast: false,
  });
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

// ---------- School ----------

export function lockerTexture() {
  return canvasTexture("locker", 256, (ctx, s) => {
    ctx.fillStyle = "#c8323a";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 4; i++) ctx.fillRect(60, 30 + i * 14, 136, 6);
    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(186, 120, 16, 44);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, 0, 10, s);
  });
}

// ---------- Outdoors ----------

/** A round, blocky tree (summer). */
export function tree(seed, scale = 1) {
  const random = rng(seed);
  const green = ["#3f9a52", "#4caf5c", "#358a48", "#5bb867"][Math.floor(random() * 4)];
  const leaves = paint(green, { roughness: 0.85 });
  const g = group(block(0.9, 4.5, 0.9, "#7a5638", 0, 0, 0, { radius: 0.15 }));
  for (let i = 0; i < 4; i++) {
    const s = 2.6 + random() * 1.6;
    const m = mesh(roundedBox(s, s * 0.85, s, 0.6), leaves);
    m.position.set((random() - 0.5) * 2.2, 5.2 + random() * 1.8, (random() - 0.5) * 2.2);
    m.rotation.y = random() * Math.PI;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

/** A pine tree from stacked cones, optionally with snow on it. */
export function pine(seed, scale = 1, snowy = false) {
  const random = rng(seed);
  const g = group(block(0.7, 2, 0.7, "#4a3426", 0, 0, 0));
  const green = paint(snowy ? "#1f3b32" : "#2f6b45", { roughness: 0.9 });
  const snow = paint("#e8f0ff", { roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const r = 2.6 - i * 0.55;
    const cone = mesh(
      cachedGeometry(`cone${i}`, () => new THREE.ConeGeometry(r, 2.6, 7)),
      green,
    );
    cone.position.y = 2.4 + i * 1.5;
    cone.rotation.y = random() * Math.PI;
    g.add(cone);
    if (snowy) {
      const cap = mesh(
        cachedGeometry(`snowcap${i}`, () => new THREE.ConeGeometry(r * 0.62, 1.0, 7)),
        snow,
      );
      cap.position.y = 3.1 + i * 1.5;
      cap.rotation.y = cone.rotation.y;
      g.add(cap);
    }
  }
  g.scale.setScalar(scale * (0.8 + random() * 0.5));
  return g;
}

export function house(seed, lit) {
  const random = rng(seed);
  const walls = ["#e8d7b5", "#9fc5e8", "#f4c7a1", "#c9e4c5", "#e6b8c8", "#d8d8e8"][
    Math.floor(random() * 6)
  ];
  const roofColor = ["#7a3b3b", "#3b4a7a", "#4a4a4a", "#8a5a35"][Math.floor(random() * 4)];
  // A one-story house at real size: walls about 3 m high, a 2.1 m door, windows a figure can look through.
  const w = 10 + random() * 3;
  const h = meters(2.9) + random() * 1.2;
  const d = 8;
  const siding = canvasTexture(
    `siding:${walls}`,
    128,
    (ctx, s) => {
      ctx.fillStyle = walls;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      for (let y = 0; y < s; y += 16) ctx.fillRect(0, y, s, 3);
    },
    { repeat: [2, 2] },
  );
  const g = group(
    block(w, h, d, null, 0, 0, 0, { material: paint("#ffffff", { map: siding }), radius: 0.1 }),
  );
  const roofGeometry = cachedGeometry(`roof:${w.toFixed(1)}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.6, 0);
    shape.lineTo(0, 3.4);
    shape.lineTo(w / 2 + 0.6, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d + 1, bevelEnabled: false });
    geometry.translate(0, 0, -(d + 1) / 2);
    return geometry;
  });
  const roof = mesh(roofGeometry, paint(roofColor, { roughness: 0.8 }));
  roof.position.y = h;
  g.add(roof);
  const windowMaterial = lit
    ? glow("#ffcf7a", 1.1)
    : paint("#6f9fc8", { roughness: 0.15, metalness: 0.2 });
  for (const x of [-w / 4 - 0.6, w / 4 + 0.6]) {
    const pane = mesh(roundedBox(2.6, 2.6, 0.2, 0.05), windowMaterial, { cast: false });
    pane.position.set(x, meters(1.5), d / 2 + 0.02);
    g.add(pane, block(3.0, 0.25, 0.4, "#f4f4f4", x, meters(1.5) - 1.55, d / 2 + 0.1));
  }
  const frontDoor = door(["#b13e53", "#29366f", "#257179", "#5d275d"][Math.floor(random() * 4)]);
  frontDoor.position.set(0, 0, d / 2 + 0.05);
  g.add(frontDoor);
  return g;
}

export function streetLamp(on) {
  const g = group(
    block(0.3, 7.5, 0.3, "#3a3f4a", 0, 0, 0),
    block(1.6, 0.25, 0.3, "#3a3f4a", 0.65, 7.3, 0),
  );
  const bulb = mesh(
    roundedBox(0.9, 0.35, 0.6, 0.12),
    on ? glow("#ffe2a8", 1.5) : paint("#e8e8e8"),
    { cast: false },
  );
  bulb.position.set(1.2, 7.2, 0);
  g.add(bulb);
  return g;
}

export function car(color = "#3b5dc9") {
  const body = paint(color, { roughness: 0.35, metalness: 0.1 });
  const g = group(
    block(8, 1.6, 3.6, null, 0, 0.7, 0, { material: body, radius: 0.5 }),
    block(4.6, 1.5, 3.3, null, -0.4, 2.2, 0, { material: body, radius: 0.45 }),
  );
  const glass = paint("#b9d7ef", { roughness: 0.1, metalness: 0.3 });
  for (const z of [-1.67, 1.67]) {
    const side = mesh(roundedBox(3.8, 1.0, 0.05, 0.02), glass, { cast: false });
    side.position.set(-0.4, 2.95, z);
    g.add(side);
  }
  const wheel = cachedGeometry("wheel", () => new THREE.CylinderGeometry(0.75, 0.75, 0.6, 20));
  for (const x of [-2.6, 2.6]) {
    for (const z of [-1.7, 1.7]) {
      const w = mesh(wheel, paint("#1b1b22", { roughness: 0.8 }));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.75, z);
      g.add(w);
    }
  }
  return g;
}

export function bench() {
  const wood = paint("#a0683e", { roughness: 0.7 });
  const iron = paint("#2b2f3a", { roughness: 0.5 });
  const seat = SEAT_HEIGHT;
  const g = group(
    kind(block(6, 0.3, 1.8, null, 0, seat - 0.3, 0, { material: wood, radius: 0.08 }), "seat"),
    block(6, 1.4, 0.25, null, 0, seat + 0.4, -0.8, { material: wood, radius: 0.08 }),
  );
  for (const x of [-2.6, 2.6])
    g.add(block(0.25, seat - 0.3, 1.6, null, x, 0, 0, { material: iron }));
  return g;
}

export function slide() {
  const red = paint("#e8344e");
  const blue = paint("#3b5dc9");
  const yellow = paint("#f4c542");
  const g = group();
  for (const x of [-1.5, 1.5]) {
    for (const z of [-1.5, 1.5]) g.add(block(0.4, 6, 0.4, null, x, 0, z, { material: blue }));
  }
  g.add(block(3.6, 0.4, 3.6, null, 0, 4, 0, { material: yellow, radius: 0.1 }));
  g.add(block(3.8, 0.3, 3.8, null, 0, 6, 0, { material: red, radius: 0.1 }));
  const ramp = mesh(roundedBox(2, 0.3, 7.5, 0.1), red);
  ramp.position.set(0, 2.2, 4.8);
  ramp.rotation.x = 0.6;
  g.add(ramp);
  for (const x of [-1, 1]) {
    const rail = mesh(roundedBox(0.2, 0.6, 7.5, 0.08), yellow);
    rail.position.set(x, 2.55, 4.8);
    rail.rotation.x = 0.6;
    g.add(rail);
  }
  for (let i = 0; i < 6; i++)
    g.add(block(2.6, 0.2, 0.3, null, 0, 0.5 + i * 0.65, -2, { material: yellow }));
  return g;
}

export function swingSet() {
  const frame = paint("#257179");
  const g = group();
  for (const x of [-4, 4]) {
    for (const z of [-1.4, 1.4]) {
      const leg = mesh(roundedBox(0.35, 7.4, 0.35, 0.1), frame);
      leg.position.set(x, 3.5, z * 0.6);
      leg.rotation.x = z > 0 ? -0.2 : 0.2;
      g.add(leg);
    }
  }
  g.add(block(8.6, 0.35, 0.35, null, 0, 7, 0, { material: frame }));
  for (const x of [-1.8, 1.8]) {
    g.add(
      block(0.08, 5, 0.08, "#9aa0aa", x - 0.6, 2, 0),
      block(0.08, 5, 0.08, "#9aa0aa", x + 0.6, 2, 0),
    );
    g.add(block(1.6, 0.2, 0.8, "#e8344e", x, 1.8, 0));
  }
  return g;
}

export function cabin(lit) {
  const logs = canvasTexture(
    "logs",
    128,
    (ctx, s) => {
      ctx.fillStyle = "#6b4630";
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      for (let y = 0; y < s; y += 20) ctx.fillRect(0, y, s, 4);
    },
    { repeat: [2, 2] },
  );
  const g = group(
    block(10, 6, 8, null, 0, 0, 0, { material: paint("#ffffff", { map: logs }), radius: 0.2 }),
  );
  const roof = mesh(
    cachedGeometry("cabinRoof", () => {
      const shape = new THREE.Shape();
      shape.moveTo(-6, 0);
      shape.lineTo(0, 3.6);
      shape.lineTo(6, 0);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 9.4, bevelEnabled: false });
      geometry.translate(0, 0, -4.7);
      return geometry;
    }),
    paint("#eef3ff", { roughness: 0.95 }),
  );
  roof.position.y = 6;
  g.add(roof);
  const pane = mesh(roundedBox(2.2, 2, 0.2, 0.05), lit ? glow("#ffb45e", 1.5) : paint("#2a3040"), {
    cast: false,
  });
  pane.position.set(-2.4, 3.4, 4.05);
  g.add(pane);
  const frontDoor = door("#4a2f20");
  frontDoor.scale.setScalar(0.8);
  frontDoor.position.set(2, 0, 4.05);
  g.add(frontDoor);
  return g;
}

/** A campfire. Its flames flicker with `update(t)`. */
export function campfire() {
  const g = group();
  for (let i = 0; i < 4; i++) {
    const log = mesh(roundedBox(0.5, 0.5, 2.6, 0.2), paint("#5a3a24"));
    log.position.y = 0.3;
    log.rotation.y = (i / 4) * Math.PI;
    g.add(log);
  }
  const flames = [];
  const colors = ["#ff7a1a", "#ffb02e", "#ffe27a"];
  for (let i = 0; i < 3; i++) {
    const f = mesh(
      cachedGeometry(`flame${i}`, () => new THREE.ConeGeometry(0.75 - i * 0.2, 2.2 - i * 0.4, 7)),
      glow(colors[i], 2.2 + i),
      { cast: false, receive: false },
    );
    f.position.y = 1.4 - i * 0.1;
    g.add(f);
    flames.push(f);
  }
  g.userData.update = (t) => {
    flames.forEach((f, i) => {
      const k = 1 + 0.12 * Math.sin(t * (9 + i * 3) + i) + 0.06 * Math.sin(t * 23 + i * 2);
      f.scale.set(1, k, 1);
      f.rotation.y = t * (1 + i);
    });
  };
  return g;
}

// ---------- Small objects for close-ups ("insert" shots) and hands ----------

/** Paper with handwriting: words of small loops, with gaps between them. */
function paperTexture(lines) {
  return canvasTexture(`paper:${lines}`, 512, (ctx, s) => {
    ctx.fillStyle = "#f6f0e2";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#2b2b55";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const random = rng(`ink${lines}`);
    for (let i = 0; i < lines; i++) {
      const y = 70 + i * 52;
      let x = 50;
      const end = i === lines - 1 ? 260 : 430 + random() * 30;
      while (x < end) {
        const letters = 2 + Math.floor(random() * 5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < letters; k++) {
          const h = 8 + random() * 12;
          ctx.bezierCurveTo(x + 3, y - h, x + 10, y - h, x + 9, y);
          ctx.bezierCurveTo(x + 9, y + 3, x + 12, y + 3, x + 15, y);
          x += 15;
        }
        ctx.stroke();
        x += 14 + random() * 8;
      }
    }
  });
}

export const PROPS = {
  letter: () => {
    const m = mesh(
      new THREE.BoxGeometry(2.2, 0.03, 2.8),
      paint("#ffffff", { map: paperTexture(7), roughness: 0.9 }),
    );
    m.position.y = 0.02;
    m.rotation.y = 0.15;
    return group(m);
  },
  phone: () =>
    group(
      block(1.0, 0.12, 1.9, "#1b1b22", 0, 0, 0, { radius: 0.05 }),
      (() => {
        const screen = mesh(new THREE.PlaneGeometry(0.86, 1.7), glow("#7fd0ff", 1.1), {
          cast: false,
        });
        screen.rotation.x = -Math.PI / 2;
        screen.position.y = 0.13;
        return screen;
      })(),
    ),
  cake: () => {
    const g = group(
      mesh(
        cachedGeometry("cake1", () => new THREE.CylinderGeometry(1.4, 1.4, 0.9, 32)),
        paint("#f7d9e3"),
      ),
      mesh(
        cachedGeometry("cake2", () => new THREE.CylinderGeometry(1.0, 1.0, 0.7, 32)),
        paint("#e86a8a"),
      ),
    );
    g.children[0].position.y = 0.45;
    g.children[1].position.y = 1.25;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(block(0.12, 0.6, 0.12, "#73eff7", Math.cos(a) * 0.6, 1.6, Math.sin(a) * 0.6));
      const flame = mesh(
        cachedGeometry("candleFlame", () => new THREE.ConeGeometry(0.09, 0.25, 6)),
        glow("#ffcf5a", 2.5),
        { cast: false },
      );
      flame.position.set(Math.cos(a) * 0.6, 2.35, Math.sin(a) * 0.6);
      g.add(flame);
    }
    return g;
  },
  gift: () =>
    group(
      block(1.6, 1.4, 1.6, "#3b5dc9", 0, 0, 0, { radius: 0.06 }),
      block(1.7, 0.3, 0.35, "#ffcd75", 0, 1.2, 0),
      block(0.35, 1.45, 1.7, "#ffcd75", 0, 0, 0),
    ),
  book: () =>
    group(
      block(2.0, 0.4, 2.6, "#b13e53", 0, 0, 0, { radius: 0.05 }),
      block(1.85, 0.32, 2.5, "#f6f0e2", 0.06, 0.04, 0, { radius: 0.02 }),
    ),
  ball: () => {
    const m = mesh(
      cachedGeometry("ball", () => new THREE.SphereGeometry(0.8, 24, 16)),
      paint("#ef7d57", { roughness: 0.4 }),
    );
    m.position.y = 0.8;
    return group(m);
  },
  key: () =>
    group(
      block(0.9, 0.1, 0.9, "#e0b84a", 0, 0, 0, { radius: 0.3, metalness: 0.6, roughness: 0.3 }),
      block(1.6, 0.1, 0.25, "#e0b84a", 1.1, 0, 0, { metalness: 0.6, roughness: 0.3 }),
    ),
  cup: () => {
    const m = mesh(
      cachedGeometry("cup", () => new THREE.CylinderGeometry(0.55, 0.45, 1.1, 24)),
      paint("#f4f4f4", { roughness: 0.3 }),
    );
    m.position.y = 0.55;
    return group(m);
  },
  photo: () => {
    const m = mesh(
      new THREE.BoxGeometry(1.8, 0.03, 1.4),
      paint("#ffffff", {
        map: canvasTexture("photo", 128, (ctx, s) => {
          ctx.fillStyle = "#f4f4f4";
          ctx.fillRect(0, 0, s, s);
          ctx.fillStyle = "#7fb0e0";
          ctx.fillRect(10, 10, s - 20, s - 34);
          ctx.fillStyle = "#4caf5c";
          ctx.fillRect(10, s * 0.55, s - 20, s * 0.45 - 24);
          ctx.fillStyle = "#e9b58a";
          ctx.fillRect(s * 0.42, s * 0.3, s * 0.16, s * 0.3);
        }),
      }),
    );
    m.position.y = 0.02;
    m.rotation.y = -0.2;
    return group(m);
  },
  trophy: () => {
    const gold = paint("#e0b84a", { metalness: 0.7, roughness: 0.3 });
    const cupMesh = mesh(
      cachedGeometry("trophy", () => new THREE.CylinderGeometry(0.8, 0.3, 1.2, 24)),
      gold,
    );
    cupMesh.position.y = 1.6;
    return group(
      block(1.4, 0.4, 1.4, "#3a2a20", 0, 0, 0),
      block(0.3, 0.6, 0.3, null, 0, 0.4, 0, { material: gold }),
      cupMesh,
    );
  },
  megaphone: () => {
    const m = mesh(
      cachedGeometry("megaphone", () => new THREE.CylinderGeometry(0.9, 0.3, 2.2, 24, 1, true)),
      paint("#f4f4f4", { side: THREE.DoubleSide }),
    );
    m.rotation.z = Math.PI / 2;
    m.position.y = 0.9;
    return group(m, block(0.4, 0.8, 0.4, "#e8344e", -1.0, 0.1, 0));
  },
  // A plain AA battery, standing (no brand): dark body, copper top, a metal tip.
  battery: () => {
    const body = mesh(
      cachedGeometry("batteryBody", () => new THREE.CylinderGeometry(0.28, 0.28, 1.5, 20)),
      paint("#1d1f26", { roughness: 0.4 }),
    );
    body.position.y = 0.75;
    const top = mesh(
      cachedGeometry("batteryTop", () => new THREE.CylinderGeometry(0.285, 0.285, 0.45, 20)),
      paint("#d98a3a", { metalness: 0.5, roughness: 0.35 }),
    );
    top.position.y = 1.3;
    const tip = mesh(
      cachedGeometry("batteryTip", () => new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12)),
      paint("#c9ccd4", { metalness: 0.8, roughness: 0.25 }),
    );
    tip.position.y = 1.58;
    return group(body, top, tip);
  },
  // A computer mouse (no brand): a rounded body with a scroll wheel and the line between its buttons.
  mouse: () => {
    const body = mesh(
      cachedGeometry("mouseBody", () => new THREE.SphereGeometry(1, 28, 18)),
      paint("#2b2d36", { roughness: 0.35 }),
    );
    body.scale.set(0.62, 0.36, 1.0);
    body.position.y = 0.02;
    const wheel = mesh(
      cachedGeometry("mouseWheel", () => new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16)),
      paint("#9aa0b0", { roughness: 0.5 }),
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.36, 0.42);
    return group(body, wheel, block(0.03, 0.02, 0.5, "#14151a", 0, 0.36, 0.62));
  },
};

export const PROP_NAMES = Object.keys(PROPS);
