// Rooms: the living room and the bedroom (sofas, an armchair, tables with things on them, a bookcase, a coat rack,
// a bed, a wardrobe, a beanbag, a toy box) and what hangs on walls and ceilings (windows with curtains, framed doors,
// pictures, a clock, ceiling lights, a wall shelf). Sizes come from shapes.js; `ctx` is { lit, night, sky }.
import * as THREE from "three";
import { glowing, group, kind, part, tiledBox, trim } from "./kit-parts.js";
import {
  bed as plainBed,
  chair as plainChair,
  door as plainDoor,
  floorLamp as plainFloorLamp,
  nightstand as plainNightstand,
  picture as plainPicture,
  plant as plainPlant,
  rug as plainRug,
  sofa as plainSofa,
  tv as plainTv,
  tableLamp,
} from "./props.js";
import { meters, SEAT_HEIGHT } from "./sizes.js";
import { fabric, planks } from "./textures.js";
import { cachedGeometry, canvasTexture, paint, rng, roundedBox } from "./util.js";

const BOOKS = [
  "#e8344e",
  "#3b5dc9",
  "#f4c542",
  "#38b764",
  "#ef7d57",
  "#5d275d",
  "#257179",
  "#f2efe6",
];
const woodPaint = (color, count = 5) =>
  paint("#ffffff", { ...planks(color, [1, 1], { count }), roughness: 0.6, bumpScale: 1 });
const fabricPaint = (color) =>
  paint("#ffffff", { ...fabric(color), roughness: 0.95, bumpScale: 0.8 });

/** A row of books standing on a shelf from x0 to x1 (bottom at y, set back to z). */
function books(g, x0, x1, y, z, seed, depth = 0.9) {
  const random = rng(`books${seed}`);
  let x = x0;
  while (x < x1 - 0.2) {
    const w = 0.2 + random() * 0.18;
    const h = 0.85 + random() * 0.45;
    const lean = random() < 0.08 ? 0.25 : 0;
    const book = part(
      roundedBox(w, h, depth, 0.03),
      paint(BOOKS[Math.floor(random() * BOOKS.length)], { roughness: 0.7 }),
      x + w / 2,
      y + h / 2,
      z,
    );
    book.rotation.z = lean;
    g.add(book);
    x += w + 0.03 + (random() < 0.1 ? 0.5 : 0);
  }
}

export function sofa(p) {
  const g = plainSofa(p.color, p.w ?? 9);
  const w = p.w ?? 9;
  const pillow = fabricPaint(p.accent ?? "#f2d7a6");
  for (const side of [-1, 1]) {
    const m = part(
      roundedBox(1.5, 1.4, 0.45, 0.2),
      pillow,
      side * (w / 2 - 1.7),
      SEAT_HEIGHT + 0.65,
      -0.2,
    );
    m.rotation.set(-0.25, side * 0.25, side * 0.12);
    g.add(m);
  }
  return g;
}

export function armchair(p) {
  const cushion = fabricPaint(p.color ?? "#c96f4a");
  const frame = fabricPaint(new THREE.Color(p.color ?? "#c96f4a").multiplyScalar(0.8).getStyle());
  const g = group(
    part(
      roundedBox(3.2, SEAT_HEIGHT - 0.38, 3.2, 0.18),
      frame,
      0,
      0.12 + (SEAT_HEIGHT - 0.38) / 2,
      0,
    ),
    kind(part(roundedBox(2.3, 0.3, 2.8, 0.15), cushion, 0, SEAT_HEIGHT - 0.15, 0.15), "seat"),
    part(roundedBox(3.4, 2.6, 0.8, 0.25), frame, 0, 0.12 + 1.3, -1.2),
    part(
      roundedBox(0.6, SEAT_HEIGHT + 0.95, 3.2, 0.22),
      frame,
      -1.45,
      0.12 + (SEAT_HEIGHT + 0.95) / 2,
      0,
    ),
    part(
      roundedBox(0.6, SEAT_HEIGHT + 0.95, 3.2, 0.22),
      frame,
      1.45,
      0.12 + (SEAT_HEIGHT + 0.95) / 2,
      0,
    ),
  );
  for (const x of [-1.4, 1.4]) {
    for (const z of [-1.3, 1.3])
      g.add(part(new THREE.BoxGeometry(0.25, 0.14, 0.25), paint("#3a2a20"), x, 0.06, z));
  }
  return g;
}

/** A table with a wooden top; `items` puts things on it: "desk" (a computer, a lamp, books), "dinner", "coffee". */
export function table(p, ctx) {
  const w = p.w ?? 5;
  const d = p.d ?? 2.4;
  const h = p.h ?? 1.35;
  const top = p.color ? paint(p.color, { roughness: 0.5 }) : woodPaint(p.wood ?? "#8b5a35", 4);
  const legs = paint(p.legs ?? p.color ?? "#6b4a32", { roughness: 0.6 });
  // The table itself is what the Places sheet measures; the things on it sit beside it in the group.
  const desk = group(part(tiledBox(w, 0.3, d, 3), top, 0, h - 0.15, 0));
  for (const x of [-w / 2 + 0.35, w / 2 - 0.35]) {
    for (const z of [-d / 2 + 0.35, d / 2 - 0.35])
      desk.add(part(new THREE.BoxGeometry(0.3, h - 0.3, 0.3), legs, x, (h - 0.3) / 2, z));
  }
  const g = group(kind(desk, "table"));
  if (p.items === "desk") {
    const dark = paint("#1e2026", { roughness: 0.4 });
    g.add(part(new THREE.BoxGeometry(2.2, 1.35, 0.12), dark, -0.8, h + 1.25, -0.6));
    g.add(
      part(
        new THREE.PlaneGeometry(2.0, 1.15),
        ctx.lit ? glowing("#7fb6e6", 0.9) : paint("#22313f", { roughness: 0.15, metalness: 0.3 }),
        -0.8,
        h + 1.25,
        -0.53,
        { cast: false },
      ),
    );
    g.add(part(new THREE.BoxGeometry(0.2, 0.6, 0.2), dark, -0.8, h + 0.3, -0.65));
    g.add(part(new THREE.BoxGeometry(0.9, 0.06, 0.5), dark, -0.8, h + 0.03, -0.75));
    g.add(part(new THREE.BoxGeometry(1.7, 0.08, 0.55), paint("#d9dbe0"), -0.8, h + 0.04, 0.25));
    const lamp = tableLamp(ctx.lit);
    lamp.position.set(1.8, h, -0.5);
    g.add(lamp);
    for (let k = 0; k < 3; k++) {
      g.add(
        part(
          roundedBox(1.1, 0.18, 0.8, 0.04),
          paint(BOOKS[k * 2], { roughness: 0.7 }),
          1.5,
          h + 0.09 + k * 0.19,
          0.45,
        ),
      );
    }
  } else if (p.items === "dinner") {
    g.add(
      part(
        new THREE.CylinderGeometry(0.75, 0.45, 0.4, 18),
        paint("#f2efe6", { roughness: 0.4 }),
        0,
        h + 0.2,
        0,
      ),
    );
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.add(
        part(
          cachedGeometry("fruit", () => new THREE.SphereGeometry(0.28, 12, 8)),
          paint(["#e8344e", "#f4c542", "#ef7d57", "#38b764", "#e8344e"][k], { roughness: 0.45 }),
          Math.cos(a) * 0.35,
          h + 0.5,
          Math.sin(a) * 0.35,
        ),
      );
    }
    for (const [x, z] of [
      [-w / 4, -d / 2 + 0.6],
      [w / 4, -d / 2 + 0.6],
      [-w / 4, d / 2 - 0.6],
      [w / 4, d / 2 - 0.6],
    ]) {
      g.add(
        part(
          new THREE.CylinderGeometry(0.5, 0.45, 0.06, 18),
          paint("#e6e1d6", { roughness: 0.5 }),
          x,
          h + 0.03,
          z,
          { cast: false },
        ),
      );
    }
  } else if (p.items === "school") {
    const page = paint("#fbf8f1", { roughness: 0.7, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const leaf = part(new THREE.PlaneGeometry(0.75, 1.0), page, side * 0.37, h + 0.04, 0.1, {
        cast: false,
      });
      leaf.rotation.set(-Math.PI / 2, side * 0.12, 0);
      g.add(leaf);
    }
    const pencil = part(
      new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6),
      paint("#f4c542"),
      0.9,
      h + 0.05,
      0.3,
    );
    pencil.rotation.set(0, 0.5, Math.PI / 2);
    g.add(pencil);
  } else if (p.items === "coffee") {
    g.add(
      part(
        roundedBox(1.3, 0.12, 0.9, 0.03),
        paint("#3b5dc9", { roughness: 0.7 }),
        -1.2,
        h + 0.06,
        0.2,
      ),
    );
    g.add(
      part(
        roundedBox(1.2, 0.12, 0.85, 0.03),
        paint("#f4c542", { roughness: 0.7 }),
        -1.15,
        h + 0.18,
        0.15,
      ),
    );
    g.add(
      part(
        new THREE.CylinderGeometry(0.22, 0.2, 0.4, 12),
        paint("#f2efe6", { roughness: 0.4 }),
        1.4,
        h + 0.2,
        -0.3,
      ),
    );
  }
  return g;
}

export function chair(p) {
  return plainChair(p.color);
}

export function floorLamp(p, ctx) {
  return plainFloorLamp(ctx.lit && p.on !== false);
}

export function plant() {
  return plainPlant();
}

export function tv(_p, ctx) {
  return plainTv(ctx.night);
}

export function bookcase(p) {
  const wood = woodPaint(p.wood ?? "#6b4a32", 4);
  const g = group(
    part(tiledBox(4, 6, 0.2, 3), wood, 0, 3, -0.61),
    part(tiledBox(0.2, 6, 1.42, 3), wood, -1.9, 3, 0),
    part(tiledBox(0.2, 6, 1.42, 3), wood, 1.9, 3, 0),
    part(tiledBox(4, 0.2, 1.42, 3), wood, 0, 5.9, 0),
  );
  for (let row = 0; row < 4; row++) {
    const y = 0.15 + row * 1.5;
    g.add(part(tiledBox(3.6, 0.15, 1.3, 3), wood, 0, y, 0));
    books(g, -1.75, row === 2 ? 0.6 : 1.75, y + 0.08, 0.05, `${p.seed ?? "bc"}${row}`);
    if (row === 2) {
      g.add(
        part(
          new THREE.SphereGeometry(0.35, 12, 8),
          paint("#41a6f6", { roughness: 0.3 }),
          1.2,
          y + 0.43,
          0.1,
        ),
      );
    }
  }
  return g;
}

export function coatRack(p) {
  const wood = paint("#6b4a32", { roughness: 0.6 });
  const g = group(
    part(new THREE.CylinderGeometry(0.75, 0.85, 0.2, 16), wood, 0, 0.1, 0),
    part(new THREE.CylinderGeometry(0.1, 0.13, 6, 8), wood, 0, 3, 0),
    part(new THREE.SphereGeometry(0.2, 10, 8), wood, 0, 6.05, 0),
  );
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const hook = part(
      new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6),
      wood,
      Math.cos(a) * 0.25,
      5.6,
      Math.sin(a) * 0.25,
    );
    hook.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    g.add(hook);
  }
  const random = rng(`coats${p.seed ?? 0}`);
  for (const [a, color] of [
    [0.3, "#b13e53"],
    [2.4, "#29366f"],
  ]) {
    const coat = part(
      roundedBox(1.0, 2.6, 0.5, 0.25),
      fabricPaint(color),
      Math.cos(a) * 0.45,
      4.2,
      Math.sin(a) * 0.45,
    );
    coat.rotation.y = -a + random() * 0.2;
    g.add(coat);
  }
  return g;
}

export function bed(p) {
  return plainBed(p.color);
}

export function nightstand(p, ctx) {
  const g = plainNightstand();
  if (p.lamp) {
    const lamp = tableLamp(ctx.lit);
    lamp.position.y = 2;
    g.add(lamp);
    g.add(
      part(
        roundedBox(0.7, 0.16, 0.55, 0.03),
        paint("#3b5dc9", { roughness: 0.7 }),
        0.55,
        2.08,
        0.4,
      ),
    );
  }
  return g;
}

export function toyBox(p) {
  const color = p.color ?? "#3b5dc9";
  const g = group(
    part(roundedBox(1.7, 1.3, 1.7, 0.12), paint(color, { roughness: 0.5 }), 0, 0.65, 0),
    part(roundedBox(1.8, 0.25, 1.8, 0.1), paint("#f4c542", { roughness: 0.5 }), 0, 1.42, 0),
    part(
      new THREE.SphereGeometry(0.28, 12, 8),
      paint("#e8344e", { roughness: 0.4 }),
      0.4,
      1.75,
      0.3,
    ),
  );
  const star = canvasTexture("toyStar", 64, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? s * 0.18 : s * 0.4;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    ctx.fill();
  });
  g.add(
    part(new THREE.PlaneGeometry(1.0, 1.0), paint("#ffffff", { map: star }), 0, 0.65, 0.87, {
      cast: false,
    }),
  );
  return g;
}

export function wardrobe(p) {
  const wood = woodPaint(p.wood ?? "#b88a5a", 3);
  const g = group(
    part(tiledBox(3.6, 6.0, 1.8, 3), wood, 0, 3.05, 0),
    part(new THREE.BoxGeometry(3.8, 0.25, 1.95), paint("#8a6440"), 0, 6.15, 0),
    part(new THREE.BoxGeometry(3.5, 0.2, 1.7), paint("#3a2a20"), 0, 0.1, 0),
    part(new THREE.BoxGeometry(0.06, 5.6, 0.05), paint("#5e412b"), 0, 3.05, 0.91),
  );
  for (const x of [-0.22, 0.22])
    g.add(
      part(
        new THREE.BoxGeometry(0.1, 0.8, 0.12),
        paint("#c9a36a", { metalness: 0.6, roughness: 0.3 }),
        x,
        3.4,
        0.95,
      ),
    );
  return g;
}

export function beanbag(p) {
  const cloth = fabricPaint(p.color ?? "#ef7d57");
  const outer = part(
    cachedGeometry("beanbag", () => new THREE.SphereGeometry(1.5, 20, 12)),
    cloth,
    0,
    0.55,
    0,
  );
  outer.scale.set(1, 0.42, 1);
  const seat = kind(
    part(
      cachedGeometry("beanbagSeat", () => new THREE.CylinderGeometry(0.9, 1.1, 0.2, 18)),
      cloth,
      0,
      SEAT_HEIGHT - 0.1,
      0.1,
    ),
    "seat",
  );
  const back = part(
    cachedGeometry("beanbagBack", () => new THREE.SphereGeometry(1.1, 16, 10)),
    cloth,
    0,
    0.95,
    -0.75,
  );
  back.scale.set(1.15, 0.55, 0.6);
  return group(outer, seat, back);
}

/** A window in a wall, `w` × `h`, its sill `y` high (the piece's y): the sky or the night outside, and curtains. */
export function wallWindow(p, ctx) {
  const w = p.w ?? 5;
  const h = p.h ?? 4;
  const frame = trim();
  const g = group(
    part(
      new THREE.PlaneGeometry(w, h),
      glowing(ctx.sky ?? "#bfe3ff", ctx.night ? 0.45 : 0.85),
      0,
      h / 2,
      0.02,
      { cast: false },
    ),
    part(new THREE.BoxGeometry(w + 0.5, 0.3, 0.4), frame, 0, -0.15, 0.1),
    part(new THREE.BoxGeometry(w + 0.5, 0.3, 0.4), frame, 0, h + 0.15, 0.1),
    part(new THREE.BoxGeometry(0.3, h, 0.4), frame, -w / 2 - 0.1, h / 2, 0.1),
    part(new THREE.BoxGeometry(0.3, h, 0.4), frame, w / 2 + 0.1, h / 2, 0.1),
    part(new THREE.BoxGeometry(0.18, h, 0.3), frame, 0, h / 2, 0.1),
    part(new THREE.BoxGeometry(w, 0.18, 0.3), frame, 0, h / 2, 0.1),
    part(new THREE.BoxGeometry(w + 0.9, 0.25, 0.8), frame, 0, -0.35, 0.3),
  );
  if (p.curtain !== null) {
    const cloth = fabricPaint(p.curtain ?? "#f2d7a6");
    // Long curtains fall to the floor (the piece's y is the sill's height); short ones just below the sill.
    const fall = p.long ? h + 0.8 + (p.y ?? 0) : h + 1.6;
    for (const side of [-1, 1]) {
      const curtain = part(
        roundedBox(1.3, fall, 0.3, 0.12),
        cloth,
        side * (w / 2 + 0.6),
        h + 0.7 - fall / 2,
        0.5,
      );
      g.add(curtain);
    }
    g.add(
      part(
        new THREE.CylinderGeometry(0.07, 0.07, w + 2.6, 8).rotateZ(Math.PI / 2),
        paint("#4a4f57", { metalness: 0.5, roughness: 0.4 }),
        0,
        h + 0.8,
        0.55,
      ),
    );
  }
  return g;
}

/** A door in a wall, with its frame: 2.1 m by 90 cm. */
export function door(p) {
  const frame = trim();
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
  g.add(plainDoor(p.color ?? "#8b5a35"));
  return g;
}

export function picture(p) {
  return plainPicture(p.w ?? 2, p.h ?? 1.6, p.seed ?? "art");
}

/** A round wall clock (its hands at ten past ten). */
export function clock() {
  const face = canvasTexture("clockFace", 128, (ctx, s) => {
    ctx.fillStyle = "#fbf8f1";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#2b2f3a";
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.fillRect(s / 2 + Math.cos(a) * s * 0.4 - 3, s / 2 + Math.sin(a) * s * 0.4 - 3, 6, 6);
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2b2f3a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + s * 0.2, s / 2 - s * 0.12);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + s * 0.06, s / 2 - s * 0.33);
    ctx.stroke();
  });
  const rim = part(
    new THREE.CylinderGeometry(0.85, 0.85, 0.2, 28).rotateX(Math.PI / 2),
    paint("#2b2f3a", { roughness: 0.4 }),
    0,
    0,
    0.1,
  );
  const dial = part(
    new THREE.CircleGeometry(0.72, 28),
    paint("#ffffff", { map: face, roughness: 0.4 }),
    0,
    0,
    0.21,
    { cast: false },
  );
  return group(rim, dial);
}

/** A light on the ceiling (the piece's y is the ceiling): glowing when `on` and the lamps are lit. */
export function ceilingLight(p, ctx) {
  const on = p.on && (ctx.lit || p.always);
  const dome = part(
    cachedGeometry(
      "ceilingDome",
      () => new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    ),
    on ? glowing("#fff2d8", 1.4) : paint("#ece7dc", { roughness: 0.6 }),
    0,
    -0.05,
    0,
    { cast: false },
  );
  // A flush light: a shallow, frosted dome.
  dome.scale.set(0.8, 0.35, 0.8);
  return group(
    dome,
    part(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 20), paint("#e8e4da"), 0, -0.05, 0, {
      cast: false,
    }),
  );
}

/** A shelf on the wall (its y is the board's height) with books and a few toys. */
export function wallShelf(p) {
  const w = p.w ?? 5;
  const wood = woodPaint("#b88a5a", 2);
  const g = group(part(tiledBox(w, 0.2, 1.1, 3), wood, 0, 0, 0));
  for (const x of [-w / 2 + 0.6, w / 2 - 0.6])
    g.add(part(new THREE.BoxGeometry(0.15, 0.6, 0.8), paint("#4a4f57"), x, -0.35, -0.1));
  books(g, -w / 2 + 0.3, 0.2, 0.1, 0, p.seed ?? "shelf", 0.8);
  g.add(part(roundedBox(0.7, 0.7, 0.7, 0.12), paint("#e8344e", { roughness: 0.5 }), 0.9, 0.45, 0));
  g.add(
    part(new THREE.SphereGeometry(0.32, 12, 8), paint("#38b764", { roughness: 0.4 }), 1.8, 0.42, 0),
  );
  return g;
}

export function rug(p) {
  return plainRug(p.w ?? 8, p.d ?? 6, p.colors ?? ["#b85c4a", "#f2d7a6"]);
}
