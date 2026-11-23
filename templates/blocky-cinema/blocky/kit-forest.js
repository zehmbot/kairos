// The snowy forest: pines with snow on their branches, the log cabin (a snowy roof, a stone chimney, a porch with a
// lantern, a lit window, a woodpile), the campfire in its ring of stones, logs and a stump to sit on, snow mounds
// and a sled. Sizes come from shapes.js; `ctx` is { lit, night, sky }.
import * as THREE from "three";
import { gableRoof } from "./kit-house.js";
import { glowing, group, kind, part, tiledBox } from "./kit-parts.js";
import { campfire as plainCampfire, door as plainDoor } from "./props.js";
import { cabinSpec, DECK_HEIGHT, pineSpec } from "./shapes.js";
import { SEAT_HEIGHT } from "./sizes.js";
import { bark, logs, planks, stone } from "./textures.js";
import { cachedGeometry, canvasTexture, paint, rng } from "./util.js";

const snowPaint = () => paint("#f2f6ff", { roughness: 0.95 });
const barkPaint = () =>
  paint("#ffffff", { ...bark("#6b4a32", [1, 2]), roughness: 0.9, bumpScale: 2 });

/** A pine with snow on its branches, `scale` times the size of a 1-scale pine. */
export function pine(p) {
  const t = pineSpec(p);
  const random = rng(`pine${p.seed ?? 0}`);
  const green = paint(p.snowy === false ? "#2f6b45" : "#1f3b32", { roughness: 0.9 });
  const snow = snowPaint();
  const g = group(part(new THREE.CylinderGeometry(0.28, 0.38, 2.4, 8), barkPaint(), 0, 1.2, 0));
  for (let i = 0; i < 4; i++) {
    const r = 2.6 - i * 0.55;
    const cone = part(
      cachedGeometry(`cone${i}`, () => new THREE.ConeGeometry(r, 2.6, 7)),
      green,
      0,
      2.4 + i * 1.5,
      0,
    );
    cone.rotation.y = random() * Math.PI;
    g.add(cone);
    if (p.snowy !== false) {
      const cap = part(
        cachedGeometry(`snowcap${i}`, () => new THREE.ConeGeometry(r * 0.62, 1.0, 7)),
        snow,
        0,
        3.1 + i * 1.5,
        0,
      );
      cap.rotation.y = cone.rotation.y;
      g.add(cap);
    }
  }
  g.scale.setScalar(t.s);
  return group(g);
}

/** The log cabin, its front (porch, door, window) facing +z. */
export function cabin(p, ctx) {
  const c = cabinSpec(p);
  const front = c.d / 2;
  const walls = paint("#ffffff", { ...logs("#7a5236"), roughness: 0.85, bumpScale: 2.5 });
  const dark = paint("#4a3426", { roughness: 0.85 });
  const g = group(part(tiledBox(c.w, c.wall, c.d, 4.4), walls, 0, c.wall / 2, 0));
  // Log ends crossing at the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 10; k++) {
        const end = part(
          cachedGeometry("logEnd", () => new THREE.CylinderGeometry(0.36, 0.36, 1.2, 10)),
          barkPaint(),
          sx * (c.w / 2 + 0.1),
          0.4 + k * 0.74,
          sz * (c.d / 2 + 0.1),
        );
        end.rotation.set(k % 2 ? Math.PI / 2 : 0, 0, k % 2 ? 0 : Math.PI / 2);
        g.add(end);
      }
    }
  }
  const roof = group(gableRoof(c.w, c.d, c.rise, snowPaint(), walls, 1.0));
  roof.position.y = c.wall;
  g.add(roof);

  // The chimney (stone, a snowy cap), rising through the roof on the left.
  const stones = paint("#ffffff", { ...stone("#8a8780", [1, 2]), roughness: 0.95, bumpScale: 2 });
  const tall = c.chimney.top - c.wall + 1;
  g.add(
    part(
      tiledBox(c.chimney.w, tall, c.chimney.w, 2.5),
      stones,
      c.chimney.x,
      c.wall - 1 + tall / 2,
      c.chimney.z,
    ),
  );
  g.add(
    part(
      new THREE.BoxGeometry(c.chimney.w + 0.3, 0.3, c.chimney.w + 0.3),
      snowPaint(),
      c.chimney.x,
      c.chimney.top + 0.1,
      c.chimney.z,
    ),
  );

  // The porch: a deck, two log posts, a snowy roof, a lantern by the door.
  const deck = paint("#ffffff", {
    ...planks("#8a6440", [1, 1], { count: 6 }),
    roughness: 0.8,
    bumpScale: 1.5,
  });
  g.add(
    part(
      tiledBox(c.w, DECK_HEIGHT, c.porch.d, 2.4),
      deck,
      0,
      DECK_HEIGHT / 2,
      front + c.porch.d / 2,
    ),
  );
  g.add(part(tiledBox(3.6, 0.22, 1, 2.4), deck, c.doorX, 0.11, front + c.porch.d + 0.5));
  for (const side of [-1, 1]) {
    g.add(
      part(
        new THREE.CylinderGeometry(0.25, 0.28, c.porch.roofY - DECK_HEIGHT, 8),
        barkPaint(),
        side * (c.w / 2 - 0.35),
        (c.porch.roofY + DECK_HEIGHT) / 2,
        front + c.porch.d - 0.35,
      ),
    );
  }
  g.add(
    part(
      new THREE.BoxGeometry(c.w + 0.6, 0.3, c.porch.d + 0.4),
      dark,
      0,
      c.porch.roofY + 0.05,
      front + c.porch.d / 2,
    ),
  );
  g.add(
    part(
      new THREE.BoxGeometry(c.w + 0.7, 0.3, c.porch.d + 0.5),
      snowPaint(),
      0,
      c.porch.roofY + 0.35,
      front + c.porch.d / 2,
    ),
  );
  const lantern = group(
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), dark, 0, 0.4, 0),
    part(
      new THREE.BoxGeometry(0.5, 0.65, 0.5),
      ctx.lit ? glowing("#ffb45e", 2.4) : paint("#e6ecef", { roughness: 0.15 }),
      0,
      -0.3,
      0,
      { cast: false },
    ),
    part(new THREE.ConeGeometry(0.42, 0.3, 4), dark, 0, 0.12, 0),
  );
  lantern.position.set(c.doorX + 2.2, c.porch.roofY - 1, front + c.porch.d - 0.8);
  g.add(lantern);

  // The door and the window.
  const entry = plainDoor("#4a2f20");
  entry.position.set(c.doorX, DECK_HEIGHT, front + 0.05);
  g.add(entry);
  g.add(part(new THREE.BoxGeometry(2.6, 2.4, 0.2), dark, c.windowX, 4.1, front + 0.05));
  g.add(
    part(
      new THREE.PlaneGeometry(2.1, 1.9),
      ctx.lit ? glowing("#ffb45e", 1.6) : paint("#2a3040", { roughness: 0.1, metalness: 0.3 }),
      c.windowX,
      4.1,
      front + 0.17,
      { cast: false },
    ),
  );
  g.add(part(new THREE.BoxGeometry(0.15, 1.9, 0.1), dark, c.windowX, 4.1, front + 0.2));
  g.add(part(new THREE.BoxGeometry(2.9, 0.25, 0.6), snowPaint(), c.windowX, 2.85, front + 0.3));

  // The woodpile against the right wall.
  const wp = c.woodpile;
  const random = rng("woodpile");
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const per = 3 - r;
    for (let k = 0; k < per; k++) {
      const x = wp.x - ((per - 1) * 0.68) / 2 + k * 0.68 + (random() - 0.5) * 0.06;
      const log = part(
        cachedGeometry("firewood", () =>
          new THREE.CylinderGeometry(0.34, 0.34, wp.d, 9).rotateX(Math.PI / 2),
        ),
        barkPaint(),
        x,
        0.34 + r * 0.62,
        wp.z,
      );
      g.add(log);
    }
  }
  g.add(part(new THREE.BoxGeometry(wp.w, 0.25, wp.d + 0.2), snowPaint(), wp.x, 2.05, wp.z));
  return g;
}

/** The campfire: logs in a ring of stones, and its flames (they flicker: kit.js leaves it unmerged). */
export function campfire() {
  const g = plainCampfire();
  const stones = paint("#ffffff", { ...stone("#7d7b76"), roughness: 0.95, bumpScale: 2 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const m = part(
      cachedGeometry("fireStone", () => new THREE.DodecahedronGeometry(0.38, 0)),
      stones,
      Math.cos(a) * 1.2,
      0.2,
      Math.sin(a) * 1.2,
    );
    m.scale.set(1, 0.6, 0.9);
    m.rotation.y = a;
    g.add(m);
  }
  return g;
}

const ringsTexture = () =>
  canvasTexture("treeRings", 128, (ctx, s) => {
    ctx.fillStyle = "#d9b98a";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(120,80,40,0.45)";
    ctx.lineWidth = 2;
    for (let r = 6; r < s / 2; r += 7) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

/** A log lying along x, to sit on. */
export function log(p) {
  const w = p.w ?? 4;
  const r = SEAT_HEIGHT / 2;
  const body = kind(
    part(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), barkPaint(), 0, r, 0),
    "seat",
  );
  const g = group(body);
  for (const side of [-1, 1]) {
    const end = part(
      new THREE.CircleGeometry(r - 0.02, 12),
      paint("#ffffff", { map: ringsTexture(), roughness: 0.8 }),
      side * (w / 2 + 0.01),
      r,
      0,
      { cast: false },
    );
    end.rotation.y = (side * Math.PI) / 2;
    g.add(end);
  }
  g.add(
    part(new THREE.BoxGeometry(w * 0.8, 0.12, r * 1.2), snowPaint(), 0, r * 2 + 0.02, 0, {
      cast: false,
    }),
  );
  return g;
}

/** A tree stump, its top at the figures' knee height: a seat. */
export function stump() {
  const g = group(
    kind(
      part(
        new THREE.CylinderGeometry(0.66, 0.78, SEAT_HEIGHT, 12),
        barkPaint(),
        0,
        SEAT_HEIGHT / 2,
        0,
      ),
      "seat",
    ),
  );
  const top = part(
    new THREE.CircleGeometry(0.64, 14).rotateX(-Math.PI / 2),
    paint("#ffffff", { map: ringsTexture(), roughness: 0.8 }),
    0,
    SEAT_HEIGHT + 0.01,
    0,
    { cast: false },
  );
  g.add(top);
  for (const a of [0.4, 2.3, 4.2]) {
    const root = part(
      new THREE.CylinderGeometry(0.12, 0.25, 1.0, 6),
      barkPaint(),
      Math.cos(a) * 0.75,
      0.15,
      Math.sin(a) * 0.75,
    );
    root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    g.add(root);
  }
  return g;
}

/** A soft heap of snow. */
export function snowMound(p) {
  const r = p.r ?? 2;
  const m = part(
    cachedGeometry(
      "snowMound",
      () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    ),
    snowPaint(),
    0,
    0,
    0,
  );
  m.scale.set(r * 0.85, r * 0.5, r * 0.7);
  return group(m);
}

/** A wooden sled with red runners. */
export function sled() {
  const wood = paint("#ffffff", {
    ...planks("#b07a4a", [1, 1], { count: 3, across: false }),
    roughness: 0.7,
    bumpScale: 1,
  });
  const red = paint("#d8343e", { roughness: 0.4, metalness: 0.2 });
  const g = group(part(tiledBox(1.5, 0.15, 3.4, 2), wood, 0, 0.75, -0.1));
  for (const x of [-0.65, 0.65]) {
    g.add(part(new THREE.BoxGeometry(0.12, 0.12, 3.6), red, x, 0.1, 0));
    g.add(part(new THREE.BoxGeometry(0.1, 0.6, 0.1), red, x, 0.42, -1.2));
    g.add(part(new THREE.BoxGeometry(0.1, 0.6, 0.1), red, x, 0.42, 0.9));
    const curl = part(
      cachedGeometry("sledCurl", () =>
        new THREE.TorusGeometry(0.42, 0.06, 6, 12, Math.PI).rotateY(Math.PI / 2),
      ),
      red,
      x,
      0.52,
      1.8,
    );
    curl.rotation.x = -Math.PI / 2;
    g.add(curl);
  }
  return g;
}
