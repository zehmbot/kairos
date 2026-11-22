// What every piece of a place takes up, as plain numbers (no three.js): its physics boxes (`solids`), its footprint
// that walks go around (`blocks`), and raised ground people stand on (`raised`: porches, decks). The same specs
// size the pieces kit.js builds, so what you see and what bumps are the same thing.
//
// A piece is { kind, x, z, rot, seed, ... }: `rot` turns it (0: its front faces +z), sizes are in units (an adult
// figure is 5.3 units = 1.8 m). Solids and blocks use the place's convention: a point is inside when
// |dx·cos(rot) − dz·sin(rot)| ≤ w/2 and |dx·sin(rot) + dz·cos(rot)| ≤ d/2.
import { meters, SEAT_HEIGHT } from "./sizes.js";
import { rng } from "./util.js";

/** A storey of a house: about 2.9 m from floor to floor. */
export const STOREY = meters(2.9);
/** How high porches and decks stand (a single step). */
export const DECK_HEIGHT = 0.45;

const SIDINGS = ["#e9e2d0", "#b9d3e6", "#f1d6b8", "#cfe0c3", "#e8c4cf", "#d9dbe6", "#f3efe4"];
const ROOFS = ["#5b4a4a", "#3d4a6b", "#4a4f57", "#6e4b3a", "#2f3a46"];
const DOORS = ["#b13e53", "#29366f", "#257179", "#5d275d", "#3b5dc9", "#2f2f35"];

/** A house's sizes, layout and colors, from its seed (or set on the piece). Front faces +z. */
export function houseSpec(p) {
  const random = rng(`house${p.seed ?? 0}`);
  const floors = p.floors ?? (random() < 0.5 ? 1 : 2);
  const w = p.w ?? 26 + Math.floor(random() * 3) * 2;
  const d = p.d ?? 20;
  // The ground floor stands one step up, level with the porch.
  const base = DECK_HEIGHT;
  const wallH = base + STOREY * floors;
  const roofH = p.roofH ?? (floors === 2 ? 7 : 6) + random() * 1.5;
  const garageSide =
    p.garage !== undefined ? p.garage : random() < 0.65 ? (random() < 0.5 ? -1 : 1) : 0;
  const porch = p.porch ?? random() < 0.75;
  const doorX = garageSide ? -garageSide * (w * 0.12) : 0;
  return {
    floors,
    w,
    d,
    base,
    wallH,
    roofH,
    garage: garageSide ? { side: garageSide, w: 11, d: d - 3, h: base + STOREY, roofH: 3.4 } : null,
    porch: porch ? { x: doorX, w: 12, d: 5, roofY: base + STOREY } : null,
    doorX,
    siding: p.siding ?? SIDINGS[Math.floor(random() * SIDINGS.length)],
    roof: p.roof ?? ROOFS[Math.floor(random() * ROOFS.length)],
    door: p.door ?? DOORS[Math.floor(random() * DOORS.length)],
    shutters: p.shutters ?? (random() < 0.6 ? DOORS[Math.floor(random() * DOORS.length)] : null),
    chimney: p.chimney ?? random() < 0.6,
    back: p.back ?? null,
  };
}

/** A round tree's trunk and the clumps of its crown, from its seed and scale. */
export function treeSpec(p) {
  const random = rng(`tree${p.seed ?? 0}`);
  const s = p.scale ?? 1;
  const trunkH = 7.2 * s;
  const crownY = trunkH + 2.6 * s;
  const clumps = [];
  const n = 7 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random() * 0.6;
    const r = (i === 0 ? 0 : 1.6 + random() * 1.6) * s;
    const size = (i === 0 ? 3.4 : 2.2 + random() * 1.1) * s;
    clumps.push({
      x: Math.cos(a) * r,
      y: crownY + (i === 0 ? 0.6 * s : (random() - 0.35) * 2.6 * s),
      z: Math.sin(a) * r,
      r: size,
    });
  }
  return { s, trunkH, trunkR: 0.55 * s, clumps, color: p.color ?? null };
}

/** A bush's clumps (and its flowers' color), from its seed and size. */
export function bushSpec(p) {
  const random = rng(`bush${p.seed ?? 0}`);
  const size = p.size ?? 1.6;
  const clumps = [];
  const n = 4 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random();
    const r = i === 0 ? 0 : size * (0.45 + random() * 0.35);
    const cs = size * (i === 0 ? 0.85 : 0.55 + random() * 0.25);
    clumps.push({ x: Math.cos(a) * r, y: cs * 0.75, z: Math.sin(a) * r, r: cs });
  }
  return { size, clumps, flowers: p.flowers ?? null };
}

/** The box around a list of spheres (clumps), in the piece's own coordinates. */
function clumpBox(clumps) {
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const c of clumps) {
    x0 = Math.min(x0, c.x - c.r);
    x1 = Math.max(x1, c.x + c.r);
    y0 = Math.min(y0, c.y - c.r * 0.85);
    y1 = Math.max(y1, c.y + c.r * 0.85);
    z0 = Math.min(z0, c.z - c.r);
    z1 = Math.max(z1, c.z + c.r);
  }
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: (z0 + z1) / 2,
    w: x1 - x0,
    h: y1 - y0,
    d: z1 - z0,
  };
}

/**
 * Each kind's shape in its own coordinates: `solids` (boxes { x, y, z, w, h, d } around their middle), `block`
 * (its footprint { name, x, z, w, d, h }) or `blocks`, and `raised` ({ x, z, w, d, y }: ground people stand on).
 */
const SHAPES = {
  house(p) {
    const h = houseSpec(p);
    const solids = [
      { x: 0, y: h.wallH / 2, z: 0, w: h.w, h: h.wallH, d: h.d },
      { x: 0, y: h.wallH + h.roofH / 2, z: 0, w: h.w * 0.7, h: h.roofH, d: h.d * 0.7 },
    ];
    const blocks = [
      { name: p.name ?? "a house", x: 0, z: 0, w: h.w + 0.6, d: h.d + 0.6, h: h.wallH + h.roofH },
    ];
    const raised = [];
    if (h.garage) {
      const g = h.garage;
      const gx = g.side * (h.w / 2 + g.w / 2);
      const gz = -(h.d - g.d) / 2;
      solids.push({ x: gx, y: g.h / 2, z: gz, w: g.w, h: g.h, d: g.d });
      solids.push({ x: gx, y: g.h + g.roofH / 2, z: gz, w: g.w * 0.8, h: g.roofH, d: g.d * 0.6 });
      blocks.push({ name: "a garage", x: gx, z: gz, w: g.w + 0.6, d: g.d + 0.6, h: g.h + g.roofH });
    }
    if (h.porch) {
      const pr = h.porch;
      const pz = h.d / 2 + pr.d / 2;
      solids.push({ x: pr.x, y: DECK_HEIGHT / 2, z: pz, w: pr.w, h: DECK_HEIGHT, d: pr.d });
      raised.push({ x: pr.x, z: pz, w: pr.w, d: pr.d, y: DECK_HEIGHT });
      for (const side of [-1, 1]) {
        const px = pr.x + side * (pr.w / 2 - 0.45);
        const postZ = h.d / 2 + pr.d - 0.45;
        solids.push({
          x: px,
          y: (DECK_HEIGHT + pr.roofY) / 2,
          z: postZ,
          w: 0.5,
          h: pr.roofY - DECK_HEIGHT,
          d: 0.5,
        });
        blocks.push({ name: "a porch post", x: px, z: postZ, w: 0.8, d: 0.8, h: pr.roofY });
      }
      solids.push({
        x: pr.x,
        y: pr.roofY + 0.25,
        z: h.d / 2 + pr.d / 2,
        w: pr.w + 0.6,
        h: 0.5,
        d: pr.d + 0.5,
      });
    }
    return { solids, blocks, raised };
  },
  /** A straight fence from `from` to `to` ([x, z], in the place), open at `gaps` ([middle along it, width]). */
  fence(p) {
    const tall = p.style === "privacy" ? meters(1.8) : meters(0.9);
    const thick = p.style === "privacy" ? 0.5 : 0.35;
    const [ax, az] = p.from;
    const [bx, bz] = p.to;
    const length = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    const rot = -Math.atan2(uz, ux);
    const cuts = (p.gaps ?? [])
      .map(([at, width]) => [at - width / 2, at + width / 2])
      .sort((a, b) => a[0] - b[0]);
    const runs = [];
    let start = 0;
    for (const [a, b] of cuts) {
      if (a > start + 0.2) runs.push([start, a]);
      start = Math.max(start, b);
    }
    if (length > start + 0.2) runs.push([start, length]);
    const solids = [];
    const blocks = [];
    for (const [a, b] of runs) {
      const mid = (a + b) / 2;
      const x = ax + ux * mid;
      const z = az + uz * mid;
      solids.push({ x, y: tall / 2, z, w: b - a, h: tall, d: thick, rot, world: true });
      blocks.push({
        name: p.name ?? "the fence",
        x,
        z,
        w: b - a,
        d: thick + 0.3,
        h: tall,
        rot,
        world: true,
      });
    }
    return { solids, blocks, raised: [] };
  },
  tree(p) {
    const t = treeSpec(p);
    const crown = clumpBox(t.clumps);
    return {
      solids: [
        { x: 0, y: t.trunkH / 2, z: 0, w: t.trunkR * 2, h: t.trunkH, d: t.trunkR * 2 },
        crown,
      ],
      blocks: [
        {
          name: "a tree",
          x: 0,
          z: 0,
          w: t.trunkR * 2 + 0.8,
          d: t.trunkR * 2 + 0.8,
          h: crown.y + crown.h / 2,
        },
      ],
      raised: [],
    };
  },
  bush(p) {
    const b = bushSpec(p);
    const box = clumpBox(b.clumps);
    return {
      solids: [box],
      blocks: [
        { name: p.name ?? "a bush", x: box.x, z: box.z, w: box.w, d: box.d, h: box.y + box.h / 2 },
      ],
      raised: [],
    };
  },
  flowerBed(p) {
    const w = p.w ?? 6;
    const d = p.d ?? 1.8;
    return {
      solids: [{ x: 0, y: 0.25, z: 0, w, h: 0.5, d }],
      blocks: [{ name: "a flower bed", x: 0, z: 0, w, d, h: 1.1 }],
      raised: [],
    };
  },
  mailbox: () => ({
    solids: [{ x: 0, y: 1.7, z: 0, w: 0.9, h: 3.4, d: 1.6 }],
    blocks: [{ name: "a mailbox", x: 0, z: 0, w: 1.2, d: 1.8, h: 3.4 }],
    raised: [],
  }),
  hydrant: () => ({
    solids: [{ x: 0, y: 1.1, z: 0, w: 1, h: 2.2, d: 1 }],
    blocks: [{ name: "a fire hydrant", x: 0, z: 0, w: 1.2, d: 1.2, h: 2.2 }],
    raised: [],
  }),
  bin: () => ({
    solids: [{ x: 0, y: 1.5, z: 0, w: 1.9, h: 3, d: 2.1 }],
    blocks: [{ name: "a bin", x: 0, z: 0, w: 2.2, d: 2.4, h: 3 }],
    raised: [],
  }),
  lamp(p) {
    const tall = p.tall ?? meters(3.6);
    return {
      solids: [
        { x: 0, y: tall / 2, z: 0, w: 0.5, h: tall, d: 0.5 },
        { x: 0, y: tall + 0.9, z: 0, w: 1.4, h: 1.9, d: 1.4 },
      ],
      blocks: [{ name: p.name ?? "a street lamp", x: 0, z: 0, w: 1, d: 1, h: tall + 1.8 }],
      raised: [],
    };
  },
  car: (p) => ({
    solids: [
      { x: 0, y: 1.95, z: 0, w: 13, h: 2.5, d: 5.2 },
      { x: -0.6, y: 3.95, z: 0, w: 7.2, h: 1.5, d: 4.7 },
    ],
    blocks: [{ name: p.name ?? "a car", x: 0, z: 0, w: 13.6, d: 5.8, h: 4.7 }],
    raised: [],
  }),
  rock(p) {
    const s = p.size ?? 1.2;
    return {
      solids: [{ x: 0, y: s * 0.4, z: 0, w: s * 1.8, h: s * 0.8, d: s * 1.5 }],
      blocks: [{ name: "a rock", x: 0, z: 0, w: s * 1.9, d: s * 1.6, h: s * 0.8 }],
      raised: [],
    };
  },
  pond(p) {
    const r = p.r ?? 5;
    return {
      solids: [{ x: 0, y: 0.15, z: 0, w: r * 2.2, h: 0.3, d: r * 1.7 }],
      blocks: [{ name: "the pond", x: 0, z: 0, w: r * 2.2, d: r * 1.7, h: 0.3 }],
      raised: [],
    };
  },
  picnicTable() {
    const top = 1.9;
    return {
      solids: [
        { x: 0, y: top - 0.15, z: 0, w: 7, h: 0.3, d: 3 },
        { x: 0, y: SEAT_HEIGHT - 0.15, z: 2.6, w: 7, h: 0.3, d: 1.2 },
        { x: 0, y: SEAT_HEIGHT - 0.15, z: -2.6, w: 7, h: 0.3, d: 1.2 },
        { x: 0, y: (top - 0.3) / 2, z: 0, w: 6, h: top - 0.3, d: 1.6 },
      ],
      blocks: [{ name: "the picnic table", x: 0, z: 0, w: 7.4, d: 6.6, h: top }],
      raised: [],
    };
  },
  sandbox(p) {
    const w = p.w ?? 8;
    const d = p.d ?? 6;
    return {
      solids: [
        { x: 0, y: 0.3, z: -d / 2 + 0.25, w, h: 0.6, d: 0.5 },
        { x: 0, y: 0.3, z: d / 2 - 0.25, w, h: 0.6, d: 0.5 },
        { x: -w / 2 + 0.25, y: 0.3, z: 0, w: 0.5, h: 0.6, d },
        { x: w / 2 - 0.25, y: 0.3, z: 0, w: 0.5, h: 0.6, d },
        { x: 0, y: 0.15, z: 0, w: w - 1, h: 0.3, d: d - 1 },
      ],
      blocks: [{ name: "the sandbox", x: 0, z: 0, w, d, h: 0.6 }],
      raised: [],
    };
  },
  slide: () => ({
    solids: [
      { x: 0, y: 3.15, z: 0, w: 3.8, h: 6.3, d: 3.8 },
      { x: 0, y: 1.1, z: 4.8, w: 2, h: 2.2, d: 6.2 },
    ],
    blocks: [{ name: "the slide", x: 0, z: 2.9, w: 3.8, d: 10, h: 6.3 }],
    raised: [],
  }),
  swingSet: () => ({
    solids: [
      { x: 0, y: 7.15, z: 0, w: 8.6, h: 0.35, d: 0.35 },
      { x: 4, y: 3.6, z: 0, w: 0.4, h: 7.2, d: 3.3 },
      { x: -4, y: 3.6, z: 0, w: 0.4, h: 7.2, d: 3.3 },
      // The two swings: chains and seat.
      { x: 1.8, y: 4.45, z: 0, w: 1.8, h: 5.2, d: 0.9 },
      { x: -1.8, y: 4.45, z: 0, w: 1.8, h: 5.2, d: 0.9 },
    ],
    blocks: [{ name: "the swings", x: 0, z: 0, w: 8.8, d: 3.4, h: 7.3 }],
    raised: [],
  }),
  bench: () => ({
    solids: [
      { x: 0, y: 0.33, z: 0, w: 6, h: 0.66, d: 1.8 },
      { x: 0, y: 1.76, z: -0.8, w: 6, h: 1.4, d: 0.25 },
    ],
    blocks: [{ name: "the bench", x: 0, z: 0, w: 6.2, d: 2, h: 2.5 }],
    raised: [],
  }),
  trampoline(p) {
    const r = p.r ?? 4.4;
    return {
      solids: [{ x: 0, y: 1.3, z: 0, w: r * 1.8, h: 2.6, d: r * 1.8 }],
      blocks: [{ name: "the trampoline", x: 0, z: 0, w: r * 2, d: r * 2, h: 2.6 }],
      raised: [],
    };
  },
  grill: () => ({
    solids: [{ x: 0, y: 1.5, z: 0, w: 2.2, h: 3, d: 2.2 }],
    blocks: [{ name: "the barbecue", x: 0, z: 0, w: 2.4, d: 2.4, h: 3 }],
    raised: [],
  }),
  gardenChair: () => ({
    solids: [
      { x: 0, y: SEAT_HEIGHT / 2, z: 0, w: 2, h: SEAT_HEIGHT, d: 2 },
      { x: 0, y: SEAT_HEIGHT + 1, z: -0.85, w: 2, h: 2, d: 0.3 },
    ],
    blocks: [{ name: "a garden chair", x: 0, z: 0, w: 2.2, d: 2.2, h: SEAT_HEIGHT + 2 }],
    raised: [],
  }),
  patioTable: () => ({
    solids: [
      { x: 0, y: 1.9, z: 0, w: 3, h: 0.25, d: 3 },
      { x: 0, y: 0.9, z: 0, w: 1, h: 1.8, d: 1 },
    ],
    blocks: [{ name: "the garden table", x: 0, z: 0, w: 3.2, d: 3.2, h: 2.05 }],
    raised: [],
  }),
  /** Lights strung between `anchors` ([x, z, y], in the place) on posts standing at `posts` ([x, z]). */
  stringLights(p) {
    const tall = p.tall ?? 8;
    return {
      solids: (p.posts ?? []).map(([x, z]) => ({
        x,
        y: tall / 2,
        z,
        w: 0.45,
        h: tall,
        d: 0.45,
        world: true,
      })),
      blocks: (p.posts ?? []).map(([x, z]) => ({
        name: "a light post",
        x,
        z,
        w: 0.8,
        d: 0.8,
        h: tall,
        world: true,
      })),
      raised: [],
    };
  },
  deck(p) {
    const w = p.w ?? 20;
    const d = p.d ?? 10;
    return {
      solids: [{ x: 0, y: DECK_HEIGHT / 2, z: 0, w, h: DECK_HEIGHT, d }],
      blocks: [],
      raised: [{ x: 0, z: 0, w, d, y: DECK_HEIGHT }],
    };
  },
};

/** The kinds kit.js can build. */
export const PIECE_KINDS = Object.keys(SHAPES);

/** A box in a piece's coordinates moved into the place (turned by the piece's `rot`, then moved to its x, z). */
function place(box, p) {
  const lift = p.y ?? 0;
  if (box.world) {
    const { world, ...rest } = box;
    if (rest.y !== undefined) rest.y = round(rest.y + lift);
    return rest;
  }
  const r = p.rot ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // The piece turns by r around y: its local (x, z) goes to (x·cos r + z·sin r, −x·sin r + z·cos r).
  const x = p.x + box.x * c + box.z * s;
  const z = p.z - box.x * s + box.z * c;
  const out = { ...box, x: round(x), z: round(z), rot: round((box.rot ?? 0) + r) };
  if (box.y !== undefined) out.y = round(box.y + lift);
  return out;
}
const round = (v) => Math.round(v * 1000) / 1000;

/** A place's pieces as physics boxes, footprints and raised ground, in the place. */
export function piecesShapes(pieces = []) {
  const solids = [];
  const blocks = [];
  const raised = [];
  for (const p of pieces) {
    const shape = SHAPES[p.kind]?.(p);
    if (!shape) continue;
    for (const b of shape.solids) solids.push(place(b, p));
    for (const b of shape.blocks) blocks.push(place(b, p));
    for (const b of shape.raised) raised.push(place(b, p));
  }
  return { solids, blocks, raised };
}

/** How high the ground is at x, z on raised pieces (porches, decks), or `null` off them. */
export function raisedAt(raised, x, z) {
  let top = null;
  for (const r of raised) {
    const c = Math.cos(r.rot ?? 0);
    const s = Math.sin(r.rot ?? 0);
    const dx = x - r.x;
    const dz = z - r.z;
    if (Math.abs(dx * c - dz * s) <= r.w / 2 && Math.abs(dx * s + dz * c) <= r.d / 2) {
      top = Math.max(top ?? 0, r.y);
    }
  }
  return top;
}
