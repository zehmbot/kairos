// The café: the service counter (a pastry case, the register), the back counter (the coffee machine, cups, open
// shelves), the menu board, the café's sign (its name is our own), a brick wall behind the counters, round tables
// and a glass shop door with an "Open" sign. Sizes come from shapes.js; `ctx` is { lit, night, sky }.
import * as THREE from "three";
import { glowing, group, kind, part, tiledBox, tiledPlane } from "./kit-parts.js";
import { door as plainDoor } from "./props.js";
import { meters } from "./sizes.js";
import { bricks, planks } from "./textures.js";
import { cachedGeometry, canvasTexture, paint, rng, roundedBox } from "./util.js";

/** The café's own name (made up; never a real brand). */
export const CAFE_NAME = "Bean & Bun";

const wood = (color, count = 6, across = false) =>
  paint("#ffffff", { ...planks(color, [1, 1], { count, across }), roughness: 0.6, bumpScale: 1 });
const steel = () => paint("#c9ccd2", { roughness: 0.25, metalness: 0.8 });

/** Pastries for the case: croissants, buns, donuts and cupcakes, in rows. */
function pastries(g, x0, x1, y, z, seed) {
  const random = rng(`pastry${seed}`);
  const kinds = [
    () => {
      const m = part(
        cachedGeometry(
          "croissant",
          () => new THREE.TorusGeometry(0.24, 0.12, 8, 12, Math.PI * 1.3),
        ),
        paint("#d99a45", { roughness: 0.5 }),
      );
      m.rotation.x = -Math.PI / 2;
      return m;
    },
    () =>
      part(
        cachedGeometry("bun", () => new THREE.SphereGeometry(0.24, 12, 8)),
        paint("#c98a4a", { roughness: 0.5 }),
      ),
    () => {
      const m = part(
        cachedGeometry("donut", () => new THREE.TorusGeometry(0.2, 0.1, 8, 14)),
        paint(["#e86a8a", "#6b4a32", "#f4c542"][Math.floor(random() * 3)], { roughness: 0.4 }),
      );
      m.rotation.x = -Math.PI / 2;
      return m;
    },
    () =>
      group(
        part(
          cachedGeometry("cupcakeBase", () => new THREE.CylinderGeometry(0.2, 0.15, 0.25, 10)),
          paint("#f2efe6", { roughness: 0.5 }),
          0,
          0,
          0,
        ),
        part(
          cachedGeometry(
            "cupcakeTop",
            () => new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          ),
          paint(["#f3a6c8", "#ffffff", "#8fd3a0"][Math.floor(random() * 3)], { roughness: 0.5 }),
          0,
          0.1,
          0,
        ),
      ),
  ];
  for (let x = x0; x <= x1; x += 0.62) {
    const m = kinds[Math.floor(random() * kinds.length)]();
    m.position.add(new THREE.Vector3(x, y + 0.15, z + (random() - 0.5) * 0.3));
    g.add(m);
  }
}

/** The service counter, its front facing the customers (+z): a wood front, a pastry case and the register. */
export function serviceCounter(p, ctx) {
  const w = p.w ?? 12;
  const front = wood("#6b4a32", 8, false);
  const top = paint("#3a3a40", { roughness: 0.3, metalness: 0.1 });
  const g = group(
    part(tiledBox(w, 2.9, 2.2, 3), front, 0, 1.45, 0),
    part(new THREE.BoxGeometry(w + 0.2, 0.2, 2.4), top, 0, 3.0, 0),
  );
  // The pastry case: a glass box with two shelves of pastries, lit inside when the lamps are on.
  const cx = w / 4;
  const glass = new THREE.MeshStandardMaterial({
    color: "#d8eaf2",
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.22,
  });
  g.add(part(new THREE.BoxGeometry(3.4, 0.12, 1.8), steel(), cx, 3.16, 0));
  g.add(part(new THREE.BoxGeometry(3.3, 0.06, 1.6), paint("#f4f1ea"), cx, 3.75, 0));
  pastries(g, cx - 1.4, cx + 1.4, 3.16, 0.1, "low");
  pastries(g, cx - 1.4, cx + 1.4, 3.75, 0.05, "high");
  g.add(part(new THREE.BoxGeometry(3.4, 1.4, 1.8), glass, cx, 3.85, 0, { cast: false }));
  g.add(
    part(
      new THREE.BoxGeometry(3.3, 0.06, 0.2),
      ctx.lit ? glowing("#fff2d0", 1.4) : paint("#e8e4da"),
      cx,
      4.5,
      -0.75,
      { cast: false },
    ),
  );
  // The register and a tip jar.
  const rx = -w / 2 + 1.5;
  g.add(part(roundedBox(1.2, 0.5, 1.0, 0.06), paint("#2f2f35"), rx, 3.35, 0));
  g.add(part(new THREE.BoxGeometry(0.9, 0.6, 0.08), paint("#1e2026"), rx, 3.9, -0.2));
  g.add(
    part(new THREE.PlaneGeometry(0.8, 0.5), glowing("#7fd3a0", 0.8), rx, 3.9, -0.15, {
      cast: false,
    }),
  );
  g.add(
    part(
      new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12),
      new THREE.MeshStandardMaterial({
        color: "#d8eaf2",
        roughness: 0.05,
        transparent: true,
        opacity: 0.4,
      }),
      rx + 1.4,
      3.35,
      0.4,
    ),
  );
  return g;
}

/** The back counter against the wall: the coffee machine, a grinder, cups, and open shelves of cups and jars above. */
export function backCounter(p) {
  const w = p.w ?? 14;
  const g = group(
    part(new THREE.BoxGeometry(w, 2.35, 1.8), paint("#e9e4d8", { roughness: 0.5 }), 0, 1.33, 0),
    part(tiledBox(w + 0.1, 0.3, 1.95, 3), wood("#8a6440", 4, true), 0, 2.5, 0.02),
  );
  for (let x = -w / 2 + 1; x < w / 2; x += 2) {
    g.add(
      part(
        new THREE.BoxGeometry(1.85, 1.95, 0.08),
        paint("#dcd5c6", { roughness: 0.45 }),
        x,
        1.33,
        0.93,
      ),
    );
    g.add(part(new THREE.BoxGeometry(0.5, 0.08, 0.1), steel(), x, 2.1, 0.99));
  }
  // The coffee machine: a steel body, two group heads, a cup warmer on top.
  const mx = -2;
  g.add(part(roundedBox(2.6, 1.6, 1.4, 0.12), steel(), mx, 3.45, -0.2));
  g.add(part(new THREE.BoxGeometry(2.4, 0.15, 1.0), paint("#2f2f35"), mx, 2.7, 0.15));
  for (const dx of [-0.6, 0.6]) {
    g.add(
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10), paint("#2f2f35"), mx + dx, 3.0, 0.45),
    );
  }
  const cup = cachedGeometry("cup", () => new THREE.CylinderGeometry(0.2, 0.16, 0.36, 10));
  const white = paint("#f4f1ea", { roughness: 0.4 });
  for (let k = 0; k < 4; k++) g.add(part(cup, white, mx - 0.9 + k * 0.6, 4.43, -0.2));
  // A grinder and a stack of cups.
  g.add(
    part(new THREE.CylinderGeometry(0.35, 0.4, 1.1, 10), paint("#2f2f35"), mx + 2.3, 3.2, -0.2),
  );
  g.add(
    part(
      new THREE.ConeGeometry(0.4, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: "#6b4a32", transparent: true, opacity: 0.6 }),
      mx + 2.3,
      4.05,
      -0.2,
    ),
  );
  for (let k = 0; k < 4; k++) g.add(part(cup, white, mx + 4.2, 2.83 + k * 0.33, -0.2));
  // Open shelves of cups and jars on the wall above.
  const random = rng("shelfItems");
  const jars = ["#c96f4a", "#f4c542", "#6b4a32", "#38b764"];
  for (const y of [5.3, 6.8]) {
    g.add(part(tiledBox(w - 1, 0.18, 1.0, 3), wood("#8a6440", 2, true), 0, y, -0.45));
    for (let x = -w / 2 + 1.2; x < w / 2 - 1; x += 0.75) {
      if (random() < 0.5) g.add(part(cup, white, x, y + 0.27, -0.45));
      else
        g.add(
          part(
            cachedGeometry("jar", () => new THREE.CylinderGeometry(0.24, 0.24, 0.6, 10)),
            paint(jars[Math.floor(random() * jars.length)], { roughness: 0.3 }),
            x,
            y + 0.39,
            -0.45,
          ),
        );
    }
  }
  return g;
}

/** The menu: a chalkboard in a wooden frame, its y the bottom edge. */
export function menuBoard(p) {
  const w = p.w ?? 5.5;
  const h = p.h ?? 3.5;
  const chalk = canvasTexture(
    "cafeMenu",
    512,
    (c, s, ht) => {
      c.fillStyle = "#2b2f2c";
      c.fillRect(0, 0, s, ht);
      c.fillStyle = "#f4f1ea";
      c.textBaseline = "top";
      c.font = "bold 46px sans-serif";
      c.fillText("MENU", 34, 18);
      c.font = "32px sans-serif";
      const items = [
        ["Hot cocoa", "3"],
        ["Coffee", "2"],
        ["Milkshake", "4"],
        ["Croissant", "2"],
        ["Cupcake", "2"],
      ];
      const step = (ht - 92) / items.length;
      items.forEach(([name, price], i) => {
        c.fillStyle = i % 2 ? "#ffd1dc" : "#f4f1ea";
        c.fillText(name, 34, 82 + i * step);
        c.fillText(price, s - 64, 82 + i * step);
      });
      c.strokeStyle = "#f4c542";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(s - 60, 42, 22, 0, Math.PI * 2);
      c.stroke();
    },
    { height: Math.round((512 * h) / w) },
  );
  const frame = paint("#6b4a32", { roughness: 0.6 });
  return group(
    part(
      new THREE.PlaneGeometry(w, h),
      paint("#ffffff", { map: chalk, roughness: 0.9 }),
      0,
      h / 2,
      0.06,
      { cast: false },
    ),
    part(new THREE.BoxGeometry(w + 0.4, 0.25, 0.2), frame, 0, h + 0.1, 0.08),
    part(new THREE.BoxGeometry(w + 0.4, 0.25, 0.2), frame, 0, -0.1, 0.08),
    part(new THREE.BoxGeometry(0.25, h, 0.2), frame, -w / 2 - 0.1, h / 2, 0.08),
    part(new THREE.BoxGeometry(0.25, h, 0.2), frame, w / 2 + 0.1, h / 2, 0.08),
  );
}

/** The café's sign: its name painted on a wooden board. Its y is the bottom edge. */
export function shopSign(p) {
  const w = p.w ?? 7;
  const sign = canvasTexture(
    `shopSign:${p.text ?? CAFE_NAME}`,
    512,
    (c, s, ht) => {
      c.fillStyle = "#2f4a3a";
      c.fillRect(0, 0, s, ht);
      c.strokeStyle = "#e8c47a";
      c.lineWidth = 6;
      c.strokeRect(10, 10, s - 20, ht - 20);
      c.fillStyle = "#f4f1ea";
      c.font = "bold 70px serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(p.text ?? CAFE_NAME, s / 2, ht / 2 + 4);
    },
    { height: 128 },
  );
  const h = w / 4;
  return group(
    part(
      new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2),
      paint("#6b4a32", { roughness: 0.6 }),
      0,
      h / 2,
      0.05,
    ),
    part(
      new THREE.PlaneGeometry(w, h),
      paint("#ffffff", { map: sign, roughness: 0.7 }),
      0,
      h / 2,
      0.16,
      { cast: false },
    ),
  );
}

/** A brick wall panel (behind the counters), its y the bottom edge. */
export function brickPanel(p) {
  const w = p.w ?? 16;
  const h = p.h ?? 7;
  return group(
    part(
      tiledPlane(w, h, 3),
      paint("#ffffff", { ...bricks("#a5523f", [1, 1]), roughness: 0.9, bumpScale: 1.5 }),
      0,
      h / 2,
      0.02,
      { cast: false },
    ),
  );
}

/** A round café table with a cup on it. */
export function cafeTable(p) {
  const top = paint("#ffffff", {
    ...planks(p.wood ?? "#4a3426", [1, 1], { count: 4 }),
    roughness: 0.4,
    bumpScale: 0.8,
  });
  const metal = paint("#2f2f35", { roughness: 0.4, metalness: 0.5 });
  const table = kind(
    group(
      part(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 24), top, 0, 2.1, 0),
      part(new THREE.CylinderGeometry(0.12, 0.15, 2.0, 8), metal, 0, 1.0, 0),
      part(new THREE.CylinderGeometry(0.75, 0.8, 0.14, 16), metal, 0, 0.07, 0),
    ),
    "table",
  );
  const g = group(table);
  g.add(part(new THREE.CylinderGeometry(0.35, 0.3, 0.05, 14), paint("#f4f1ea"), 0.4, 2.23, 0.2));
  g.add(
    part(
      cachedGeometry("cup", () => new THREE.CylinderGeometry(0.2, 0.16, 0.36, 10)),
      paint("#f4f1ea", { roughness: 0.4 }),
      0.4,
      2.43,
      0.2,
    ),
  );
  return g;
}

/** A glass shop door with an "Open" sign hanging in it. */
export function shopDoor(p) {
  const frame = paint("#2f4a3a", { roughness: 0.5 });
  const g = group(
    part(
      new THREE.BoxGeometry(0.4, meters(2.1) + 0.4, 0.3),
      frame,
      -meters(0.9) / 2 - 0.2,
      (meters(2.1) + 0.4) / 2,
      0.1,
    ),
    part(
      new THREE.BoxGeometry(0.4, meters(2.1) + 0.4, 0.3),
      frame,
      meters(0.9) / 2 + 0.2,
      (meters(2.1) + 0.4) / 2,
      0.1,
    ),
    part(new THREE.BoxGeometry(meters(0.9) + 1.2, 0.4, 0.35), frame, 0, meters(2.1) + 0.2, 0.1),
  );
  g.add(plainDoor(p.color ?? "#2f4a3a"));
  g.add(
    part(
      new THREE.PlaneGeometry(1.9, 3.6),
      paint("#9fc4e6", { roughness: 0.05, metalness: 0.3 }),
      0,
      3.6,
      0.17,
      { cast: false },
    ),
  );
  const open = canvasTexture(
    "openSign",
    128,
    (c, s, ht) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, s, ht);
      c.fillStyle = "#d8343e";
      c.font = "bold 40px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("OPEN", s / 2, ht / 2 + 2);
    },
    { height: 64 },
  );
  g.add(
    part(
      new THREE.PlaneGeometry(1.2, 0.6),
      paint("#ffffff", { map: open, roughness: 0.6 }),
      0,
      4.0,
      0.19,
      { cast: false },
    ),
  );
  return g;
}
