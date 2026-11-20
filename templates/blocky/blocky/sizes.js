// The Blocky world's scale and the real size of things. An adult figure (size 1) is 5.3 units tall and stands for
// a 1.8 m person, so every object is sized in meters and turned into units the same way: a phone is a phone in a
// hand, a mouse is smaller than the table it sits on. Add the real size of every new prop here.
import * as THREE from "three";

/** An adult figure's height in units, and the real height it stands for. */
export const FIGURE_UNITS = 5.3;
export const FIGURE_METERS = 1.8;
export const UNITS_PER_METER = FIGURE_UNITS / FIGURE_METERS;

/** Meters to units. */
export const meters = (m) => m * UNITS_PER_METER;

/** Each prop's real size: its longest side, in meters. */
export const SIZES = {
  letter: 0.3, // an A4 sheet
  phone: 0.15,
  cake: 0.26,
  gift: 0.3,
  book: 0.24,
  ball: 0.22, // a football
  key: 0.07,
  cup: 0.11,
  photo: 0.15,
  trophy: 0.32,
  megaphone: 0.4,
  battery: 0.05, // an AA battery
  mouse: 0.11, // a computer mouse
};

/**
 * Real sizes places are built to, in meters (checked on the Places sheet). Seats are the exception: the figures'
 * legs are short toy legs, so a seat sits at their knee height (`SEAT_HEIGHT`, in units) and their feet reach
 * the floor.
 */
export const WORLD = {
  door: { min: 2.0, max: 2.3 },
  table: { min: 0.4, max: 0.85 },
};

/** A seat's top, in units: an adult figure's knee (1.14) less half a thigh, so sitting feet touch the floor. */
export const SEAT_HEIGHT = 0.66;
/** A bed's mattress top, in units (a low bed: a figure sitting on its edge nearly reaches the floor). */
export const BED_HEIGHT = 1.3;

/** An object's size along x, y and z, in units, as it stands. */
export function measure(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

/** The longest side of an object, in units. */
export function longestSide(object) {
  const size = measure(object);
  return Math.max(size.x, size.y, size.z);
}

/** Scales a built object (about its origin) so that its longest side is `realSize` meters. */
export function fitSize(object, realSize) {
  const now = longestSide(object);
  if (now > 0 && realSize > 0) object.scale.multiplyScalar(meters(realSize) / now);
  return object;
}

/** "11 cm", "1.2 m": a real size in plain words. */
export function sizeWords(realSize) {
  return realSize < 1
    ? `${Math.round(realSize * 100)} cm`
    : `${Math.round(realSize * 100) / 100} m`;
}
