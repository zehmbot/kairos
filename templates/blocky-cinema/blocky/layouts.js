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
    },
    seats: ["sofaL", "sofaR", "sofa"],
    beds: [],
    blocks: [
      { name: "the sofa", x: 0, z: -7.6, w: 9.4, d: 3.6, h: 2.62 },
      { name: "the coffee table", x: 0, z: -3.3, w: 5.2, d: 2.6, h: 1.35 },
      { name: "the lamp", x: -7, z: -9, w: 1.4, d: 1.4, h: 6.9 },
      { name: "the plant", x: 6.6, z: -9.3, w: 1.4, d: 1.4, h: 3.1 },
      { name: "the shelf", x: -12.2, z: -3, w: 1.6, d: 4.2, h: 6 },
      { name: "the TV", x: 11.8, z: -2, w: 1.6, d: 5.2, h: 4.6 },
    ],
    bounds: { minX: -13.6, maxX: 13.6, minZ: -11.6, maxZ: 11.6 },
    walls: { minX: -15, maxX: 15, minZ: -13, maxZ: 13 },
    solids: [
      // The sofa: seat, back, back cushions, arms.
      { x: 0, y: 0.33, z: -7.45, w: 9, h: 0.66, d: 3.1 },
      { x: 0, y: 1.37, z: -8.8, w: 9, h: 2.5, d: 1 },
      { x: 0, y: 1.46, z: -8.2, w: 7.9, h: 1.6, d: 0.6 },
      { x: -4, y: 0.9, z: -7.6, w: 1, h: 1.56, d: 3.4 },
      { x: 4, y: 0.9, z: -7.6, w: 1, h: 1.56, d: 3.4 },
      // The coffee table: top and legs.
      { x: 0, y: 1.2, z: -3.3, w: 5, h: 0.3, d: 2.4 },
      { x: -2.15, y: 0.53, z: -4.15, w: 0.3, h: 1.05, d: 0.3 },
      { x: -2.15, y: 0.53, z: -2.45, w: 0.3, h: 1.05, d: 0.3 },
      { x: 2.15, y: 0.53, z: -4.15, w: 0.3, h: 1.05, d: 0.3 },
      { x: 2.15, y: 0.53, z: -2.45, w: 0.3, h: 1.05, d: 0.3 },
      // The lamp, the plant, the shelf, the TV.
      { x: -7, y: 3.45, z: -9, w: 1.2, h: 6.9, d: 1.2 },
      { x: 6.6, y: 1.55, z: -9.3, w: 1.8, h: 3.1, d: 1.9 },
      { x: -12.2, y: 3, z: -3, w: 1.42, h: 6, d: 4 },
      { x: 11.8, y: 2.3, z: -2, w: 1.4, h: 4.6, d: 5 },
    ],
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
    },
    seats: ["bedSit", "desk"],
    beds: ["bed"],
    blocks: [
      { name: "the bed", x: -6, z: -5.8, w: 5.6, d: 9.8, h: 1.5 },
      { name: "the nightstand", x: -1.8, z: -9.2, w: 2.2, d: 2, h: 2 },
      { name: "the desk", x: 9.5, z: -6, w: 2.6, d: 5.2, h: 2.2 },
      { name: "the chair", x: 7.4, z: -6, w: 2, d: 2, h: 2.86 },
      { name: "the toy box", x: 7, z: 3, w: 1.8, d: 1.8, h: 1.6 },
    ],
    bounds: { minX: -11.6, maxX: 11.6, minZ: -9.6, maxZ: 9.6 },
    walls: { minX: -13, maxX: 13, minZ: -11, maxZ: 11 },
    solids: [
      // The bed: frame and mattress, the blanket, the headboard, the pillow.
      { x: -6, y: 0.65, z: -5.8, w: 5.4, h: 1.3, d: 9.4 },
      { x: -6, y: 1.4, z: -4.3, w: 5.2, h: 0.2, d: 6 },
      { x: -6, y: 1.6, z: -10.4, w: 5.6, h: 3.2, d: 0.6 },
      { x: -6, y: 1.55, z: -9.2, w: 3.4, h: 0.5, d: 1.6 },
      // The nightstand and its lamp.
      { x: -1.8, y: 1, z: -9.2, w: 2, h: 2, d: 1.8 },
      { x: -1.8, y: 2.93, z: -9.2, w: 1.3, h: 1.85, d: 1.3 },
      // The desk: top and legs.
      { x: 9.5, y: 2.05, z: -6, w: 2.4, h: 0.3, d: 5 },
      { x: 10.35, y: 0.95, z: -8.15, w: 0.3, h: 1.9, d: 0.3 },
      { x: 8.65, y: 0.95, z: -8.15, w: 0.3, h: 1.9, d: 0.3 },
      { x: 10.35, y: 0.95, z: -3.85, w: 0.3, h: 1.9, d: 0.3 },
      { x: 8.65, y: 0.95, z: -3.85, w: 0.3, h: 1.9, d: 0.3 },
      // The chair: seat (with its legs) and back.
      { x: 7.4, y: 0.33, z: -6, w: 1.9, h: 0.66, d: 1.9 },
      { x: 8.25, y: 1.76, z: -6, w: 0.2, h: 2.2, d: 1.9 },
      // The toy box.
      { x: 7, y: 0.8, z: 3, w: 1.6, h: 1.6, d: 1.6 },
    ],
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
    },
    seats: [],
    beds: [],
    blocks: [],
    bounds: { minX: -6.2, maxX: 6.2, minZ: -43, maxZ: 23 },
    walls: { minX: -8.5, maxX: 8.5, minZ: -45, maxZ: 25 },
    solids: [
      // The lockers along both walls, in two runs each (a gap for the sign).
      { x: -7.72, y: 3.3, z: -27.95, w: 1.5, h: 6.6, d: 29.9 },
      { x: -7.72, y: 3.3, z: 6.05, w: 1.5, h: 6.6, d: 29.9 },
      { x: 7.72, y: 3.3, z: -27.95, w: 1.5, h: 6.6, d: 29.9 },
      { x: 7.72, y: 3.3, z: 6.05, w: 1.5, h: 6.6, d: 29.9 },
    ],
    wide: { pos: [0, 6, 16], target: [0, 3.2, -14] },
    surface: [0, 0.02, 4.5],
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
      cabin: { x: 6.5, z: -11, rot: -0.4 },
      logL: { x: -7.4, z: -3.5, rot: 0.9, seat: 0.9 },
      logR: { x: -1.6, z: -0.7, rot: -0.9, seat: 0.9 },
    },
    seats: ["logL", "logR"],
    beds: [],
    blocks: [
      { name: "the campfire", x: -4.5, z: -2.5, w: 3, d: 3, h: 2.5 },
      { name: "a log", x: -7.7, z: -3.5, w: 4.2, d: 1.2, rot: 0.7, h: 0.9 },
      { name: "a log", x: -1.5, z: -0.9, w: 4.2, d: 1.2, rot: -0.9, h: 0.9 },
      { name: "the cabin", x: 9, z: -17, w: 10, d: 9, rot: -0.4, h: 11.2 },
      // The pines at the edge of the clearing (their snowy branches hang low).
      { name: "a pine", x: 18.27, z: 1.25, w: 8.23, d: 8.15, h: 12.75 },
      { name: "a pine", x: 17.24, z: -8.38, w: 11.38, d: 11.44, h: 16.84 },
      { name: "a pine", x: -16.02, z: -16.84, w: 7.66, d: 7.7, h: 14.21 },
    ],
    solids: [
      // The campfire's ring of logs (the flames don't stop anything) and the two logs to sit on.
      { x: -4.5, y: 0.3, z: -2.5, w: 2.6, h: 0.6, d: 2.6 },
      { x: -7.7, y: 0.45, z: -3.5, w: 4, h: 0.9, d: 1, rot: 0.7 },
      { x: -1.5, y: 0.45, z: -0.9, w: 4, h: 0.9, d: 1, rot: -0.9 },
      // The cabin and its roof.
      { x: 9, y: 3.8, z: -17, w: 10, h: 7.6, d: 8, rot: -0.4 },
      { x: 9, y: 9.4, z: -17, w: 11.2, h: 3.6, d: 9.4, rot: -0.4 },
      // The tall bare trunks nearest the clearing, measured from the built forest.
      { x: -14.25, y: 12.02, z: -16.7, w: 0.63, h: 25.54, d: 0.63 },
      { x: -16.69, y: 15.53, z: -1.94, w: 0.82, h: 33.01, d: 0.82 },
      // The pines around the clearing (trunk, then the snowy crown), measured from the built forest.
      { x: 18.27, y: 1.55, z: 1.25, w: 1.09, h: 3.11, d: 1.09 },
      { x: 18.35, y: 7.23, z: 1.43, w: 10.29, h: 11.03, d: 10.19 },
      { x: 33.57, y: 1.7, z: -4.91, w: 1.19, h: 3.4, d: 1.19 },
      { x: 33.71, y: 7.91, z: -5.07, w: 12.04, h: 12.08, d: 12.02 },
      { x: 17.24, y: 2.05, z: -8.38, w: 1.44, h: 4.11, d: 1.44 },
      { x: 17.46, y: 9.55, z: -8.53, w: 14.22, h: 14.59, d: 14.3 },
      { x: -6.74, y: 1.68, z: -35.28, w: 1.18, h: 3.37, d: 1.18 },
      { x: -6.55, y: 7.83, z: -35.38, w: 11.27, h: 11.95, d: 11.37 },
      { x: -21.48, y: 1.38, z: -2.53, w: 0.97, h: 2.76, d: 0.97 },
      { x: -21.42, y: 6.42, z: -2.36, w: 8.9, h: 9.81, d: 8.79 },
      { x: 4.36, y: 1.66, z: -35.37, w: 1.16, h: 3.32, d: 1.16 },
      { x: 4.5, y: 7.73, z: -35.2, w: 11.73, h: 11.8, d: 11.7 },
      { x: 41.46, y: 1.8, z: -7, w: 1.26, h: 3.59, d: 1.26 },
      { x: 41.66, y: 8.36, z: -6.89, w: 12.13, h: 12.76, d: 12.22 },
      { x: -16.02, y: 1.73, z: -16.84, w: 1.21, h: 3.47, d: 1.21 },
      { x: -15.92, y: 8.06, z: -16.74, w: 9.57, h: 12.3, d: 9.62 },
      { x: 24.91, y: 2.66, z: 8.45, w: 1.86, h: 5.32, d: 1.86 },
      { x: 25.04, y: 12.37, z: 8.34, w: 14.22, h: 18.88, d: 14.37 },
      { x: -1.52, y: 2.04, z: -56.41, w: 1.43, h: 4.09, d: 1.43 },
      { x: -1.36, y: 9.51, z: -56.21, w: 14.39, h: 14.52, d: 14.35 },
    ],
    bounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 12 },
    wide: { pos: [2, 6.5, 24], target: [0, 4.5, -8] },
    surface: [-6.6, 0.9, -3.6],
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
