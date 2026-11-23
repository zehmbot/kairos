// Where things are in each place, as plain data (places.js builds the place around it; motion.js walks in it):
// - `spots`: { x, z, rot } where characters stand, sit or lie (rot 0 faces +z, toward the usual camera side), plus
//   `seat` (sitting height) or `bed` (lying height), and `y` for raised ground;
// - `seats`, `beds`: the spots used when a shot sits or lays someone down without saying where;
// - `blocks`: the furniture's footprints { name, x, z, w, d, rot, h } that walks go around (`h`: how high it is,
//   for jumping over it);
// - `solids`: the furniture as physics boxes { x, y, z, w, h, d, rot } (centers and full sizes, measured from the
//   built place); without them, each block counts as a box of its height; `walls`: the room's walls;
// - `bounds`: how far anyone can walk (walls, houses); `ground(x, z)`: raised ground (pavements);
// - `wide`: the establishing shot; `surface`: where small objects sit for close-ups;
// - `pieces`: what stands there, built by kit.js ({ kind, x, z, rot, ... }); their physics boxes, footprints and
//   raised ground (porches, decks) come from shapes.js and join `solids`, `blocks` and `ground` below.
import { DECK_HEIGHT, houseSpec, piecesShapes, raisedAt } from "./shapes.js";
import { BED_HEIGHT, SEAT_HEIGHT } from "./sizes.js";
import { rng } from "./util.js";

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Where a piece's own point (lx, lz) is in the place. */
function onPiece(p, lx, lz) {
  const r = p.rot ?? 0;
  return {
    x: r3(p.x + lx * Math.cos(r) + lz * Math.sin(r)),
    z: r3(p.z - lx * Math.sin(r) + lz * Math.cos(r)),
  };
}

/**
 * A row of houses along the town's street: `side` -1 is the far side (fronts facing +z), 1 the near side. Each house
 * gets a mailbox at the curb, a bin by its driveway, bushes by its door, and the row's picket fence opens at every
 * front path and driveway.
 */
function streetRow({ side, xs, seeds, special = {} }) {
  const z = side * 34;
  const rot = side < 0 ? 0 : Math.PI;
  const flip = side < 0 ? 1 : -1;
  const pieces = [];
  const gaps = [];
  xs.forEach((x, i) => {
    const house = { kind: "house", x, z, rot, seed: seeds[i], drive: 10.6, ...(special[x] ?? {}) };
    const h = houseSpec(house);
    pieces.push(house);
    const doorX = x + flip * h.doorX;
    gaps.push([doorX + 100, 3.2]);
    pieces.push({
      kind: "mailbox",
      x: r3(doorX + 2.6),
      z: side * 8.9,
      y: 0.3,
      rot,
      seed: seeds[i],
    });
    if (h.garage) {
      const gx = x + flip * h.garage.side * (h.w / 2 + h.garage.w / 2);
      gaps.push([gx + 100, 9.4]);
      pieces.push({ kind: "bin", x: r3(gx + 5.8), z: side * 15.4, rot, seed: seeds[i] });
    }
    const random = rng(`row${seeds[i]}`);
    const reach = h.porch ? 7.6 : 3.8;
    for (const lx of [h.doorX - reach, h.doorX + reach]) {
      if (Math.abs(lx) > h.w / 2 - 1.8) continue;
      const at = onPiece(house, lx, h.d / 2 + 1.7);
      pieces.push({
        kind: "bush",
        ...at,
        size: 1.5 + random() * 0.4,
        seed: `${seeds[i]}${lx}`,
        flowers: random() < 0.6 ? ["#e8344e", "#ffffff", "#e86a8a", "#f4c542"][i % 4] : null,
      });
    }
  });
  pieces.push({ kind: "fence", from: [-100, side * 13.6], to: [100, side * 13.6], gaps });
  return pieces;
}

// ---------- Indoors ----------
// A wall thing's `rot` turns its front into the room: the back wall (−z) 0, the left wall (−x) π/2, the right wall
// −π/2, the front wall π. Its `y` is its bottom edge (a ceiling light's: the ceiling).

const HOME_PIECES = [
  { kind: "rug", x: 0, z: -3, w: 13, d: 9, colors: ["#b85c4a", "#f2d7a6"] },
  { kind: "sofa", x: 0, z: -7.6, color: "#4f7f8a" },
  {
    kind: "table",
    x: 0,
    z: -3.3,
    w: 5,
    d: 2.4,
    h: 1.35,
    items: "coffee",
    name: "the coffee table",
  },
  { kind: "floorLamp", x: -7, z: -9 },
  { kind: "plant", x: 6.6, z: -9.3 },
  { kind: "bookcase", x: -12.2, z: -3, rot: Math.PI / 2, name: "the shelf", seed: "home" },
  { kind: "tv", x: 11.8, z: -2, rot: -Math.PI / 2 },
  { kind: "armchair", x: -9.5, z: 3.5, rot: Math.PI / 2, color: "#c96f4a" },
  { kind: "coatRack", x: 12.6, z: -11.4 },
  { kind: "window", x: -5.5, y: 4.2, z: -12.95, w: 6, h: 4.2, curtain: "#f2d7a6", long: true },
  { kind: "door", x: 9, z: -12.85 },
  { kind: "picture", x: 3, y: 5.6, z: -12.92, w: 2.2, h: 1.6, seed: "art1" },
  { kind: "picture", x: 5.8, y: 5.4, z: -12.92, w: 1.4, h: 1.8, seed: "art2" },
  { kind: "picture", x: -14.92, y: 5.2, z: 6.4, rot: Math.PI / 2, w: 1.8, h: 1.4, seed: "family1" },
  { kind: "picture", x: -14.92, y: 5.6, z: 9, rot: Math.PI / 2, w: 1.3, h: 1.7, seed: "family2" },
  { kind: "clock", x: -0.8, y: 8.4, z: -12.9 },
  { kind: "ceilingLight", x: 0, y: 11, z: -1 },
];

const BEDROOM_PIECES = [
  { kind: "rug", x: 2, z: 1, w: 8, d: 6, colors: ["#f4c542", "#ef7d57"] },
  { kind: "bed", x: -6, z: -5.8, color: "#e46a6a" },
  { kind: "nightstand", x: -1.8, z: -9.2, lamp: true },
  {
    kind: "table",
    x: 9.5,
    z: -6,
    rot: -Math.PI / 2,
    w: 5,
    d: 2.4,
    h: 2.2,
    color: "#f4f1ea",
    items: "desk",
    name: "the desk",
  },
  { kind: "chair", x: 7.4, z: -6, rot: -Math.PI / 2, color: "#3b5dc9", name: "the chair" },
  { kind: "toyBox", x: 7, z: 3 },
  { kind: "wardrobe", x: -11.9, z: 4, rot: Math.PI / 2 },
  { kind: "beanbag", x: 2.5, z: 6.5, rot: -0.4, color: "#ef7d57" },
  { kind: "wallShelf", x: 12.85, y: 5.4, z: 4, rot: -Math.PI / 2, w: 5, seed: "bedroom" },
  { kind: "window", x: 5, y: 4, z: -10.95, w: 5, h: 4, curtain: "#c9dcef" },
  { kind: "picture", x: -6, y: 5.6, z: -10.92, w: 2.4, h: 3.2, seed: "poster1" },
  { kind: "picture", x: 12.92, y: 5, z: -2, rot: -Math.PI / 2, w: 2, h: 2, seed: "poster2" },
  { kind: "door", x: 8, z: 10.9, rot: Math.PI },
  { kind: "ceilingLight", x: 1, y: 10.5, z: 0 },
];

const SCHOOL_PIECES = [
  { kind: "lockers", x: -7.72, z: -28, rot: Math.PI / 2, count: 15 },
  { kind: "lockers", x: -7.72, z: 6, rot: Math.PI / 2, count: 15 },
  { kind: "lockers", x: 7.72, z: -28, rot: -Math.PI / 2, count: 15 },
  { kind: "lockers", x: 7.72, z: 6, rot: -Math.PI / 2, count: 15 },
  { kind: "door", style: "classroom", x: -8.45, z: -11, rot: Math.PI / 2, label: "Room 4" },
  { kind: "fountain", x: 7.78, z: -11, rot: -Math.PI / 2 },
  { kind: "clock", x: -8.45, y: 8.7, z: -11, rot: Math.PI / 2 },
  { kind: "bulletinBoard", x: -8.47, y: 7.3, z: -28, rot: Math.PI / 2, w: 8, h: 2.8 },
  { kind: "bulletinBoard", x: 8.47, y: 7.3, z: 6, rot: -Math.PI / 2, w: 8, h: 2.8 },
  {
    kind: "picture",
    x: 8.47,
    y: 7.4,
    z: -24,
    rot: -Math.PI / 2,
    w: 2.4,
    h: 2.4,
    seed: "schoolposter",
  },
  { kind: "picture", x: -8.47, y: 7.4, z: 12, rot: Math.PI / 2, w: 3, h: 1.6, seed: "schoolsign" },
  { kind: "trophyCase", x: -5.8, z: -44.1 },
  { kind: "door", x: -1.7, z: -44.85, color: "#5a6a8a" },
  { kind: "door", x: 1.7, z: -44.85, color: "#5a6a8a" },
  { kind: "window", x: 0, y: 7.3, z: -44.97, w: 6, h: 2, curtain: null },
  { kind: "trashCan", x: 5.8, z: 22.6 },
  { kind: "trashCan", x: 5.2, z: -43.6 },
];

/** The kitchen's chairs around its table (each one a seat). */
const KITCHEN_CHAIRS = [
  { kind: "chair", x: -1.9, z: -1.2, rot: 0, color: "#8b5a35" },
  { kind: "chair", x: 1.9, z: -1.2, rot: 0, color: "#8b5a35" },
  { kind: "chair", x: -1.9, z: 4.2, rot: Math.PI, color: "#8b5a35" },
  { kind: "chair", x: 1.9, z: 4.2, rot: Math.PI, color: "#8b5a35" },
];

const KITCHEN_PIECES = [
  {
    kind: "counter",
    x: -2,
    z: -10.05,
    w: 16,
    sink: -1.5,
    stove: 5,
    uppers: [
      [-8, -4.2],
      [1.2, 8],
    ],
  },
  { kind: "fridge", x: 9.2, z: -9.8 },
  {
    kind: "table",
    x: 0,
    z: 1.5,
    w: 7,
    d: 4,
    h: 2.2,
    items: "dinner",
    wood: "#a8744a",
    name: "the table",
  },
  ...KITCHEN_CHAIRS,
  { kind: "pendant", x: 0, y: 10.5, z: 1.5, drop: 3.2 },
  { kind: "window", x: -3.5, y: 4.4, z: -10.95, w: 4.4, h: 3.4, curtain: "#f3c9c9" },
  { kind: "door", x: -12.85, z: 5, rot: Math.PI / 2 },
  { kind: "clock", x: 12.92, y: 7.6, z: 0, rot: -Math.PI / 2 },
  {
    kind: "picture",
    x: 12.92,
    y: 4.8,
    z: 4.5,
    rot: -Math.PI / 2,
    w: 2.2,
    h: 1.6,
    seed: "kitchenart",
  },
  { kind: "plant", x: 11.4, z: 9.2 },
  { kind: "rug", x: -2, z: -7.3, w: 6, d: 2, colors: ["#3b5dc9", "#f2efe6"] },
];

/** The classroom's desks (two rows of three facing the board) and the chairs behind them (each one a seat). */
const CLASS_DESKS = [];
for (const z of [-2.5, 3.5]) {
  for (const x of [-7, 0, 7]) {
    CLASS_DESKS.push({
      kind: "table",
      x,
      z,
      w: 2.8,
      d: 1.9,
      h: 2.1,
      wood: "#c9a06a",
      legs: "#4a4f57",
      items: "school",
      name: "a desk",
    });
    CLASS_DESKS.push({
      kind: "chair",
      x,
      z: z + 1.6,
      rot: Math.PI,
      color: x === 0 ? "#e8344e" : "#3b5dc9",
    });
  }
}
const deskSeats = CLASS_DESKS.filter((p) => p.kind === "chair");

const CLASSROOM_PIECES = [
  { kind: "board", x: 0, y: 3.2, z: -12.95, w: 14, h: 5.4 },
  { kind: "teacherDesk", x: 6.5, z: -8.6 },
  { kind: "chair", x: 6.5, z: -10.6, rot: 0, color: "#2f2f35", name: "the teacher's chair" },
  ...CLASS_DESKS,
  ...[-6, 1, 8].map((z) => ({
    kind: "window",
    x: -14.95,
    y: 3,
    z,
    rot: Math.PI / 2,
    w: 4.6,
    h: 5,
    curtain: null,
  })),
  { kind: "bulletinBoard", x: 14.92, y: 3.6, z: 2, rot: -Math.PI / 2, w: 7, h: 3.6 },
  { kind: "door", style: "classroom", x: 14.85, z: -9, rot: -Math.PI / 2, label: "Room 4" },
  { kind: "clock", x: 0, y: 9.3, z: -12.92 },
  { kind: "bookcase", x: 12.6, z: 10.5, rot: -Math.PI / 2, seed: "class" },
  { kind: "plant", x: -13.6, z: 11.2 },
  { kind: "trashCan", x: 10.2, z: -11.6 },
];

// ---------- The forest and the café ----------

const CABIN = { kind: "cabin", x: 9, z: -17, rot: -0.4 };

/** The pines around the clearing (their snowy branches hang low: walks go around them). */
const PINES = [
  [18.27, 1.25, 1.98],
  [33.57, -4.91, 2.32],
  [17.24, -8.38, 2.73],
  [-6.74, -35.28, 2.17],
  [-21.48, -2.53, 1.71],
  [4.36, -35.37, 2.26],
  [41.46, -7, 2.33],
  [-16.02, -16.84, 1.84],
  [24.91, 8.45, 2.73],
  [-1.52, -56.41, 2.77],
  [-26, -24, 2.4],
  [22, -27, 2.5],
  [-31, 7, 2.2],
  [31, 15, 2.0],
].map(([x, z, scale], k) => ({ kind: "pine", x, z, scale, seed: `fp${k}` }));

const FOREST_PIECES = [
  { kind: "campfire", x: -4.5, z: -2.5 },
  { kind: "log", x: -7.7, z: -3.5, rot: 0.7 },
  { kind: "log", x: -1.5, z: -0.9, rot: -0.9 },
  CABIN,
  { kind: "stump", x: -5.2, z: 1.6 },
  { kind: "sled", x: 6.2, z: 1.5, rot: 0.5 },
  { kind: "snowMound", x: -11.5, z: 7, r: 2.2 },
  { kind: "snowMound", x: 11, z: 6.5, r: 1.8 },
  { kind: "snowMound", x: -12, z: -9, r: 2.5 },
  { kind: "rock", x: 12.5, z: -2, size: 1.4, seed: "fr1", snow: true },
  { kind: "rock", x: -9.6, z: 2.2, size: 1.1, seed: "fr2", snow: true },
  { kind: "rock", x: -13, z: -5.5, size: 1.6, seed: "fr3", snow: true },
  { kind: "bush", x: 13, z: 9.5, size: 1.5, seed: "fb1", snow: true, color: "#2f5a40" },
  { kind: "bush", x: -13.5, z: 10.5, size: 1.4, seed: "fb2", snow: true, color: "#2f5a40" },
  { kind: "bush", x: 1.5, z: -13, size: 1.6, seed: "fb3", snow: true, color: "#2f5a40" },
  ...PINES,
];

/** The café's tables, each with a chair on either side (each chair a seat). */
const CAFE_TABLES = [
  [-7.5, -1.5],
  [-7.5, 5.5],
  [1.5, 5.5],
];
const CAFE_CHAIRS = CAFE_TABLES.flatMap(([x, z]) => [
  { kind: "chair", x: x - 2.2, z, rot: Math.PI / 2, color: "#2f4a3a" },
  { kind: "chair", x: x + 2.2, z, rot: -Math.PI / 2, color: "#2f4a3a" },
]);

const CAFE_PIECES = [
  { kind: "brickPanel", x: 3, y: 0, z: -11.97, w: 16, h: 8.2 },
  { kind: "backCounter", x: 3, z: -11.05, w: 14 },
  { kind: "serviceCounter", x: 3, z: -5.4, w: 12 },
  { kind: "menuBoard", x: -7.5, y: 4.6, z: -11.95, w: 5.5, h: 3.5 },
  { kind: "shopSign", x: 3, y: 8.6, z: -11.9, w: 7 },
  ...CAFE_TABLES.map(([x, z]) => ({ kind: "cafeTable", x, z })),
  ...CAFE_CHAIRS,
  ...CAFE_TABLES.map(([x, z]) => ({ kind: "pendant", x, y: 11, z, drop: 3.6, color: "#2f4a3a" })),
  { kind: "window", x: -13.95, y: 1.6, z: -2, rot: Math.PI / 2, w: 6, h: 5.6, curtain: null },
  { kind: "window", x: -13.95, y: 1.6, z: 5.5, rot: Math.PI / 2, w: 6, h: 5.6, curtain: null },
  { kind: "door", style: "shop", x: -13.9, z: 10, rot: Math.PI / 2 },
  { kind: "plant", x: 12.6, z: 10.4 },
  { kind: "plant", x: -12.6, z: -10.4 },
  { kind: "wallShelf", x: 13.85, y: 5.2, z: 2, rot: -Math.PI / 2, w: 6, seed: "cafe" },
  { kind: "picture", x: 13.92, y: 4.6, z: 7.5, rot: -Math.PI / 2, w: 2.4, h: 1.8, seed: "cafeart" },
  { kind: "clock", x: 13.92, y: 8.2, z: -5, rot: -Math.PI / 2 },
];

const TOWN_PIECES = [
  ...streetRow({
    side: -1,
    xs: [-88, -44, 0, 44, 88],
    seeds: ["f1", "f2", "hero", "f4", "f5"],
    special: { 0: { name: "the house", floors: 2, garage: -1, porch: true, w: 28, chimney: true } },
  }),
  ...streetRow({
    side: 1,
    xs: [-66, -22, 22, 66],
    seeds: ["n1", "n2", "n3", "n4"],
    special: { "-22": { garage: 1 }, 22: { garage: -1 } },
  }),
  ...[-66, -22, 22, 66].map((x, k) => ({
    kind: "tree",
    x,
    z: -19.5,
    seed: `tf${k}`,
    scale: 1.2 + (k % 2) * 0.15,
  })),
  ...[-44, 44].map((x, k) => ({ kind: "tree", x, z: 19.5, seed: `tn${k}`, scale: 1.25 })),
  ...[-45, -15, 15, 45].map((x) => ({ kind: "lamp", x, z: -8.9, y: 0.3, rot: 0 })),
  ...[-30, 30].map((x) => ({ kind: "lamp", x, z: 8.9, y: 0.3, rot: Math.PI })),
  { kind: "hydrant", x: 12, z: -11.8, y: 0.3 },
  { kind: "car", x: 16, z: -5.3, rot: 0, color: "#3b5dc9", name: "the blue car" },
  { kind: "car", x: -30, z: 5.3, rot: Math.PI, color: "#e8344e", name: "the red car" },
  { kind: "flowerBed", x: -7, z: -15.2, w: 8, d: 1.6, seed: "hero1" },
  { kind: "flowerBed", x: 11, z: -15.2, w: 6, d: 1.6, seed: "hero2" },
];

/** The park's ring of trees (as before, with fuller trees). */
const PARK_TREES = (() => {
  const random = rng("park");
  const out = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + random() * 0.3;
    const r = 26 + random() * 14;
    const scale = 0.95 + random() * 0.35;
    out.push({
      kind: "tree",
      x: r3(Math.cos(a) * r),
      z: r3(Math.sin(a) * r - 6),
      seed: `pt${k}`,
      scale,
    });
  }
  return out;
})();

const PICNIC = { kind: "picnicTable", x: -16, z: 12, rot: 0.25 };

const PARK_PIECES = [
  { kind: "slide", x: -9, z: -11, rot: 0.5 },
  { kind: "swingSet", x: 9, z: -14, rot: -0.2 },
  { kind: "bench", x: 9, z: -3, rot: -0.9 },
  { kind: "sandbox", x: -14, z: 1, w: 8, d: 6 },
  PICNIC,
  { kind: "pond", x: 17, z: 9, r: 5, rot: 0.2 },
  { kind: "flowerBed", x: -3, z: -17, w: 9, d: 1.8, seed: "p1" },
  { kind: "flowerBed", x: 16, z: -6.5, w: 5, d: 1.6, rot: -0.6, seed: "p2" },
  { kind: "bush", x: -15, z: -13, size: 1.8, seed: "pb1", flowers: "#e86a8a" },
  { kind: "bush", x: -12.5, z: -16, size: 1.5, seed: "pb2" },
  { kind: "bush", x: 15, z: -19, size: 1.7, seed: "pb3", flowers: "#ffffff" },
  { kind: "bush", x: 20, z: -12, size: 1.6, seed: "pb4" },
  { kind: "bush", x: -21, z: 4, size: 1.7, seed: "pb5", flowers: "#f4c542" },
  { kind: "lamp", x: 3.6, z: -12, tall: 8.8, name: "a lamp post" },
  { kind: "lamp", x: 8.5, z: 12.5, tall: 8.8, name: "a lamp post" },
  { kind: "bin", x: 12.6, z: -6.2, rot: -0.9, seed: "pk", color: "#2f6b45" },
  { kind: "rock", x: 11.5, z: 13.5, size: 1.4, seed: "r1" },
  { kind: "rock", x: 23, z: 6, size: 1.1, seed: "r2" },
  { kind: "rock", x: -22, z: -8, size: 1.6, seed: "r3" },
  ...PARK_TREES,
];

/** The backyard: the back of a house with its deck, a lawn closed by a wooden fence, a tree and a trampoline. */
const CHAIRS = [
  { kind: "gardenChair", x: -9.5, z: -13.8, rot: 0.5, y: DECK_HEIGHT },
  { kind: "gardenChair", x: -3.5, z: -13.8, rot: -0.5, y: DECK_HEIGHT },
];

const BACKYARD_PIECES = [
  {
    kind: "house",
    x: 0,
    z: -29,
    rot: Math.PI,
    seed: "backyard",
    floors: 2,
    garage: 0,
    porch: false,
    drive: 0,
    w: 30,
    name: "the house",
  },
  { kind: "deck", x: 0, z: -14, w: 26, d: 10 },
  ...CHAIRS,
  { kind: "patioTable", x: -6.5, z: -11.6, y: DECK_HEIGHT },
  { kind: "grill", x: 8.5, z: -12.5, rot: -0.4, y: DECK_HEIGHT },
  {
    kind: "stringLights",
    y: DECK_HEIGHT,
    posts: [
      [-12.6, -9.4],
      [12.6, -9.4],
    ],
    anchors: [
      [-12.6, -9.4, 8.45],
      [0, -18.8, 9.6],
      [12.6, -9.4, 8.45],
      [-12.6, -9.4, 8.45],
    ],
  },
  { kind: "fence", style: "privacy", from: [-22, -19], to: [-22, 17] },
  { kind: "fence", style: "privacy", from: [22, -19], to: [22, 17] },
  { kind: "fence", style: "privacy", from: [-22, 17], to: [22, 17], gaps: [[37, 3.6]] },
  { kind: "tree", x: -13, z: 5, seed: "yard", scale: 1.4 },
  { kind: "trampoline", x: 12.5, z: 6, r: 4.4 },
  { kind: "flowerBed", x: -20.4, z: 0, rot: Math.PI / 2, w: 14, d: 1.8, seed: "y1" },
  { kind: "bush", x: -19.4, z: 12.5, size: 1.8, seed: "yb1", flowers: "#e86a8a" },
  { kind: "bush", x: 19.4, z: 12.5, size: 1.7, seed: "yb2", flowers: "#ffffff" },
  { kind: "bush", x: 19.6, z: -4, size: 1.6, seed: "yb3" },
  { kind: "house", x: -50, z: -6, rot: Math.PI / 2, seed: "nb1", name: "the neighbors' house" },
  { kind: "house", x: 50, z: -8, rot: -Math.PI / 2, seed: "nb2", name: "the neighbors' house" },
];

export const LAYOUTS = {
  home: {
    spots: {
      center: { x: 0, z: 1, rot: 0 },
      left: { x: -3, z: 1.4, rot: 1.0 },
      right: { x: 3, z: 1.4, rot: -1.0 },
      back: { x: -6, z: -4.5, rot: 0.5 },
      front: { x: 5.5, z: 3, rot: -0.6 },
      door: { x: 9, z: -9.8, rot: 0 },
      window: { x: -5.5, z: -10.2, rot: Math.PI },
      sofa: { x: 0, z: -7.3, rot: 0, seat: SEAT_HEIGHT },
      sofaL: { x: -2.4, z: -7.3, rot: 0.15, seat: SEAT_HEIGHT },
      sofaR: { x: 2.4, z: -7.3, rot: -0.15, seat: SEAT_HEIGHT },
      // Either side of the coffee table (to run and jump over it).
      tableR: { x: 5.6, z: -3.1, rot: -Math.PI / 2 },
      tableL: { x: -5.8, z: -3.1, rot: 2.45 },
      armchair: { x: -9.5, z: 3.5, rot: Math.PI / 2, seat: SEAT_HEIGHT },
    },
    seats: ["sofaL", "sofaR", "sofa", "armchair"],
    beds: [],
    blocks: [],
    solids: [],
    pieces: HOME_PIECES,
    bounds: { minX: -13.6, maxX: 13.6, minZ: -11.6, maxZ: 11.6 },
    walls: { minX: -15, maxX: 15, minZ: -13, maxZ: 13 },
    wide: { pos: [3, 7, 14], target: [0, 3, -5] },
    surface: [0.4, 1.37, -3.1],
  },
  bedroom: {
    spots: {
      center: { x: 1.5, z: 1.5, rot: 0 },
      left: { x: -1.6, z: 1.8, rot: 1.0 },
      right: { x: 4.6, z: 1.8, rot: -1.0 },
      back: { x: 4, z: -5, rot: 0.3 },
      window: { x: 5, z: -8.4, rot: Math.PI },
      bed: { x: -6, z: -4.4, rot: 0, bed: BED_HEIGHT + 0.2 },
      bedSit: { x: -3, z: -3, rot: 1.2, seat: BED_HEIGHT },
      desk: { x: 7.4, z: -6, rot: -Math.PI / 2, seat: SEAT_HEIGHT },
      beanbag: { x: 2.5, z: 6.5, rot: -0.4, seat: SEAT_HEIGHT },
      wardrobe: { x: -9.7, z: 4, rot: -Math.PI / 2 },
    },
    seats: ["bedSit", "desk", "beanbag"],
    beds: ["bed"],
    blocks: [],
    solids: [],
    pieces: BEDROOM_PIECES,
    bounds: { minX: -11.6, maxX: 11.6, minZ: -9.6, maxZ: 9.6 },
    walls: { minX: -13, maxX: 13, minZ: -11, maxZ: 11 },
    wide: { pos: [5, 7.5, 12], target: [-1, 2.5, -4] },
    surface: [-1.8, 2.02, -8.5],
  },
  school: {
    spots: {
      center: { x: 0, z: 2, rot: 0 },
      left: { x: -2.8, z: 2.4, rot: 1.0 },
      right: { x: 2.8, z: 2.4, rot: -1.0 },
      back: { x: 0, z: -8, rot: 0 },
      front: { x: -1.5, z: 7, rot: 0.3 },
      lockerL: { x: -5.6, z: -1, rot: Math.PI / 2 },
      lockerR: { x: 5.6, z: -3, rot: -Math.PI / 2 },
      classroom: { x: -6, z: -11, rot: -Math.PI / 2 },
      fountain: { x: 6, z: -11, rot: Math.PI / 2 },
    },
    seats: [],
    beds: [],
    blocks: [],
    solids: [],
    pieces: SCHOOL_PIECES,
    bounds: { minX: -6.2, maxX: 6.2, minZ: -43, maxZ: 23 },
    walls: { minX: -8.5, maxX: 8.5, minZ: -45, maxZ: 25 },
    wide: { pos: [0, 6, 16], target: [0, 3.2, -14] },
    surface: [0, 0.02, 4.5],
  },
  kitchen: {
    spots: {
      center: { x: 0, z: 7, rot: 0 },
      left: { x: -4, z: 7.4, rot: 1.0 },
      right: { x: 4, z: 7.4, rot: -1.0 },
      back: { x: -7, z: -5.5, rot: 0.3 },
      sink: { x: -3.5, z: -7.8, rot: Math.PI },
      stove: { x: 3, z: -7.8, rot: Math.PI },
      fridge: { x: 9.2, z: -7.4, rot: Math.PI },
      door: { x: -11.2, z: 5, rot: -Math.PI / 2 },
      ...Object.fromEntries(
        KITCHEN_CHAIRS.map((c, i) => [
          `chair${i + 1}`,
          { x: c.x, z: c.z, rot: c.rot, seat: SEAT_HEIGHT },
        ]),
      ),
    },
    seats: ["chair1", "chair2", "chair3", "chair4"],
    beds: [],
    blocks: [],
    solids: [],
    pieces: KITCHEN_PIECES,
    bounds: { minX: -11.6, maxX: 11.6, minZ: -9.6, maxZ: 9.6 },
    walls: { minX: -13, maxX: 13, minZ: -11, maxZ: 11 },
    wide: { pos: [4, 7.5, 13.5], target: [-1, 3.2, -5] },
    surface: [1.8, 2.22, 2.5],
  },
  classroom: {
    spots: {
      center: { x: 0, z: 9.5, rot: 0 },
      left: { x: -4, z: 9.9, rot: 1.0 },
      right: { x: 4, z: 9.9, rot: -1.0 },
      back: { x: -3.5, z: -7, rot: 0.3 },
      board: { x: -3, z: -10.6, rot: 0 },
      teacher: { x: 6.5, z: -10.6, rot: 0, seat: SEAT_HEIGHT },
      door: { x: 13.2, z: -9, rot: Math.PI / 2 },
      window: { x: -13.2, z: 1, rot: -Math.PI / 2 },
      ...Object.fromEntries(
        deskSeats.map((c, i) => [
          `desk${i + 1}`,
          { x: c.x, z: c.z, rot: c.rot, seat: SEAT_HEIGHT },
        ]),
      ),
    },
    seats: ["desk1", "desk2", "desk3", "desk4", "desk5", "desk6", "teacher"],
    beds: [],
    blocks: [],
    solids: [],
    pieces: CLASSROOM_PIECES,
    bounds: { minX: -13.6, maxX: 13.6, minZ: -11.6, maxZ: 11.6 },
    walls: { minX: -15, maxX: 15, minZ: -13, maxZ: 13 },
    wide: { pos: [3, 7.5, 14.5], target: [-1, 3.5, -6] },
    surface: [5.4, 2.22, -8.2],
  },
  town: {
    // A street at real size: a two-lane road, pavements a step up on both sides, front yards behind picket fences,
    // and houses with porches and garages. Stories happen on the far pavement, in front of "the house" (x 0).
    spots: {
      center: { x: 0, z: -10.6, rot: 0, y: 0.3 },
      left: { x: -4, z: -10.4, rot: 1.0, y: 0.3 },
      right: { x: 4, z: -10.4, rot: -1.0, y: 0.3 },
      back: { x: -7, z: -18.5, rot: 0.3 },
      road: { x: 0, z: 0, rot: 0 },
      far: { x: -14, z: -10.8, rot: 0.6, y: 0.3 },
      gate: { x: 3.36, z: -14.8, rot: 0 },
      porch: { x: 3.36, z: -21.6, rot: 0, y: DECK_HEIGHT },
      driveway: { x: -19.5, z: -17.5, rot: 0.4 },
      across: { x: 0, z: 10.6, rot: Math.PI, y: 0.3 },
    },
    seats: [],
    beds: [],
    blocks: [],
    solids: [
      // The pavements, a step up from the road.
      { x: 0, y: 0.15, z: -10.5, w: 400, h: 0.3, d: 5 },
      { x: 0, y: 0.15, z: 10.5, w: 400, h: 0.3, d: 5 },
    ],
    pieces: TOWN_PIECES,
    bounds: { minX: -60, maxX: 60, minZ: -23.6, maxZ: 13.2 },
    // The pavements on both sides of the road are a step up.
    ground: (_x, z) => (Math.abs(z) >= 8 && Math.abs(z) <= 13 ? 0.3 : 0),
    wide: { pos: [0, 7, 11.4], target: [0, 4.6, -20] },
    surface: [1.5, 0.32, -11.5],
  },
  park: {
    spots: {
      center: { x: 0, z: 2, rot: 0 },
      left: { x: -3, z: 2.4, rot: 1.0 },
      right: { x: 3, z: 2.4, rot: -1.0 },
      back: { x: -4, z: -6, rot: 0.4 },
      slide: { x: -8.5, z: -5, rot: 0.6 },
      bench: { x: 8.4, z: -2.6, rot: -0.9, seat: SEAT_HEIGHT },
      picnicL: { ...onPiece(PICNIC, 0, 2.6), rot: r3(PICNIC.rot + Math.PI), seat: SEAT_HEIGHT },
      picnicR: { ...onPiece(PICNIC, 0, -2.6), rot: PICNIC.rot, seat: SEAT_HEIGHT },
      pond: { x: 10.4, z: 7, rot: -0.6 },
      sandbox: { x: -14, z: 5.4, rot: 0 },
    },
    seats: ["bench", "picnicL", "picnicR"],
    beds: [],
    blocks: [],
    solids: [],
    pieces: PARK_PIECES,
    bounds: { minX: -30, maxX: 30, minZ: -22, maxZ: 20 },
    wide: { pos: [4, 6.5, 24], target: [-1, 3, -6] },
    surface: [7.6, 1.52, -2.2],
  },
  backyard: {
    spots: {
      center: { x: 0, z: 3, rot: 0 },
      left: { x: -4, z: 3.4, rot: 1.0 },
      right: { x: 4, z: 3.4, rot: -1.0 },
      back: { x: -2, z: -4, rot: 0.3 },
      door: { x: 0, z: -17.4, rot: 0, y: DECK_HEIGHT },
      patio: { x: 2.5, z: -12.5, rot: 0, y: DECK_HEIGHT },
      grill: { x: 8.5, z: -10.2, rot: Math.PI, y: DECK_HEIGHT },
      tree: { x: -9.4, z: 7.5, rot: -1.2 },
      trampoline: { x: 12.5, z: 0.4, rot: 0 },
      gate: { x: 15, z: 15.2, rot: Math.PI },
      chair1: {
        x: CHAIRS[0].x,
        z: CHAIRS[0].z,
        rot: CHAIRS[0].rot,
        y: DECK_HEIGHT,
        seat: SEAT_HEIGHT,
      },
      chair2: {
        x: CHAIRS[1].x,
        z: CHAIRS[1].z,
        rot: CHAIRS[1].rot,
        y: DECK_HEIGHT,
        seat: SEAT_HEIGHT,
      },
    },
    seats: ["chair1", "chair2"],
    beds: [],
    blocks: [],
    solids: [],
    pieces: BACKYARD_PIECES,
    bounds: { minX: -21.2, maxX: 21.2, minZ: -18.6, maxZ: 16.3 },
    wide: { pos: [3, 9, 15], target: [0, 3.5, -12] },
    surface: [-6.5, 2.48, -11.6],
  },
  forest: {
    spots: {
      center: { x: 0, z: 3, rot: 0 },
      left: { x: -3, z: 3.4, rot: 1.0 },
      right: { x: 3, z: 3.4, rot: -1.0 },
      back: { x: 3, z: -6, rot: -0.3 },
      fire: { x: -1.6, z: -2.2, rot: -1.4 },
      cabin: { ...onPiece(CABIN, 2, 8.6), rot: CABIN.rot },
      porch: { ...onPiece(CABIN, 2, 5.6), rot: CABIN.rot, y: DECK_HEIGHT },
      logL: { x: -7.4, z: -3.5, rot: 0.9, seat: SEAT_HEIGHT },
      logR: { x: -1.6, z: -0.7, rot: -0.9, seat: SEAT_HEIGHT },
      stump: { x: -5.2, z: 1.6, rot: 2.97, seat: SEAT_HEIGHT },
    },
    seats: ["logL", "logR", "stump"],
    beds: [],
    blocks: [],
    solids: [
      // The two tall bare trunks nearest the clearing (the forest's trunks are drawn in places.js).
      { x: -14.25, y: 12.02, z: -16.7, w: 0.63, h: 25.54, d: 0.63 },
      { x: -16.69, y: 15.53, z: -1.94, w: 0.82, h: 33.01, d: 0.82 },
    ],
    pieces: FOREST_PIECES,
    bounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 12 },
    wide: { pos: [2, 6.5, 24], target: [0, 4.5, -8] },
    surface: [-6.6, 0.9, -3.6],
  },
  cafe: {
    spots: {
      center: { x: 0, z: 9, rot: 0 },
      left: { x: -4, z: 9.4, rot: 1.0 },
      right: { x: 4, z: 9.4, rot: -1.0 },
      back: { x: -2.5, z: -2.4, rot: 0.3 },
      counter: { x: 1, z: -3.3, rot: Math.PI },
      barista: { x: 3.5, z: -8.2, rot: 0 },
      door: { x: -12.2, z: 10, rot: -Math.PI / 2 },
      window: { x: -12.2, z: -3.6, rot: -Math.PI / 2 },
      ...Object.fromEntries(
        CAFE_CHAIRS.map((c, i) => [
          `seat${i + 1}`,
          { x: c.x, z: c.z, rot: c.rot, seat: SEAT_HEIGHT },
        ]),
      ),
    },
    seats: ["seat1", "seat2", "seat3", "seat4", "seat5", "seat6"],
    beds: [],
    blocks: [],
    solids: [],
    pieces: CAFE_PIECES,
    bounds: { minX: -12.6, maxX: 12.6, minZ: -10.6, maxZ: 10.6 },
    walls: { minX: -14, maxX: 14, minZ: -12, maxZ: 12 },
    wide: { pos: [4, 7.5, 15.5], target: [-1, 3.5, -5] },
    surface: [-0.5, 3.12, -5.2],
  },
};

// Each place's pieces become physics boxes, footprints and raised ground (porches, decks).
for (const layout of Object.values(LAYOUTS)) {
  if (!layout.pieces) continue;
  const { solids, blocks, raised } = piecesShapes(layout.pieces);
  layout.solids = [...(layout.solids ?? []), ...solids];
  layout.blocks = [...(layout.blocks ?? []), ...blocks];
  if (raised.length) {
    const base = layout.ground;
    layout.raised = raised;
    layout.ground = (x, z) => Math.max(raisedAt(raised, x, z) ?? 0, base ? base(x, z) : 0);
  }
}

/** A place's layout (home when the name is unknown). */
export const layoutOf = (name) => LAYOUTS[name] ?? LAYOUTS.home;

/** How high a block is when the layout doesn't say (units). */
const BLOCK_HEIGHT = 2.5;

/** A place's furniture as physics boxes: its measured `solids`, or each block as a box of its height. */
export function solidsOf(layout) {
  if (layout.solids) return layout.solids;
  return (layout.blocks ?? []).map((b) => {
    const h = b.h ?? BLOCK_HEIGHT;
    return { x: b.x, y: h / 2, z: b.z, w: b.w, h, d: b.d, rot: b.rot ?? 0 };
  });
}
