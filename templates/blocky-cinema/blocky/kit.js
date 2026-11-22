// The place kit: builds a layout's pieces. shapes.js says what each piece takes up (physics, footprint, raised
// ground); the kit-*.js files say how it looks. Each built piece is one group in the place, its meshes merged by
// material (freeze), so a street of detailed houses still draws quickly.
import * as garden from "./kit-garden.js";
import * as street from "./kit-house.js";
import { bench, slide, swingSet } from "./props.js";
import { freeze } from "./util.js";

const BUILDERS = {
  house: street.house,
  car: street.car,
  lamp: street.lamp,
  mailbox: street.mailbox,
  hydrant: street.hydrant,
  bin: street.bin,
  deck: street.deck,
  stringLights: street.stringLights,
  tree: garden.tree,
  bush: garden.bush,
  flowerBed: garden.flowerBed,
  fence: garden.fence,
  rock: garden.rock,
  pond: garden.pond,
  picnicTable: garden.picnicTable,
  sandbox: garden.sandbox,
  trampoline: garden.trampoline,
  grill: garden.grill,
  gardenChair: garden.gardenChair,
  patioTable: garden.patioTable,
  slide: () => slide(),
  swingSet: () => swingSet(),
  bench: () => bench(),
};

/** Kinds built in place coordinates (a fence's ends, string lights' posts), not around their own origin. */
const IN_PLACE = new Set(["fence", "stringLights"]);

/** One piece, built and placed: `ctx` is { lit } (lamps and windows on). */
export function buildPiece(piece, ctx) {
  const build = BUILDERS[piece.kind];
  if (!build) return null;
  const g = build(piece, ctx);
  if (IN_PLACE.has(piece.kind)) {
    g.position.set(0, piece.y ?? 0, 0);
  } else {
    g.position.set(piece.x ?? 0, piece.y ?? 0, piece.z ?? 0);
    g.rotation.y = piece.rot ?? 0;
  }
  freeze(g);
  g.userData.piece = piece;
  return g;
}

/** Builds every piece of a layout into `group`. */
export function buildPieces(group, pieces, ctx) {
  for (const piece of pieces ?? []) {
    const built = buildPiece(piece, ctx);
    if (built) group.add(built);
  }
}
