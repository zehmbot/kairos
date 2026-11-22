// School: lockers in a row, a classroom door with its window and number, bulletin boards, a trophy case, a water
// fountain, a bin, the teacher's desk and the whiteboard. Sizes come from shapes.js; `ctx` is { lit, night, sky }.
import * as THREE from "three";
import { group, kind, part, tiledBox, trim } from "./kit-parts.js";
import { lockerTexture, door as plainDoor } from "./props.js";
import { meters } from "./sizes.js";
import { cork, planks } from "./textures.js";
import { cachedGeometry, canvasTexture, paint, rng, roundedBox } from "./util.js";

const woodPaint = (color) =>
  paint("#ffffff", { ...planks(color, [1, 1], { count: 4 }), roughness: 0.6, bumpScale: 1 });

/** `count` lockers side by side along x, their doors facing +z. */
export function lockers(p) {
  const count = p.count ?? 15;
  const material = paint(p.color ?? "#ffffff", {
    map: lockerTexture(),
    roughness: 0.45,
    metalness: 0.15,
  });
  const g = group();
  for (let k = 0; k < count; k++)
    g.add(part(roundedBox(1.9, 6.6, 1.5, 0.08), material, -count + 1 + k * 2, 3.3, 0));
  g.add(
    part(
      new THREE.BoxGeometry(count * 2, 0.4, 1.4),
      paint("#3a3a40", { roughness: 0.8 }),
      0,
      0.2,
      0.02,
    ),
  );
  return g;
}

/** A classroom door: the door with a small window, its frame, and the room's number above. */
export function classroomDoor(p) {
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
  g.add(plainDoor(p.color ?? "#5a6a8a"));
  g.add(
    part(
      new THREE.PlaneGeometry(0.9, 1.6),
      paint("#3e5d7c", { roughness: 0.08, metalness: 0.3 }),
      0,
      4.2,
      0.17,
      { cast: false },
    ),
  );
  const sign = canvasTexture(`roomSign:${p.label ?? "Room 4"}`, 128, (ctx, s) => {
    ctx.fillStyle = "#29366f";
    ctx.fillRect(0, 0, s, s / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.label ?? "Room 4", s / 2, s / 4);
  });
  const plate = part(
    new THREE.PlaneGeometry(2.2, 0.55),
    paint("#ffffff", { map: sign, roughness: 0.5 }),
    0,
    meters(2.1) + 1.0,
    0.15,
    { cast: false },
  );
  g.add(plate);
  return g;
}

/** A cork board with papers pinned to it, in a wooden frame. Its y is its bottom edge. */
export function bulletinBoard(p) {
  const w = p.w ?? 6;
  const h = p.h ?? 3;
  const wood = paint("#8a6440", { roughness: 0.6 });
  return group(
    part(
      new THREE.PlaneGeometry(w, h),
      paint("#ffffff", { ...cork([1, 1]), roughness: 0.9, bumpScale: 1 }),
      0,
      h / 2,
      0.06,
      { cast: false },
    ),
    part(new THREE.BoxGeometry(w + 0.4, 0.25, 0.2), wood, 0, h + 0.1, 0.08),
    part(new THREE.BoxGeometry(w + 0.4, 0.25, 0.2), wood, 0, -0.1, 0.08),
    part(new THREE.BoxGeometry(0.25, h, 0.2), wood, -w / 2 - 0.1, h / 2, 0.08),
    part(new THREE.BoxGeometry(0.25, h, 0.2), wood, w / 2 + 0.1, h / 2, 0.08),
  );
}

/** A glass trophy case on a wooden base, with cups and medals on its shelves. */
export function trophyCase() {
  const wood = woodPaint("#6b4a32");
  const gold = paint("#e8b84a", { roughness: 0.25, metalness: 0.85 });
  const silver = paint("#c9ccd2", { roughness: 0.25, metalness: 0.85 });
  const g = group(
    part(tiledBox(4.5, 2.2, 1.6, 3), wood, 0, 1.1, 0),
    part(tiledBox(4.5, 0.3, 1.6, 3), wood, 0, 7.25, 0),
    part(new THREE.BoxGeometry(4.4, 5, 0.1), paint("#2a2f3a", { roughness: 0.8 }), 0, 4.7, -0.72),
  );
  for (const x of [-2.2, 2.2]) g.add(part(new THREE.BoxGeometry(0.12, 5, 1.5), wood, x, 4.7, 0));
  const random = rng("trophies");
  for (let shelf = 0; shelf < 2; shelf++) {
    const y = 2.2 + shelf * 2.5;
    g.add(
      part(
        new THREE.BoxGeometry(4.3, 0.08, 1.4),
        paint("#d8e6ee", { roughness: 0.1, metalness: 0.2 }),
        0,
        y + 0.04,
        0,
      ),
    );
    for (let k = 0; k < 3; k++) {
      const x = -1.4 + k * 1.4;
      const metal = random() < 0.65 ? gold : silver;
      const tall = 0.9 + random() * 0.8;
      g.add(part(new THREE.BoxGeometry(0.6, 0.3, 0.5), paint("#2f2f35"), x, y + 0.23, 0));
      g.add(
        part(
          new THREE.CylinderGeometry(0.06, 0.08, tall * 0.5, 8),
          metal,
          x,
          y + 0.38 + tall * 0.25,
          0,
        ),
      );
      g.add(
        part(
          new THREE.CylinderGeometry(0.4, 0.15, tall * 0.55, 14),
          metal,
          x,
          y + 0.38 + tall * 0.75,
          0,
        ),
      );
    }
  }
  const glass = new THREE.MeshStandardMaterial({
    color: "#cfe3ee",
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.18,
  });
  g.add(part(new THREE.PlaneGeometry(4.3, 5), glass, 0, 4.7, 0.78, { cast: false }));
  return g;
}

/** A steel water fountain on the wall. */
export function fountain() {
  const steel = paint("#c9ccd2", { roughness: 0.25, metalness: 0.8 });
  return group(
    part(
      new THREE.BoxGeometry(1.2, 2.2, 0.6),
      paint("#9aa0aa", { roughness: 0.4, metalness: 0.5 }),
      0,
      1.1,
      -0.4,
    ),
    part(roundedBox(1.6, 0.55, 1.3, 0.15), steel, 0, 2.6, 0),
    part(
      new THREE.BoxGeometry(1.2, 0.05, 0.9),
      paint("#8f949c", { roughness: 0.3, metalness: 0.7 }),
      0,
      2.88,
      0.05,
    ),
    part(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 8), steel, 0.3, 3.0, -0.2),
    part(
      new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10).rotateX(Math.PI / 2),
      paint("#3b5dc9"),
      -0.45,
      2.6,
      0.66,
    ),
  );
}

/** A round bin. */
export function trashCan(p) {
  const color = p.color ?? "#4a6b8a";
  return group(
    part(
      cachedGeometry("trashCan", () => new THREE.CylinderGeometry(0.78, 0.68, 2.3, 18)),
      paint(color, { roughness: 0.5 }),
      0,
      1.15,
      0,
    ),
    part(
      cachedGeometry("trashRim", () =>
        new THREE.TorusGeometry(0.78, 0.06, 6, 20).rotateX(Math.PI / 2),
      ),
      paint("#2f2f35"),
      0,
      2.3,
      0,
    ),
    part(
      new THREE.CircleGeometry(0.72, 16).rotateX(-Math.PI / 2),
      paint("#1e2026", { roughness: 0.9 }),
      0,
      2.2,
      0,
      { cast: false },
    ),
  );
}

/** The teacher's desk: a wooden top on a drawer pedestal and a side panel, with a globe, an apple and papers. */
export function teacherDesk() {
  const wood = woodPaint("#8b5a35");
  const steel = paint("#c9ccd2", { roughness: 0.25, metalness: 0.8 });
  const desk = group(
    part(tiledBox(5.2, 0.3, 2.6, 3), wood, 0, 2.05, 0),
    part(tiledBox(1.6, 1.9, 2.4, 3), wood, 1.6, 0.95, 0),
    part(tiledBox(5, 1.6, 0.2, 3), wood, 0, 1.1, 1.1),
    part(tiledBox(0.3, 1.9, 2.4, 3), wood, -2.35, 0.95, 0),
  );
  for (const y of [0.5, 1.2])
    desk.add(part(new THREE.BoxGeometry(0.6, 0.08, 0.1), steel, 1.6, y, -1.25));
  const g = group(kind(desk, "table"));
  g.add(part(new THREE.CylinderGeometry(0.35, 0.45, 0.12, 14), paint("#2f2f35"), -1.2, 2.26, -0.2));
  g.add(
    part(
      new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6),
      paint("#c9a36a", { metalness: 0.6 }),
      -1.2,
      2.5,
      -0.2,
    ),
  );
  const globe = canvasTexture("globe", 128, (ctx, s) => {
    ctx.fillStyle = "#3a8fd6";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#5cb85c";
    const random = rng("globe");
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      ctx.ellipse(
        random() * s,
        s * 0.2 + random() * s * 0.6,
        8 + random() * 16,
        6 + random() * 12,
        random() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });
  g.add(
    part(
      new THREE.SphereGeometry(0.6, 20, 14),
      paint("#ffffff", { map: globe, roughness: 0.4 }),
      -1.2,
      3.25,
      -0.2,
    ),
  );
  g.add(
    part(
      new THREE.SphereGeometry(0.25, 12, 8),
      paint("#e8344e", { roughness: 0.35 }),
      0.4,
      2.45,
      0.5,
    ),
  );
  g.add(
    part(roundedBox(1.0, 0.25, 1.3, 0.03), paint("#fbf8f1", { roughness: 0.8 }), 1.4, 2.32, 0.2),
  );
  return g;
}

/** A whiteboard with today's lesson on it, in an aluminium frame with a marker tray. Its y is its bottom edge. */
export function board(p) {
  const w = p.w ?? 14;
  const h = p.h ?? 5.4;
  const lesson = canvasTexture(`lesson:${p.lesson ?? "fractions"}`, 512, (ctx, s) => {
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(0, 0, s, s);
    ctx.lineCap = "round";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#29366f";
    ctx.font = "bold 46px sans-serif";
    ctx.fillText("Today: Fractions", 30, 24);
    ctx.fillStyle = "#b13e53";
    ctx.font = "40px sans-serif";
    ctx.fillText("1/2 + 1/4 = 3/4", 40, 110);
    ctx.fillStyle = "#257179";
    ctx.fillText("Homework: page 12", 40, 175);
    // A pie cut in quarters.
    ctx.strokeStyle = "#29366f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(400, 330, 70, 0, Math.PI * 2);
    ctx.moveTo(330, 330);
    ctx.lineTo(470, 330);
    ctx.moveTo(400, 260);
    ctx.lineTo(400, 400);
    ctx.stroke();
    ctx.fillStyle = "rgba(239,125,87,0.6)";
    ctx.beginPath();
    ctx.moveTo(400, 330);
    ctx.arc(400, 330, 66, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
  });
  const frame = paint("#c9ccd2", { roughness: 0.3, metalness: 0.7 });
  return group(
    part(
      new THREE.PlaneGeometry(w, h),
      paint("#ffffff", { map: lesson, roughness: 0.25 }),
      0,
      h / 2,
      0.06,
      { cast: false },
    ),
    part(new THREE.BoxGeometry(w + 0.4, 0.2, 0.2), frame, 0, h + 0.1, 0.08),
    part(new THREE.BoxGeometry(w + 0.4, 0.2, 0.2), frame, 0, -0.1, 0.08),
    part(new THREE.BoxGeometry(0.2, h, 0.2), frame, -w / 2 - 0.1, h / 2, 0.08),
    part(new THREE.BoxGeometry(0.2, h, 0.2), frame, w / 2 + 0.1, h / 2, 0.08),
    part(new THREE.BoxGeometry(w * 0.6, 0.12, 0.55), frame, 0, -0.25, 0.3),
    part(new THREE.BoxGeometry(0.8, 0.25, 0.3), paint("#2f2f35"), w * 0.2, -0.05, 0.35),
  );
}
