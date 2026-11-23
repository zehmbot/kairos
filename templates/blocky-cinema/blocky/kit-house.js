// The street and the house: houses (siding, shingled roofs, framed windows with curtains, shutters, porches,
// garages, chimneys, driveways), cars at real size, lantern street lamps, mailboxes, hydrants, bins, decks and
// string lights. Each builder takes its piece (see shapes.js for its sizes) and `ctx` ({ lit }: lamps and windows
// on), and builds it around its own origin; kit.js places it.
import * as THREE from "three";
import {
  glowing,
  group,
  part,
  tiledBox,
  tiledPlane,
  tiledShape,
  trim,
  windowUnit,
} from "./kit-parts.js";
import { door } from "./props.js";
import { DECK_HEIGHT, houseSpec, STOREY } from "./shapes.js";
import { meters } from "./sizes.js";
import { bricks, concrete, planks, shingles, siding } from "./textures.js";
import { cachedGeometry, canvasTexture, paint, rng, roundedBox } from "./util.js";

const SIDING_TILE = 4.4;
const ROOF_TILE = 6;
const DECK_TILE = 2.4;

const sidingPaint = (color) =>
  paint("#ffffff", { ...siding(color, [1, 1]), roughness: 0.78, bumpScale: 2 });
const roofPaint = (color) =>
  paint("#ffffff", { ...shingles(color, [1, 1]), roughness: 0.88, bumpScale: 2.5 });
const deckPaint = (color = "#9a6a45") =>
  paint("#ffffff", { ...planks(color, [1, 1], { count: 6 }), roughness: 0.72, bumpScale: 1.5 });
const pavingPaint = () =>
  paint("#ffffff", { ...concrete("#cdcac3", [1, 1], 2), roughness: 0.92, bumpScale: 1 });
const brickPaint = () =>
  paint("#ffffff", { ...bricks("#a5523f", [1, 1]), roughness: 0.88, bumpScale: 1.5 });

const CURTAINS = ["#f2e6c9", "#c9dcef", "#f3c9c9", "#d9e8c4", "#efe2a8", "#e7d3ee"];

/** A flat strip on the ground (a driveway, a path) from z0 to z1 at x, `w` wide. */
function groundStrip(x, z0, z1, w, material) {
  const length = Math.abs(z1 - z0);
  const m = part(tiledPlane(w, length, 4), material, x, 0.025, (z0 + z1) / 2, { cast: false });
  m.rotation.x = -Math.PI / 2;
  return m;
}

/**
 * A gable roof over a w × d box, its ridge along x, `rise` high, overhanging by `over`: two shingled slopes, the
 * gable ends in the wall's siding, white rakes and fascias, a ridge cap. Its origin is the top of the walls.
 */
export function gableRoof(w, d, rise, roof, wall, over = 0.9) {
  const g = group();
  const white = trim();
  const run = d / 2 + over;
  const angle = Math.atan(rise / (d / 2));
  const length = run / Math.cos(angle);
  const t = 0.35;
  for (const side of [-1, 1]) {
    const slab = part(tiledBox(w + over * 2, t, length, ROOF_TILE), roof);
    slab.position.set(
      0,
      rise - (run / 2) * Math.tan(angle) + (Math.cos(angle) * t) / 2,
      side * (run / 2 + (Math.sin(angle) * t) / 2),
    );
    slab.rotation.x = side * angle;
    g.add(slab);
    for (const end of [-1, 1]) {
      const rake = part(new THREE.BoxGeometry(0.35, 0.55, length), white);
      rake.position.set(end * (w / 2 + over), slab.position.y - 0.1, slab.position.z);
      rake.rotation.x = side * angle;
      g.add(rake);
    }
    const drop = (over * rise) / (d / 2);
    g.add(
      part(
        new THREE.BoxGeometry(w + over * 2 + 0.2, 0.55, 0.3),
        white,
        0,
        -drop - 0.05,
        side * (run - 0.05),
      ),
    );
  }
  for (const end of [-1, 1]) {
    const gable = part(
      tiledShape(
        `gable:${d}:${rise}`,
        [
          [-d / 2, 0],
          [d / 2, 0],
          [0, rise],
        ],
        SIDING_TILE,
      ),
      wall,
    );
    gable.position.x = (end * w) / 2;
    gable.rotation.y = (end * Math.PI) / 2;
    g.add(gable);
  }
  g.add(part(new THREE.BoxGeometry(w + over * 2, 0.35, 0.8), roof, 0, rise + 0.12, 0));
  return g;
}

/** The white panels of a garage door, with a row of small windows. */
function garageDoorTexture() {
  return canvasTexture("garageDoor", 256, (ctx, s) => {
    ctx.fillStyle = "#f1efe9";
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < 4; r++) {
      const y = (r * s) / 4;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, y, s, 3);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(0, y + 3, s, 2);
      for (let c = 0; c < 4; c++) {
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 2;
        ctx.strokeRect(c * (s / 4) + 8, y + 10, s / 4 - 16, s / 4 - 18);
        if (r === 0) {
          ctx.fillStyle = "#3e5d7c";
          ctx.fillRect(c * (s / 4) + 14, y + 16, s / 4 - 28, s / 4 - 34);
        }
      }
    }
  });
}

/** A wall lamp by a door: a little lantern, lit when `on`. */
function wallLamp(on) {
  const iron = paint("#23262d", { roughness: 0.5, metalness: 0.5 });
  return group(
    part(new THREE.BoxGeometry(0.25, 0.25, 0.4), iron, 0, 0, -0.2),
    part(
      new THREE.BoxGeometry(0.5, 0.75, 0.5),
      on ? glowing("#ffd28a", 2) : paint("#e6ecef", { roughness: 0.15 }),
      0,
      0,
      0.15,
      { cast: false },
    ),
    part(new THREE.BoxGeometry(0.65, 0.15, 0.65), iron, 0, 0.45, 0.15),
  );
}

export function house(p, ctx) {
  const h = houseSpec(p);
  const random = rng(`housekit${p.seed ?? 0}`);
  const g = group();
  const wall = sidingPaint(h.siding);
  const roof = roofPaint(h.roof);
  const white = trim();
  const base = h.base;
  const wallsH = h.wallH - base;

  // Foundation, walls, corner boards, the band between floors.
  g.add(
    part(
      new THREE.BoxGeometry(h.w + 0.3, base, h.d + 0.3),
      paint("#9a978f", { roughness: 0.95 }),
      0,
      base / 2,
      0,
    ),
  );
  const faces = [
    [0, h.d / 2, 0, h.w],
    [0, -h.d / 2, Math.PI, h.w],
    [h.w / 2, 0, Math.PI / 2, h.d],
    [-h.w / 2, 0, -Math.PI / 2, h.d],
  ];
  for (const [x, z, ry, width] of faces) {
    const face = part(tiledPlane(width, wallsH, SIDING_TILE), wall, x, base + wallsH / 2, z);
    face.rotation.y = ry;
    g.add(face);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(
        part(
          new THREE.BoxGeometry(0.5, wallsH, 0.5),
          white,
          (sx * h.w) / 2,
          base + wallsH / 2,
          (sz * h.d) / 2,
        ),
      );
    }
  }
  if (h.floors > 1) {
    for (const sz of [-1, 1]) {
      g.add(
        part(new THREE.BoxGeometry(h.w + 0.4, 0.4, 0.3), white, 0, base + STOREY, (sz * h.d) / 2),
      );
    }
  }

  const top = group(gableRoof(h.w, h.d, h.roofH, roof, wall));
  top.position.y = h.wallH;
  g.add(top);
  if (h.chimney) {
    const cx = (random() < 0.5 ? -1 : 1) * (h.w / 2 - 3.2);
    const tall = h.roofH + 3.2;
    g.add(part(tiledBox(2.2, tall, 2.2, 3), brickPaint(), cx, h.wallH - 1 + tall / 2, -h.d * 0.18));
    g.add(
      part(
        new THREE.BoxGeometry(2.6, 0.35, 2.6),
        paint("#6d6a66"),
        cx,
        h.wallH - 1 + tall + 0.17,
        -h.d * 0.18,
      ),
    );
  }

  // Windows: the ground floor around the door, the upper floor in a row, the sides and the back.
  const curtain = CURTAINS[Math.floor(random() * CURTAINS.length)];
  const win = (x, y, z, ry, i) => {
    const unit = windowUnit(3.6, 4.2, {
      curtain,
      lit: ctx.lit && random() < 0.8,
      shutters: ry === 0 ? h.shutters : null,
      seed: i % 3,
    });
    unit.position.set(x, y, z);
    unit.rotation.y = ry;
    g.add(unit);
  };
  const ground = base + 2.3;
  const upper = base + STOREY + 2.1;
  let n = 0;
  for (const x of [-h.w / 2 + 4.6, -h.w / 6, h.w / 6, h.w / 2 - 4.6]) {
    if (Math.abs(x - h.doorX) > 4.2) win(x, ground, h.d / 2 + 0.02, 0, n++);
  }
  if (h.floors > 1) {
    for (const x of [-h.w / 2 + 5, 0, h.w / 2 - 5]) win(x, upper, h.d / 2 + 0.02, 0, n++);
  }
  for (const side of [-1, 1]) {
    const hasGarage = h.garage?.side === side;
    if (!hasGarage) win((side * h.w) / 2 + side * 0.02, ground, 0, (side * Math.PI) / 2, n++);
    if (h.floors > 1) win((side * h.w) / 2 + side * 0.02, upper, 0, (side * Math.PI) / 2, n++);
  }
  for (const x of [-h.w / 4 - 1, h.w / 4 + 1]) {
    win(x, ground, -h.d / 2 - 0.02, Math.PI, n++);
    if (h.floors > 1) win(x, upper, -h.d / 2 - 0.02, Math.PI, n++);
  }

  // The front door with its frame and lamp, and the back door.
  const framed = (x, z, ry, color) => {
    const frame = group(
      part(
        new THREE.BoxGeometry(0.4, meters(2.1) + 0.5, 0.3),
        white,
        -meters(0.9) / 2 - 0.2,
        (meters(2.1) + 0.5) / 2,
        0,
      ),
      part(
        new THREE.BoxGeometry(0.4, meters(2.1) + 0.5, 0.3),
        white,
        meters(0.9) / 2 + 0.2,
        (meters(2.1) + 0.5) / 2,
        0,
      ),
      part(new THREE.BoxGeometry(meters(0.9) + 1.2, 0.5, 0.35), white, 0, meters(2.1) + 0.25, 0),
    );
    const leaf = door(color);
    leaf.position.z = -0.05;
    frame.add(leaf);
    const lamp = wallLamp(ctx.lit);
    lamp.position.set(meters(0.9) / 2 + 1.1, meters(1.9), 0.1);
    frame.add(lamp);
    frame.position.set(x, base, z);
    frame.rotation.y = ry;
    g.add(frame);
  };
  framed(h.doorX, h.d / 2 + 0.1, 0, h.door);
  framed(0, -h.d / 2 - 0.1, Math.PI, "#f4f2ec");

  // The porch (or a step) at the front door.
  const deck = deckPaint();
  const front = h.d / 2;
  let pathFrom = front + 1.6;
  if (h.porch) {
    const pr = h.porch;
    g.add(
      part(
        tiledBox(pr.w, DECK_HEIGHT, pr.d, DECK_TILE),
        deck,
        pr.x,
        DECK_HEIGHT / 2,
        front + pr.d / 2,
      ),
    );
    g.add(part(tiledBox(4, 0.22, 1.1, DECK_TILE), deck, pr.x, 0.11, front + pr.d + 0.55));
    for (const side of [-1, 1]) {
      const px = pr.x + side * (pr.w / 2 - 0.45);
      g.add(
        part(
          new THREE.BoxGeometry(0.5, pr.roofY - DECK_HEIGHT, 0.5),
          white,
          px,
          (pr.roofY + DECK_HEIGHT) / 2,
          front + pr.d - 0.45,
        ),
      );
      // A low railing from the post back to the house.
      g.add(
        part(
          new THREE.BoxGeometry(0.2, 0.2, pr.d - 0.9),
          white,
          px,
          DECK_HEIGHT + 2.6,
          front + (pr.d - 0.9) / 2,
        ),
      );
      for (let k = 0; k < 6; k++) {
        g.add(
          part(
            new THREE.BoxGeometry(0.14, 2.5, 0.14),
            white,
            px,
            DECK_HEIGHT + 1.3,
            front + 0.4 + (k * (pr.d - 1.4)) / 5,
          ),
        );
      }
    }
    g.add(
      part(
        new THREE.BoxGeometry(pr.w + 0.6, 0.5, 0.35),
        white,
        pr.x,
        pr.roofY - 0.25,
        front + pr.d - 0.2,
      ),
    );
    g.add(
      part(
        tiledBox(pr.w + 0.6, 0.4, pr.d + 0.5, ROOF_TILE),
        roof,
        pr.x,
        pr.roofY + 0.2,
        front + pr.d / 2,
      ),
    );
    pathFrom = front + pr.d + 1.1;
  } else {
    g.add(
      part(
        new THREE.BoxGeometry(3.8, base, 1.6),
        paint("#b8b5ad", { roughness: 0.9 }),
        h.doorX,
        base / 2,
        front + 0.8,
      ),
    );
  }
  const paving = pavingPaint();
  const reach = front + (p.drive ?? 12);
  if (reach > pathFrom) g.add(groundStrip(h.doorX, pathFrom, reach, 2.6, paving));

  // The garage, its door and the driveway to the street.
  if (h.garage) {
    const gg = h.garage;
    const gx = gg.side * (h.w / 2 + gg.w / 2);
    const gz = -(h.d - gg.d) / 2;
    g.add(part(tiledBox(gg.w, gg.h, gg.d, SIDING_TILE), wall, gx, gg.h / 2, gz));
    const groof = group(gableRoof(gg.w, gg.d, gg.roofH, roof, wall, 0.7));
    groof.position.set(gx, gg.h, gz);
    g.add(groof);
    const gdoor = part(
      cachedGeometry("garageDoorPlane", () => new THREE.PlaneGeometry(8, 6.4)),
      paint("#ffffff", { map: garageDoorTexture(), roughness: 0.5 }),
      gx,
      3.2,
      gz + gg.d / 2 + 0.03,
    );
    g.add(gdoor);
    g.add(part(new THREE.BoxGeometry(8.8, 0.45, 0.3), white, gx, 6.6, gz + gg.d / 2 + 0.1));
    for (const side of [-1, 1])
      g.add(
        part(
          new THREE.BoxGeometry(0.4, 6.6, 0.3),
          white,
          gx + side * 4.2,
          3.3,
          gz + gg.d / 2 + 0.1,
        ),
      );
    if (reach > gz + gg.d / 2) g.add(groundStrip(gx, gz + gg.d / 2, reach, 9, paving));
  }
  return g;
}

export function car(p) {
  const body = paint(p.color ?? "#3b5dc9", { roughness: 0.28, metalness: 0.35 });
  const dark = paint("#1e2026", { roughness: 0.6 });
  const glass = paint("#2a3d50", { roughness: 0.05, metalness: 0.55 });
  const chrome = paint("#c9ccd2", { roughness: 0.25, metalness: 0.8 });
  const lit = p.lights ?? false;
  const g = group(
    part(roundedBox(13, 2.2, 5.2, 0.7), body, 0, 2.0, 0),
    part(roundedBox(7, 1.9, 4.6, 0.6), body, -0.6, 3.95, 0),
    // Windows: two on each side with a pillar between, the windshield and the rear window.
    part(new THREE.BoxGeometry(2.9, 1.15, 0.08), glass, 0.95, 4.05, 2.31),
    part(new THREE.BoxGeometry(2.6, 1.15, 0.08), glass, -2.15, 4.05, 2.31),
    part(new THREE.BoxGeometry(2.9, 1.15, 0.08), glass, 0.95, 4.05, -2.31),
    part(new THREE.BoxGeometry(2.6, 1.15, 0.08), glass, -2.15, 4.05, -2.31),
    part(new THREE.BoxGeometry(0.08, 1.2, 3.8), glass, 2.92, 4.02, 0),
    part(new THREE.BoxGeometry(0.08, 1.1, 3.6), glass, -4.12, 4.05, 0),
    part(new THREE.BoxGeometry(0.1, 0.6, 2.6), dark, 6.52, 1.9, 0),
    part(roundedBox(0.6, 0.8, 5.3, 0.25), dark, 6.5, 1.2, 0),
    part(roundedBox(0.6, 0.8, 5.3, 0.25), dark, -6.5, 1.2, 0),
  );
  const front = lit ? glowing("#fff2c8", 2.2) : paint("#f4f2e8", { roughness: 0.15 });
  const rear = glowing("#ff3434", lit ? 1.6 : 0.45);
  for (const z of [-1.8, 1.8]) {
    g.add(part(new THREE.BoxGeometry(0.2, 0.55, 1.1), front, 6.45, 2.35, z, { cast: false }));
    g.add(part(new THREE.BoxGeometry(0.2, 0.5, 1.0), rear, -6.45, 2.45, z, { cast: false }));
    g.add(part(new THREE.BoxGeometry(0.5, 0.35, 0.5), body, 2.1, 3.6, z * 1.45));
  }
  const wheel = cachedGeometry("carWheel", () =>
    new THREE.CylinderGeometry(1.15, 1.15, 0.8, 22).rotateX(Math.PI / 2),
  );
  const hub = cachedGeometry("carHub", () =>
    new THREE.CylinderGeometry(0.55, 0.55, 0.84, 14).rotateX(Math.PI / 2),
  );
  for (const x of [-4.1, 4.1]) {
    for (const z of [-2.35, 2.35]) {
      g.add(part(wheel, dark, x, 1.15, z));
      g.add(part(hub, chrome, x, 1.15, z));
    }
  }
  return g;
}

export function lamp(p, ctx) {
  const tall = p.tall ?? meters(3.6);
  const iron = paint("#23262d", { roughness: 0.45, metalness: 0.6 });
  const g = group(
    part(new THREE.CylinderGeometry(0.45, 0.6, 0.7, 12), iron, 0, 0.35, 0),
    part(new THREE.CylinderGeometry(0.15, 0.22, tall, 10), iron, 0, tall / 2, 0),
    part(new THREE.CylinderGeometry(0.42, 0.25, 0.3, 8), iron, 0, tall + 0.05, 0),
    part(
      new THREE.BoxGeometry(0.95, 1.25, 0.95),
      ctx.lit ? glowing("#ffd48a", 2.4) : paint("#e8eef2", { roughness: 0.1, metalness: 0.2 }),
      0,
      tall + 0.85,
      0,
      { cast: false },
    ),
  );
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(part(new THREE.BoxGeometry(0.1, 1.35, 0.1), iron, sx * 0.5, tall + 0.85, sz * 0.5));
    }
  }
  const cap = part(new THREE.ConeGeometry(0.95, 0.65, 4), iron, 0, tall + 1.78, 0);
  cap.rotation.y = Math.PI / 4;
  g.add(cap);
  return g;
}

export function mailbox(p) {
  const random = rng(`mailbox${p.seed ?? 0}`);
  const color = p.color ?? ["#2f2f35", "#29366f", "#b13e53", "#f4f2ec"][Math.floor(random() * 4)];
  return group(
    part(new THREE.BoxGeometry(0.32, 2.6, 0.32), paint("#6b4a32", { roughness: 0.8 }), 0, 1.3, 0),
    part(
      roundedBox(0.85, 0.85, 1.55, 0.3),
      paint(color, { roughness: 0.4, metalness: 0.3 }),
      0,
      2.98,
      0,
    ),
    part(new THREE.BoxGeometry(0.06, 0.6, 0.25), paint("#e8344e"), 0.46, 3.2, -0.3),
  );
}

export function hydrant() {
  const red = paint("#d8343e", { roughness: 0.4 });
  const yellow = paint("#f4c542", { roughness: 0.4 });
  const g = group(
    part(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 14), red, 0, 0.12, 0),
    part(new THREE.CylinderGeometry(0.42, 0.45, 1.45, 14), red, 0, 0.95, 0),
    part(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 1.67, 0),
    part(new THREE.CylinderGeometry(0.14, 0.18, 0.4, 8), yellow, 0, 2.1, 0),
  );
  for (const r of [0, Math.PI / 2, Math.PI]) {
    const nozzle = part(
      new THREE.CylinderGeometry(0.17, 0.17, 0.42, 10),
      yellow,
      Math.cos(r) * 0.5,
      1.25,
      Math.sin(r) * 0.5,
    );
    nozzle.rotation.set(0, -r, Math.PI / 2);
    g.add(nozzle);
  }
  return g;
}

export function bin(p) {
  const random = rng(`bin${p.seed ?? 0}`);
  const color = p.color ?? ["#2f6b45", "#29366f", "#4a4f57"][Math.floor(random() * 3)];
  const body = paint(color, { roughness: 0.55 });
  const g = group(
    part(roundedBox(1.8, 2.55, 2.0, 0.15), body, 0, 1.3, 0),
    part(roundedBox(1.95, 0.25, 2.2, 0.08), paint(color, { roughness: 0.45 }), 0, 2.68, 0.05),
    part(new THREE.BoxGeometry(1.6, 0.18, 0.18), paint("#1e2026"), 0, 2.4, -1.12),
  );
  for (const x of [-0.75, 0.75]) {
    const w = part(
      new THREE.CylinderGeometry(0.35, 0.35, 0.22, 12),
      paint("#1e2026"),
      x,
      0.35,
      -0.9,
    );
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  return g;
}

export function deck(p) {
  const w = p.w ?? 20;
  const d = p.d ?? 10;
  const wood = deckPaint(p.color ?? "#8d5f3f");
  return group(
    part(tiledBox(w, DECK_HEIGHT, d, DECK_TILE), wood, 0, DECK_HEIGHT / 2, 0),
    part(tiledBox(w * 0.4, 0.22, 1.1, DECK_TILE), wood, 0, 0.11, d / 2 + 0.55),
  );
}

/** Posts and the lights strung between them. Built where the piece says (its anchors and posts are in the place). */
export function stringLights(p, ctx) {
  const lift = p.y ?? 0;
  const tall = p.tall ?? 8;
  const g = group();
  const wood = paint("#6b4a32", { roughness: 0.8 });
  for (const [x, z] of p.posts ?? [])
    g.add(part(new THREE.BoxGeometry(0.4, tall, 0.4), wood, x, tall / 2, z));
  const wire = paint("#1e2026", { roughness: 0.7 });
  const bulb = ctx.lit ? glowing("#ffcf7a", 3) : paint("#f4ecd8", { roughness: 0.3 });
  const anchors = p.anchors ?? [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const [ax, az, ay] = anchors[i];
    const [bx, bz, by] = anchors[i + 1];
    const points = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      points.push(
        new THREE.Vector3(
          ax + (bx - ax) * t,
          ay - lift + (by - ay) * t - 1.2 * 4 * t * (1 - t),
          az + (bz - az) * t,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(points);
    g.add(part(new THREE.TubeGeometry(curve, 24, 0.04, 4), wire, 0, 0, 0, { cast: false }));
    const count = Math.max(2, Math.round(curve.getLength() / 1.4));
    for (let k = 1; k < count; k++) {
      const at = curve.getPoint(k / count);
      g.add(
        part(
          cachedGeometry("bulb", () => new THREE.SphereGeometry(0.14, 8, 6)),
          bulb,
          at.x,
          at.y - 0.18,
          at.z,
          { cast: false },
        ),
      );
    }
  }
  return g;
}
