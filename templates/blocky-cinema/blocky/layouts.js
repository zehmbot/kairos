// Where things are in each place, as plain data (places.js builds the place around it; motion.js walks in it):
// - `spots`: { x, z, rot } where characters stand, sit or lie (rot 0 faces +z, toward the usual camera side), plus
//   `seat` (sitting height) or `bed` (lying height), and `y` for raised ground;
// - `seats`, `beds`: the spots used when a shot sits or lays someone down without saying where;
// - `blocks`: the furniture's footprints { name, x, z, w, d, rot, h } that walks go around (`h`: how high it is,
//   for jumping over it);
// - `solids`: the furniture as physics boxes { x, y, z, w, h, d, rot } (centers and full sizes, measured from the
//   built place); without them, each block counts as a box of its height; `walls`: the room's walls;
// - `bounds`: how far anyone can walk (walls, houses); `ground(x, z)`: raised ground (pavements);
// - `wide`: the establishing shot; `surface`: where small objects sit for close-ups.
import { BED_HEIGHT, SEAT_HEIGHT } from "./sizes.js";

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
    spots: {
      center: { x: 0, z: 6.4, rot: 0, y: 0.3 },
      left: { x: -3, z: 6.6, rot: 1.0, y: 0.3 },
      right: { x: 3, z: 6.6, rot: -1.0, y: 0.3 },
      back: { x: -5, z: -6.4, rot: 0.2, y: 0.3 },
      road: { x: 0, z: 0, rot: 0 },
      far: { x: -9, z: -6.5, rot: 0.6, y: 0.3 },
    },
    seats: [],
    beds: [],
    blocks: [
      { name: "the blue car", x: 11, z: -2.4, w: 8.4, d: 4, h: 3.7 },
      { name: "the red car", x: -16, z: 2.4, w: 8.4, d: 4, h: 3.7 },
      // Street lamps every 15 units and a tree between every two houses (places.js puts them there).
      ...[-3, -2, -1, 0, 1, 2, 3].map((k) => ({
        name: "a street lamp",
        x: k * 15 - 2.5,
        z: -8,
        w: 0.9,
        d: 0.9,
        h: 7.5,
      })),
      ...[-4, -3, -2, -1, 0, 1, 2, 3].map((k) => ({
        name: "a tree",
        x: k * 15 + 7.5,
        z: -10.5,
        w: 1.8,
        d: 1.8,
        h: 9,
      })),
    ],
    solids: [
      // The rows of houses (nobody walks between them: one long box each).
      { x: 0, y: 3.5, z: -15, w: 170, h: 7, d: 8.4 },
      { x: 5, y: 3.5, z: 44, w: 170, h: 7, d: 8.4 },
      // The pavements, a step up from the road.
      { x: 0, y: 0.15, z: -6.5, w: 200, h: 0.3, d: 4 },
      { x: 0, y: 0.15, z: 6.5, w: 200, h: 0.3, d: 4 },
      // The parked cars: body and cabin.
      { x: 11, y: 1.5, z: -2.4, w: 8, h: 1.6, d: 3.6 },
      { x: 10.6, y: 2.95, z: -2.4, w: 4.6, h: 1.5, d: 3.3 },
      { x: -16, y: 1.5, z: 2.4, w: 8, h: 1.6, d: 3.6 },
      { x: -15.6, y: 2.95, z: 2.4, w: 4.6, h: 1.5, d: 3.3 },
      // Trees and street lamps (trunk or pole, then crown or head), measured from the built town.
      { x: -67.5, y: 2.31, z: -10.5, w: 0.92, h: 4.61, d: 0.92 },
      { x: -67.86, y: 6.23, z: -10.56, w: 5.98, h: 4.9, d: 5.75 },
      { x: -52.5, y: 2.05, z: -10.5, w: 0.82, h: 4.1, d: 0.82 },
      { x: -52.88, y: 5.85, z: -10.13, w: 5.2, h: 3.07, d: 5.44 },
      { x: -37.5, y: 2.51, z: -10.5, w: 1, h: 5.02, d: 1 },
      { x: -37.99, y: 7.18, z: -9.88, w: 5.53, h: 4.52, d: 5.52 },
      { x: -22.5, y: 2.22, z: -10.5, w: 0.89, h: 4.44, d: 0.89 },
      { x: -23.08, y: 5.74, z: -10.79, w: 5.48, h: 3.78, d: 6.49 },
      { x: -7.5, y: 2.23, z: -10.5, w: 0.89, h: 4.46, d: 0.89 },
      { x: -7.71, y: 5.84, z: -10.36, w: 6.51, h: 4.25, d: 6.89 },
      { x: 7.5, y: 2.6, z: -10.5, w: 1.04, h: 5.2, d: 1.04 },
      { x: 7.72, y: 6.89, z: -11.18, w: 6.73, h: 4.88, d: 7.18 },
      { x: 22.5, y: 2.3, z: -10.5, w: 0.92, h: 4.6, d: 0.92 },
      { x: 21.7, y: 6.26, z: -10.88, w: 5.85, h: 3.55, d: 5.42 },
      { x: 37.5, y: 2.29, z: -10.5, w: 0.92, h: 4.59, d: 0.92 },
      { x: 38.09, y: 5.96, z: -11.08, w: 5.82, h: 4.8, d: 5.54 },
      { x: 52.5, y: 2.27, z: -10.5, w: 0.91, h: 4.54, d: 0.91 },
      { x: 52.82, y: 6.37, z: -9.99, w: 5.88, h: 4.27, d: 6.1 },
      { x: 67.5, y: 2.27, z: -10.5, w: 0.91, h: 4.54, d: 0.91 },
      { x: 67.49, y: 6.2, z: -10.57, w: 5.67, h: 4.45, d: 6.18 },
      { x: 82.5, y: 2.56, z: -10.5, w: 1.03, h: 5.13, d: 1.03 },
      { x: 82.37, y: 7, z: -10.23, w: 6.63, h: 4.56, d: 6.1 },
      { x: -47.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: -46.75, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
      { x: -32.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: -31.75, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
      { x: -17.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: -16.75, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
      { x: -2.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: -1.75, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
      { x: 12.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: 13.25, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
      { x: 27.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: 28.25, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
      { x: 42.5, y: 4.05, z: -8, w: 0.3, h: 7.5, d: 0.3 },
      { x: 43.25, y: 7.59, z: -8, w: 1.8, h: 0.52, d: 0.6 },
    ],
    bounds: { minX: -60, maxX: 60, minZ: -11.5, maxZ: 40 },
    // The pavements on both sides of the road are a step up.
    ground: (_x, z) => (Math.abs(z) >= 4.5 && Math.abs(z) <= 8.5 ? 0.3 : 0),
    wide: { pos: [-3, 5.5, 20], target: [0, 4, -2] },
    surface: [1, 0.32, 8],
  },
  park: {
    spots: {
      center: { x: 0, z: 2, rot: 0 },
      left: { x: -3, z: 2.4, rot: 1.0 },
      right: { x: 3, z: 2.4, rot: -1.0 },
      back: { x: -4, z: -6, rot: 0.4 },
      slide: { x: -6.5, z: -6.5, rot: 0.6 },
      bench: { x: 8.4, z: -2.6, rot: -0.9, seat: SEAT_HEIGHT },
    },
    seats: ["bench"],
    beds: [],
    blocks: [
      { name: "the slide", x: -9, z: -11, w: 3.6, d: 8, rot: 0.5, h: 6.3 },
      { name: "the swings", x: 9, z: -14, w: 8, d: 3, rot: -0.2, h: 7.3 },
      { name: "the bench", x: 9, z: -3, w: 6.2, d: 2, rot: -0.9, h: 2.5 },
      { name: "the sandbox", x: -10, z: -3, w: 8, d: 6, h: 0.4 },
      // The trees of the ring that reach into the park (their crowns hang low).
      { name: "a tree", x: 25.28, z: 8.75, w: 5.5, d: 5.06, h: 9.43 },
      { name: "a tree", x: 20.32, z: 19.43, w: 5.14, d: 4.93, h: 10.04 },
      { name: "a tree", x: -16.95, z: 24.14, w: 5.9, d: 6.3, h: 11.56 },
      { name: "a tree", x: -28.47, z: 10.9, w: 4.99, d: 4.91, h: 9.55 },
      { name: "a tree", x: -27.84, z: -1.65, w: 6.18, d: 5.78, h: 9.18 },
      { name: "a tree", x: -30.06, z: -12.32, w: 5.1, d: 5.8, h: 8.96 },
      { name: "a tree", x: -30.19, z: -23.64, w: 4.62, d: 4.42, h: 7.76 },
    ],
    solids: [
      // The slide: its tower (platform and roof over the legs) and the ramp.
      { x: -9, y: 3.15, z: -11, w: 3.8, h: 6.3, d: 3.8, rot: 0.5 },
      { x: -6.7, y: 1.1, z: -6.79, w: 2, h: 2.2, d: 6.2, rot: 0.5 },
      // The swings: the top bar and the legs at each end.
      { x: 9, y: 7.15, z: -14, w: 8.6, h: 0.35, d: 0.35, rot: -0.2 },
      { x: 12.92, y: 3.6, z: -13.21, w: 0.4, h: 7.2, d: 2.8, rot: -0.2 },
      { x: 5.08, y: 3.6, z: -14.79, w: 0.4, h: 7.2, d: 2.8, rot: -0.2 },
      // The bench: seat with its legs, and the back.
      { x: 9, y: 0.33, z: -3, w: 6, h: 0.66, d: 1.8, rot: -0.9 },
      { x: 9.63, y: 1.76, z: -3.5, w: 6, h: 1.4, d: 0.25, rot: -0.9 },
      // The sandbox's edge.
      { x: -10, y: 0.2, z: -3, w: 8, h: 0.4, d: 6 },
      // The ring of trees (trunk, then crown), measured from the built park.
      { x: 35.44, y: 2.3, z: 2.01, w: 0.92, h: 4.6, d: 0.92 },
      { x: 35.62, y: 5.71, z: 2.27, w: 6.76, h: 3.89, d: 6.32 },
      { x: 25.28, y: 2.49, z: 8.75, w: 1, h: 4.99, d: 1 },
      { x: 25.24, y: 7.17, z: 8.32, w: 6.87, h: 4.52, d: 6.33 },
      { x: 20.32, y: 2.93, z: 19.43, w: 1.17, h: 5.85, d: 1.17 },
      { x: 19.72, y: 7.59, z: 19.54, w: 6.42, h: 4.89, d: 6.16 },
      { x: 9.37, y: 2.97, z: 26.93, w: 1.19, h: 5.93, d: 1.19 },
      { x: 9.24, y: 7.59, z: 26.77, w: 6.87, h: 4.79, d: 7.7 },
      { x: -0.64, y: 2.87, z: 31.52, w: 1.15, h: 5.73, d: 1.15 },
      { x: 0.01, y: 8.36, z: 31.05, w: 6.76, h: 4.84, d: 7.65 },
      { x: -16.95, y: 3.11, z: 24.14, w: 1.24, h: 6.22, d: 1.24 },
      { x: -17.85, y: 8.94, z: 23.88, w: 7.38, h: 5.25, d: 7.88 },
      { x: -28.47, y: 2.76, z: 10.9, w: 1.1, h: 5.52, d: 1.1 },
      { x: -28.77, y: 7.46, z: 11.25, w: 6.24, h: 4.19, d: 6.14 },
      { x: -27.84, y: 2.59, z: -1.65, w: 1.03, h: 5.17, d: 1.03 },
      { x: -27.88, y: 6.72, z: -1.37, w: 7.72, h: 4.91, d: 7.23 },
      { x: -30.06, y: 2.53, z: -12.32, w: 1.01, h: 5.06, d: 1.01 },
      { x: -29.96, y: 6.75, z: -12.17, w: 6.38, h: 4.41, d: 7.25 },
      { x: -30.19, y: 2.26, z: -23.64, w: 0.91, h: 4.53, d: 0.91 },
      { x: -29.99, y: 5.85, z: -23.39, w: 5.77, h: 3.82, d: 5.52 },
      { x: -20.37, y: 2.61, z: -35.06, w: 1.04, h: 5.22, d: 1.04 },
      { x: -20.05, y: 7.44, z: -35.21, w: 6.58, h: 5.38, d: 6.87 },
      { x: -4.05, y: 2.71, z: -35.38, w: 1.08, h: 5.42, d: 1.08 },
      { x: -3.48, y: 7.75, z: -35.41, w: 6.9, h: 5.08, d: 7.45 },
      { x: 1.99, y: 2.33, z: -45.24, w: 0.93, h: 4.66, d: 0.93 },
      { x: 2.15, y: 6.14, z: -45.57, w: 5.72, h: 3.56, d: 5.13 },
      { x: 13.04, y: 3.08, z: -33.52, w: 1.23, h: 6.16, d: 1.23 },
      { x: 12.62, y: 8.84, z: -34.02, w: 7.86, h: 4.87, d: 7.82 },
      { x: 29.5, y: 2.99, z: -27.33, w: 1.2, h: 5.99, d: 1.2 },
      { x: 29.36, y: 8.06, z: -27.38, w: 7.84, h: 5.87, d: 8.37 },
      { x: 34.32, y: 2.66, z: -16.72, w: 1.06, h: 5.32, d: 1.06 },
      { x: 34.74, y: 7.34, z: -16.61, w: 6.53, h: 5.03, d: 6.32 },
    ],
    bounds: { minX: -30, maxX: 30, minZ: -22, maxZ: 20 },
    wide: { pos: [4, 6.5, 24], target: [-1, 3, -6] },
    surface: [7.6, 1.52, -2.2],
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
