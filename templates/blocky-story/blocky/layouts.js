// Where things are in each place, as plain data (places.js builds the place around it; motion.js walks in it):
// - `spots`: { x, z, rot } where characters stand, sit or lie (rot 0 faces +z, toward the usual camera side), plus
//   `seat` (sitting height) or `bed` (lying height), and `y` for raised ground;
// - `seats`, `beds`: the spots used when a shot sits or lays someone down without saying where;
// - `blocks`: the furniture's footprints { name, x, z, w, d, rot } that walks go around;
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
    },
    seats: ["sofaL", "sofaR", "sofa"],
    beds: [],
    blocks: [
      { name: "the sofa", x: 0, z: -7.6, w: 9.4, d: 3.6 },
      { name: "the coffee table", x: 0, z: -3.3, w: 5.2, d: 2.6 },
      { name: "the lamp", x: -7, z: -9, w: 1.4, d: 1.4 },
      { name: "the plant", x: 6.6, z: -9.3, w: 1.4, d: 1.4 },
      { name: "the shelf", x: -12.2, z: -3, w: 1.6, d: 4.2 },
      { name: "the TV", x: 11.8, z: -2, w: 1.6, d: 5.2 },
    ],
    bounds: { minX: -13.6, maxX: 13.6, minZ: -11.6, maxZ: 11.6 },
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
      { name: "the bed", x: -6, z: -5.8, w: 5.6, d: 9.8 },
      { name: "the nightstand", x: -1.8, z: -9.2, w: 2.2, d: 2 },
      { name: "the desk", x: 9.5, z: -6, w: 2.6, d: 5.2 },
      { name: "the chair", x: 7.4, z: -6, w: 2, d: 2 },
      { name: "the toy box", x: 7, z: 3, w: 1.8, d: 1.8 },
    ],
    bounds: { minX: -11.6, maxX: 11.6, minZ: -9.6, maxZ: 9.6 },
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
      { name: "the blue car", x: 11, z: -2.4, w: 8.4, d: 4 },
      { name: "the red car", x: -16, z: 2.4, w: 8.4, d: 4 },
      { name: "a street lamp", x: -2.5, z: -8, w: 0.9, d: 0.9 },
      { name: "a street lamp", x: 12.5, z: -8, w: 0.9, d: 0.9 },
      { name: "a street lamp", x: -17.5, z: -8, w: 0.9, d: 0.9 },
      { name: "a tree", x: 7.5, z: -10.5, w: 1.8, d: 1.8 },
      { name: "a tree", x: -7.5, z: -10.5, w: 1.8, d: 1.8 },
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
      { name: "the slide", x: -9, z: -11, w: 3.6, d: 8, rot: 0.5 },
      { name: "the swings", x: 9, z: -14, w: 8, d: 3, rot: -0.2 },
      { name: "the bench", x: 9, z: -3, w: 6.2, d: 2, rot: -0.9 },
      { name: "the sandbox", x: -10, z: -3, w: 8, d: 6 },
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
      { name: "the campfire", x: -4.5, z: -2.5, w: 3, d: 3 },
      { name: "a log", x: -7.7, z: -3.5, w: 4.2, d: 1.2, rot: 0.7 },
      { name: "a log", x: -1.5, z: -0.9, w: 4.2, d: 1.2, rot: -0.9 },
      { name: "the cabin", x: 9, z: -17, w: 10, d: 9, rot: -0.4 },
    ],
    bounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 12 },
    wide: { pos: [2, 6.5, 24], target: [0, 4.5, -8] },
    surface: [-6.6, 0.9, -3.6],
  },
};

/** A place's layout (home when the name is unknown). */
export const layoutOf = (name) => LAYOUTS[name] ?? LAYOUTS.home;
