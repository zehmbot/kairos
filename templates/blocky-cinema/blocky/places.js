// The places a story happens in. Each is built once per light ("day", "evening", "night") and cached.
// A place gives: the group, its layout (layouts.js: `spots` where characters stand, sit or lie, the furniture's
// footprints, the `wide` establishing shot, a `surface` for close-ups of small objects), fog, and `update(t)` for
// anything that moves.
import * as THREE from "three";
import { buildPieces } from "./kit.js";
import { tiledPlane } from "./kit-parts.js";
import { LAYOUTS } from "./layouts.js";
import { glow } from "./props.js";
import { cabinSpec } from "./shapes.js";
import { backdrop, horizonOf } from "./sky.js";
import {
  asphalt,
  carpet,
  concrete,
  grass,
  gravel,
  planks,
  plaster,
  tiles,
  wallpaper,
} from "./textures.js";
import { canvasTexture, freeze, mesh, paint, rng, roundedBox, speckle } from "./util.js";

/** Light settings for each time of day. */
// Lights have a reason (the sun, a window, a lamp) and the exposure stays near normal: shadows stay dark, lamps,
// windows and fire glow, and the engine adds a key light beside the camera with a soft fill and a rim behind people.
const SCALE = 0.6;

/** How fine shadows are for each look (quality level: draft, standard, cinematic). */
const SHADOW_MAP = { draft: 1024, standard: 1536, cinematic: 2048 };
let look = "standard";
/** The look places are built for (the engine sets it before building any place). */
export function setLook(name) {
  look = SHADOW_MAP[name] ? name : "standard";
}
/** The shadow size for the current look. */
export const shadowSize = () => SHADOW_MAP[look];

export const LIGHTS = {
  day: {
    sun: "#fff1dc",
    sunI: 2.6,
    sunPos: [18, 30, 16],
    sky: "#cfe6ff",
    ground: "#8a7a62",
    hemiI: 1.0,
    env: 0.27,
    exposure: 1.65,
    indoorExposure: 1.1,
    outdoorExposure: 1.2,
    windowSky: "#bfe3ff",
  },
  evening: {
    sun: "#ffab6b",
    sunI: 1.7,
    sunPos: [30, 10, 14],
    sky: "#a08ad6",
    ground: "#5a3a2a",
    hemiI: 0.7,
    env: 0.18,
    exposure: 1.7,
    indoorExposure: 1.05,
    outdoorExposure: 1.15,
    windowSky: "#ff9e6b",
  },
  night: {
    sun: "#8fb0ff",
    sunI: 0.75,
    sunPos: [-16, 26, 12],
    sky: "#2a3a6a",
    ground: "#0d1020",
    hemiI: 0.55,
    env: 0.085,
    exposure: 2.0,
    indoorExposure: 1.0,
    outdoorExposure: 1.1,
    windowSky: "#1d2b5a",
  },
};

/** The main light (sun or moon) with soft shadows around `center`. */
function sunLight(g, preset, center = [0, 0, 0], range = 20, scale = 1, boost = 1) {
  const L = LIGHTS[preset];
  const sun = new THREE.DirectionalLight(L.sun, L.sunI * scale * boost * SCALE);
  sun.position.set(center[0] + L.sunPos[0], center[1] + L.sunPos[1], center[2] + L.sunPos[2]);
  sun.target.position.set(...center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize(), shadowSize());
  Object.assign(sun.shadow.camera, {
    left: -range,
    right: range,
    top: range,
    bottom: -range,
    near: 1,
    far: 140,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  g.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemiI * boost * SCALE);
  g.add(hemi);
  return sun;
}

/** Outdoors the exposure comes down near normal: the sun and sky get this much brighter to match. */
const outdoorBoost = (preset) => LIGHTS[preset].exposure / LIGHTS[preset].outdoorExposure;

/**
 * A lamp that lights a pool around it and casts soft shadows (above the draft look): a room's warm practical light.
 * `toward` is where it points from the lamp.
 */
function lampSpot(
  g,
  [x, y, z],
  toward,
  { color = "#ffb36b", intensity = 120, angle = 1.25, distance = 48, shadow = true } = {},
) {
  const light = new THREE.SpotLight(color, intensity, distance, angle, 0.9, 1.3);
  light.position.set(x, y, z);
  light.target.position.set(x + toward[0], y + toward[1], z + toward[2]);
  light.castShadow = shadow && look !== "draft";
  light.shadow.mapSize.set(shadowSize() / 2, shadowSize() / 2);
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.05;
  light.shadow.radius = 6;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = distance;
  g.add(light, light.target);
  return light;
}

/** A fire's light: warm, all around, with soft shadows above the draft look (it flickers in the place's update). */
function campfireLight(g, x, y, z, intensity, distance = 34) {
  const light = new THREE.PointLight("#ff8a3a", intensity * SCALE, distance, 1.5);
  light.position.set(x, y, z);
  light.castShadow = look !== "draft";
  light.shadow.mapSize.set(shadowSize() / 4, shadowSize() / 4);
  light.shadow.bias = -0.002;
  light.shadow.radius = 6;
  light.shadow.camera.near = 0.3;
  light.shadow.camera.far = distance;
  g.add(light);
  return light;
}

/** A warm light from a lamp, without shadows (cheap). */
function lampLight(g, x, y, z, intensity, color = "#ffc27a", distance = 26) {
  const light = new THREE.PointLight(color, intensity * SCALE, distance, 1.6);
  light.position.set(x, y, z);
  g.add(light);
  return light;
}

/** A flat ground of `material` (textures repeat with its maps). */
function flat(w, d, material) {
  const m = mesh(new THREE.PlaneGeometry(w, d), material, { cast: false });
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** A textured surface: `make` gives { map, bumpMap }; its texture repeats every `tile` units. */
const surface = (maps, bumpScale = 1, roughness = 0.9) =>
  paint("#ffffff", { ...maps, roughness, bumpScale });

/**
 * A room's shell: the floor, four walls and a ceiling (they show only from inside, so the camera can stand outside),
 * skirting boards along the floor and a crown molding along the ceiling. `floor` and `wall` are { material, tile }:
 * their textures repeat every `tile` units.
 */
function roomShell(g, { w, d, h, floor, wall, ceiling = "#f2efe8" }) {
  const ground = mesh(tiledPlane(w, d, floor.tile), floor.material, { cast: false });
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);
  const white = paint("#f4f1ea", { roughness: 0.6 });
  const sides = [
    [0, -d / 2, 0, w],
    [-w / 2, 0, Math.PI / 2, d],
    [w / 2, 0, -Math.PI / 2, d],
    [0, d / 2, Math.PI, w],
  ];
  for (const [x, z, ry, width] of sides) {
    const m = mesh(tiledPlane(width, h, wall.tile), wall.material, { cast: false });
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    g.add(m);
    const board = mesh(roundedBox(width, 0.5, 0.2, 0.04), white, { cast: false });
    board.position.set(x + Math.sin(ry) * 0.1, 0.25, z + Math.cos(ry) * 0.1);
    board.rotation.y = ry;
    const crown = mesh(roundedBox(width, 0.45, 0.35, 0.06), white, { cast: false });
    crown.position.set(x + Math.sin(ry) * 0.17, h - 0.22, z + Math.cos(ry) * 0.17);
    crown.rotation.y = ry;
    g.add(board, crown);
  }
  const top = mesh(new THREE.PlaneGeometry(w, d), paint(ceiling, { roughness: 1 }), {
    cast: false,
  });
  top.rotation.x = Math.PI / 2;
  top.position.y = h;
  g.add(top);
}

/** What a room's pieces need to know about the light: lamps on, night, the sky in the windows. */
const roomContext = (preset) => ({
  lit: preset !== "day",
  night: preset === "night",
  sky: LIGHTS[preset].windowSky,
});

/** Ceiling panels in rows over `xs` × `zs`, glowing (school halls, classrooms). */
function ceilingPanels(g, xs, zs, y) {
  for (const x of xs) {
    for (const z of zs) {
      const panel = mesh(roundedBox(3.2, 0.15, 1.2, 0.05), glow("#ffffff", 1.3), { cast: false });
      panel.position.set(x, y - 0.1, z);
      g.add(panel);
    }
  }
}

// ---------- Indoors ----------

function home(preset) {
  const g = new THREE.Group();
  const night = preset === "night";
  const lampsOn = preset !== "day";
  roomShell(g, {
    w: 30,
    d: 26,
    h: 11,
    floor: { material: surface(planks("#b07a4a", [1, 1], { count: 6 }), 1.2, 0.55), tile: 4 },
    wall: { material: surface(wallpaper("#efe3cc", "#c9a97a"), 0.4), tile: 4 },
  });
  buildPieces(g, LAYOUTS.home.pieces, roomContext(preset));

  // The window's light (soft, no shadow: the engine's key light casts them), the floor lamp's warm pool with its
  // soft shadows, and a faint glow from the hall. No ceiling light: it only blew the ceiling out to white.
  const daylight = sunLight(g, preset, [0, 0, -3], 18, night ? 0.35 : 0.6);
  daylight.castShadow = false;
  if (lampsOn) {
    lampSpot(g, [-7, 6.15, -8.8], [3, -3.2, 4], { intensity: night ? 150 : 95 });
    lampLight(g, -7, 6.4, -8.6, night ? 16 : 9, "#ffc27a", 14);
  }
  lampLight(g, 9, 7, -11, night ? 3 : 5, "#fff2dc", 22);

  return {
    group: g,
    ...LAYOUTS.home,
    indoor: true,
    exposure: LIGHTS[preset].indoorExposure,
    fog: null,
  };
}

function bedroom(preset) {
  const g = new THREE.Group();
  const night = preset === "night";
  roomShell(g, {
    w: 26,
    d: 22,
    h: 10.5,
    floor: { material: surface(carpet("#c9b9a6", [1, 1]), 1.5, 1), tile: 6 },
    wall: { material: surface(plaster("#a9c8e8"), 0.5), tile: 6 },
  });
  buildPieces(g, LAYOUTS.bedroom.pieces, roomContext(preset));

  // The window's light (no shadow: the engine's key light casts them), the bedside lamp's warm pool with soft
  // shadows in the evening and at night, a faint glow from the hall. No ceiling light.
  const daylight = sunLight(g, preset, [0, 0, -3], 16, night ? 0.3 : 0.6);
  daylight.castShadow = false;
  if (preset !== "day") {
    lampSpot(g, [-1.8, 3.4, -9.1], [1.8, -2.6, 4], { intensity: night ? 110 : 70 });
    lampLight(g, -1.8, 3.5, -8.9, night ? 10 : 6, "#ffc27a", 10);
    // The desk lamp.
    lampLight(g, 9.4, 3.6, -7.8, night ? 6 : 3, "#ffd59a", 8);
  }
  lampLight(g, 10, 7, 8, night ? 2 : 4, "#fff2dc", 22);

  return {
    group: g,
    ...LAYOUTS.bedroom,
    indoor: true,
    exposure: LIGHTS[preset].indoorExposure,
    fog: null,
  };
}

function school(preset) {
  const g = new THREE.Group();
  const w = 17;
  const length = 70;
  const z0 = -45;
  // A matte floor: a shiny one mirrors the ceiling panels and glows white.
  const floor = mesh(
    tiledPlane(w, length, 4),
    surface(tiles("#d9dbe0", "#c6cbd4", [1, 1], 4), 0.8, 0.75),
    { cast: false },
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = z0 + length / 2;
  g.add(floor);
  const wallMaterial = surface(plaster("#e3e6ea"), 0.5);
  for (const side of [-1, 1]) {
    const wall = mesh(tiledPlane(length, 11, 6), wallMaterial, { cast: false });
    wall.position.set((side * w) / 2, 5.5, z0 + length / 2);
    wall.rotation.y = -side * (Math.PI / 2);
    g.add(wall);
    // A painted band along the wall, above the lockers.
    const band = mesh(new THREE.PlaneGeometry(length, 0.5), paint("#29366f", { roughness: 0.8 }), {
      cast: false,
    });
    band.position.set((side * w) / 2 - side * 0.01, 7, z0 + length / 2);
    band.rotation.y = -side * (Math.PI / 2);
    g.add(band);
  }
  for (const [z, ry] of [
    [z0, 0],
    [z0 + length, Math.PI],
  ]) {
    const end = mesh(tiledPlane(w, 11, 6), wallMaterial, { cast: false });
    end.position.set(0, 5.5, z);
    end.rotation.y = ry;
    g.add(end);
  }
  const ceiling = mesh(new THREE.PlaneGeometry(w, length), paint("#f4f4f4", { roughness: 1 }), {
    cast: false,
  });
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 11, z0 + length / 2);
  g.add(ceiling);
  ceilingPanels(
    g,
    [0],
    Array.from({ length: 10 }, (_, k) => z0 + 5 + k * 7),
    11,
  );
  buildPieces(g, LAYOUTS.school.pieces, roomContext(preset));

  // The ceiling panels light the hall: cool-white pools down its length (the three where stories happen cast soft
  // shadows), a soft fill from the floor and walls, and daylight from the far doors.
  const hemi = new THREE.HemisphereLight("#ffffff", "#9aa0ae", 0.35 * SCALE);
  g.add(hemi);
  for (const z of [-19, -12, -5, 2, 9, 16]) {
    lampSpot(g, [0, 10.7, z], [0, -10, 0.01], {
      color: "#eef4ff",
      intensity: preset === "night" ? 26 : 30,
      angle: 1.15,
      distance: 30,
      shadow: z >= -5 && z <= 9,
    });
  }
  if (preset !== "night") {
    const doorway = new THREE.DirectionalLight("#fff6e8", 0.5 * SCALE);
    doorway.position.set(0, 8, -60);
    doorway.target.position.set(0, 0, 0);
    g.add(doorway, doorway.target);
  }

  return {
    group: g,
    ...LAYOUTS.school,
    fog: { color: "#dfe3ea", near: 40, far: 90 },
    indoor: true,
    // A white hall: a little under the other rooms, so its floor and walls don't blow out.
    exposure: LIGHTS[preset].indoorExposure * 0.85,
    env: 0.2,
  };
}

function kitchen(preset) {
  const g = new THREE.Group();
  const night = preset === "night";
  const lampsOn = preset !== "day";
  roomShell(g, {
    w: 26,
    d: 22,
    h: 10.5,
    floor: { material: surface(tiles("#efe9df", "#c9c2b6", [1, 1], 4), 0.8, 0.6), tile: 4.4 },
    wall: { material: surface(plaster("#f1e6c8"), 0.5), tile: 6 },
  });
  buildPieces(g, LAYOUTS.kitchen.pieces, roomContext(preset));

  // The window over the sink by day; in the evening and at night the lamp over the table is the key light (warm,
  // with soft shadows) and the lights under the wall cabinets glow on the counters.
  const daylight = sunLight(g, preset, [0, 0, -3], 16, night ? 0.3 : 0.65);
  daylight.castShadow = false;
  if (lampsOn) {
    lampSpot(g, [0, 6.6, 1.5], [0, -6.6, 0.01], {
      intensity: night ? 160 : 95,
      angle: 1.2,
      distance: 30,
    });
    lampLight(g, -8, 5.4, -9.4, night ? 6 : 4, "#fff2d0", 9);
    lampLight(g, 2.6, 5.4, -9.4, night ? 6 : 4, "#fff2d0", 9);
  }
  lampLight(g, -10, 7, 8, night ? 2 : 4, "#fff2dc", 22);

  return {
    group: g,
    ...LAYOUTS.kitchen,
    indoor: true,
    exposure: LIGHTS[preset].indoorExposure,
    fog: null,
  };
}

function classroom(preset) {
  const g = new THREE.Group();
  const night = preset === "night";
  roomShell(g, {
    w: 30,
    d: 26,
    h: 11,
    floor: { material: surface(tiles("#d6dbe2", "#bfc6d0", [1, 1], 4), 0.8, 0.75), tile: 4 },
    wall: { material: surface(plaster("#e8efe3"), 0.5), tile: 6 },
  });
  ceilingPanels(g, [-6, 6], [-7, 0, 7], 11);
  buildPieces(g, LAYOUTS.classroom.pieces, roomContext(preset));

  // The ceiling panels light the room (the two over the front rows cast soft shadows), with daylight coming in at
  // the windows on the left.
  const hemi = new THREE.HemisphereLight("#ffffff", "#9aa0ae", 0.3 * SCALE);
  g.add(hemi);
  for (const [x, z] of [
    [-6, -7],
    [6, -7],
    [-6, 3],
    [6, 3],
  ]) {
    lampSpot(g, [x, 10.7, z], [0, -10, 0.01], {
      color: "#eef4ff",
      intensity: night ? 26 : 30,
      angle: 1.15,
      distance: 30,
      shadow: z < 0,
    });
  }
  if (!night) {
    const windows = new THREE.DirectionalLight(
      preset === "day" ? "#fff6e8" : "#ffb37a",
      0.6 * SCALE,
    );
    windows.position.set(-60, 26, 4);
    windows.target.position.set(0, 0, 0);
    g.add(windows, windows.target);
  }

  return {
    group: g,
    ...LAYOUTS.classroom,
    indoor: true,
    // A bright room: a little under the others, so the white board and the floor don't blow out.
    exposure: LIGHTS[preset].indoorExposure * 0.9,
    fog: null,
  };
}

function cafe(preset) {
  const g = new THREE.Group();
  const night = preset === "night";
  const lampsOn = preset !== "day";
  roomShell(g, {
    w: 28,
    d: 24,
    h: 11,
    floor: { material: surface(planks("#6b4a32", [1, 1], { count: 6 }), 1.2, 0.5), tile: 4 },
    wall: { material: surface(plaster("#efe2cf"), 0.5), tile: 6 },
  });
  buildPieces(g, LAYOUTS.cafe.pieces, roomContext(preset));

  // Daylight comes in at the big street windows on the left; in the evening and at night the lamps over the tables
  // light them warmly (the two nearest cast soft shadows), and the pastry case and the shelves glow a little.
  const daylight = sunLight(g, preset, [0, 0, -2], 16, night ? 0.3 : 0.6);
  daylight.castShadow = false;
  if (!night) {
    const street = new THREE.DirectionalLight(
      preset === "day" ? "#fff6e8" : "#ffb37a",
      0.6 * SCALE,
    );
    street.position.set(-60, 22, 2);
    street.target.position.set(0, 0, 0);
    g.add(street, street.target);
  }
  if (lampsOn) {
    for (const [x, z, shadow] of [
      [-7.5, -1.5, true],
      [-7.5, 5.5, false],
      [1.5, 5.5, true],
    ]) {
      lampSpot(g, [x, 6.6, z], [0, -6.6, 0.01], {
        intensity: night ? 110 : 65,
        angle: 1.1,
        distance: 24,
        shadow,
      });
    }
    lampLight(g, 6, 4.6, -5, night ? 5 : 3, "#fff2d0", 6);
  }
  lampLight(g, 3, 8, -8, night ? 6 : 4, "#ffe2b8", 16);
  lampLight(g, 0, 9, 8, night ? 2 : 3, "#fff2dc", 22);

  return {
    group: g,
    ...LAYOUTS.cafe,
    indoor: true,
    exposure: LIGHTS[preset].indoorExposure,
    fog: null,
  };
}

// ---------- Outdoors ----------

/** Painted lines on the road: a dashed yellow middle line and white edges, one mesh. */
function roadLines(length, halfWidth) {
  const g = new THREE.Group();
  const yellow = paint("#f4d35e", { roughness: 0.6 });
  const white = paint("#f2f2ee", { roughness: 0.6 });
  for (let x = -length / 2; x < length / 2; x += 6) {
    const dash = flat(3, 0.3, yellow);
    dash.position.set(x, 0.025, 0);
    g.add(dash);
  }
  for (const z of [-halfWidth + 0.6, halfWidth - 0.6]) {
    const edge = flat(length, 0.25, white);
    edge.position.set(0, 0.025, z);
    g.add(edge);
  }
  return freeze(g);
}

function town(preset) {
  const g = new THREE.Group();
  const lit = preset !== "day";
  const layout = LAYOUTS.town;
  g.add(
    flat(
      500,
      360,
      paint("#ffffff", { ...grass("#5aa04f", [110, 80]), roughness: 0.95, bumpScale: 1.5 }),
    ),
  );
  const road = flat(
    400,
    16,
    paint("#ffffff", { ...asphalt([50, 2]), roughness: 0.85, bumpScale: 1.2 }),
  );
  road.position.y = 0.012;
  g.add(road, roadLines(400, 8));
  // The pavements (concrete slabs, a step up) and their curbs.
  const slabs = paint("#ffffff", {
    ...concrete("#c9c7c2", [80, 1], 2),
    roughness: 0.9,
    bumpScale: 1,
  });
  const curb = paint("#d8d6d0", { roughness: 0.85 });
  for (const side of [-1, 1]) {
    const walk = mesh(new THREE.BoxGeometry(400, 0.3, 5), slabs);
    walk.position.set(0, 0.15, side * 10.5);
    const edge = mesh(new THREE.BoxGeometry(400, 0.34, 0.45), curb);
    edge.position.set(0, 0.17, side * 8.2);
    g.add(walk, edge);
  }
  buildPieces(g, layout.pieces, { lit });
  g.add(backdrop({ seed: "town", radius: 150 }));

  // The sun (or moon) is the key light with its shadows; once it's dark, the street lamps by the house cast warm
  // pools with soft shadows.
  sunLight(g, preset, [0, 0, -10], 28, 1, outdoorBoost(preset));
  if (lit) {
    for (const x of [-15, 15]) {
      lampSpot(g, [x, 11.6, -8.9], [0, -11, -1.2], {
        color: "#ffd9a0",
        intensity: preset === "night" ? 260 : 110,
        angle: 1.0,
        distance: 40,
        shadow: x === 15,
      });
    }
  }
  return {
    group: g,
    ...layout,
    fog: { color: horizonOf(preset), near: 80, far: 320 },
  };
}

function park(preset) {
  const g = new THREE.Group();
  const lit = preset !== "day";
  const layout = LAYOUTS.park;
  g.add(
    flat(
      320,
      320,
      paint("#ffffff", { ...grass("#63ad55", [70, 70]), roughness: 0.95, bumpScale: 1.5 }),
    ),
  );
  const walkway = flat(
    6,
    120,
    paint("#ffffff", { ...gravel("#d8c49a", [2, 30]), roughness: 0.95, bumpScale: 1.5 }),
  );
  walkway.position.set(2, 0.02, 0);
  walkway.rotation.z = 0.18;
  g.add(walkway);
  buildPieces(g, layout.pieces, { lit });
  g.add(backdrop({ seed: "park", radius: 110, center: [0, -6] }));

  sunLight(g, preset, [0, 0, -4], 26, 1, outdoorBoost(preset));
  if (lit) {
    for (const [x, z] of [
      [3.6, -12],
      [8.5, 12.5],
    ]) {
      lampSpot(g, [x, 9.9, z], [0, -9, 0.01], {
        color: "#ffd9a0",
        intensity: preset === "night" ? 160 : 70,
        angle: 1.1,
        distance: 30,
        shadow: z < 0,
      });
    }
  }
  return {
    group: g,
    ...layout,
    fog: { color: horizonOf(preset), near: 70, far: 260 },
  };
}

function backyard(preset) {
  const g = new THREE.Group();
  const lit = preset !== "day";
  const layout = LAYOUTS.backyard;
  g.add(
    flat(
      320,
      320,
      paint("#ffffff", { ...grass("#5fae52", [70, 70]), roughness: 0.95, bumpScale: 1.5 }),
    ),
  );
  buildPieces(g, layout.pieces, { lit });
  g.add(backdrop({ seed: "backyard", radius: 110 }));

  // The sun leads by day. In the evening and at night the lamp by the back door and the string lights over the deck
  // light the yard warmly.
  sunLight(g, preset, [0, 0, -4], 26, 1, outdoorBoost(preset));
  if (lit) {
    lampSpot(g, [1.4, 6.2, -18.4], [0, -6, 8], {
      color: "#ffcf8a",
      intensity: preset === "night" ? 90 : 45,
      angle: 1.15,
      distance: 34,
    });
    for (const [x, z] of [
      [-7, -12],
      [7, -12],
      [0, -10],
    ]) {
      lampLight(g, x, 7.6, z, preset === "night" ? 14 : 7, "#ffcf7a", 16);
    }
  }
  return {
    group: g,
    ...layout,
    fog: { color: horizonOf(preset), near: 70, far: 260 },
  };
}

// ---------- Snowy forest at night (northern lights, falling snow, a campfire) ----------

const AURORA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 0.035) * 18.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const AURORA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float x = vUv.x * 9.0;
    float wave = sin(x + uTime * 0.35) * 0.5 + sin(x * 2.3 - uTime * 0.6) * 0.3 + sin(x * 5.1 + uTime * 0.9) * 0.2;
    float curtain = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
    float rays = 0.6 + 0.4 * sin(vUv.x * 160.0 + wave * 6.0);
    float band = smoothstep(0.15, 0.95, 0.5 + 0.5 * wave);
    vec3 green = vec3(0.25, 1.0, 0.55);
    vec3 violet = vec3(0.62, 0.35, 1.0);
    vec3 color = mix(green, violet, smoothstep(0.2, 0.9, vUv.y + 0.25 * wave));
    gl_FragColor = vec4(color * curtain * band * rays * uStrength, 1.0);
  }
`;

function forest(preset) {
  const g = new THREE.Group();
  const night = preset !== "day";
  const snowTexture = canvasTexture(
    "snow",
    256,
    (ctx, s) => speckle(ctx, s, "#eef3ff", ["#c9d6f0", "#ffffff", "#b8c8e8"], "snow", 1400, 4),
    { repeat: [24, 24] },
  );
  const geometry = new THREE.PlaneGeometry(220, 220, 90, 90);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // The plane lies flat, so its y is the world -z: the clearing is around z = -4.
    const d = Math.hypot(x, y - 4);
    const bumps =
      Math.sin(x * 0.21) * Math.cos(y * 0.17) * 0.35 + Math.sin(x * 0.07 + y * 0.05) * 0.6;
    pos.setZ(i, d < 12 ? bumps * 0.15 : bumps);
  }
  geometry.computeVertexNormals();
  const snowGround = mesh(geometry, paint("#ffffff", { map: snowTexture, roughness: 0.95 }), {
    cast: false,
  });
  snowGround.rotation.x = -Math.PI / 2;
  g.add(snowGround);

  // Tall bare trunks (one instanced mesh) and a few snowy pines, leaving a clearing in the middle.
  const random = rng("forest");
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.42, 34, 7),
    paint("#2a2420", { roughness: 0.95 }),
    150,
  );
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let placed = 0;
  while (placed < 150) {
    const x = (random() - 0.5) * 150;
    const z = -95 + random() * 115;
    if (Math.hypot(x, z + 4) < 15 || (z > 8 && Math.abs(x) < 20)) continue;
    const s = 0.7 + random() * 0.8;
    q.setFromEuler(new THREE.Euler((random() - 0.5) * 0.08, 0, (random() - 0.5) * 0.08));
    m.compose(new THREE.Vector3(x, 16 * s, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(placed++, m);
  }
  g.add(trunks);
  buildPieces(g, LAYOUTS.forest.pieces, {
    lit: night,
    night: preset === "night",
    sky: LIGHTS[preset].windowSky,
  });

  // Where the cabin's chimney, window and lantern are (shapes.js cabinSpec, turned with the cabin).
  const cabinPiece = LAYOUTS.forest.pieces.find((piece) => piece.kind === "cabin");
  const cs = cabinSpec(cabinPiece);
  const onCabin = (lx, y, lz) => {
    const r = cabinPiece.rot ?? 0;
    return new THREE.Vector3(
      cabinPiece.x + lx * Math.cos(r) + lz * Math.sin(r),
      y,
      cabinPiece.z - lx * Math.sin(r) + lz * Math.cos(r),
    );
  };
  // Smoke from the chimney: soft puffs rising and drifting with the wind, placed from t alone.
  const chimney = onCabin(cs.chimney.x, cs.chimney.top + 0.3, cs.chimney.z);
  const puffTexture = canvasTexture("puff", 64, (ctx, size) => {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
  const smoke = new THREE.Group();
  smoke.userData.scenery = true;
  const puffs = Array.from({ length: 14 }, () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: puffTexture,
        color: night ? "#7d8496" : "#d8dde6",
        transparent: true,
        depthWrite: false,
      }),
    );
    smoke.add(sprite);
    return sprite;
  });
  g.add(smoke);

  // Northern lights.
  const aurora = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 70, 64, 1),
    new THREE.ShaderMaterial({
      vertexShader: AURORA_VERTEX,
      fragmentShader: AURORA_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uStrength: { value: night ? 0.9 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  aurora.position.set(0, 62, -150);
  aurora.rotation.x = 0.25;
  aurora.visible = night;
  g.add(aurora);

  // Falling snow: positions come from t only.
  const flakes = 1800;
  const seeds = new Float32Array(flakes * 4);
  for (let k = 0; k < flakes; k++) {
    seeds[k * 4] = (random() - 0.5) * 70;
    seeds[k * 4 + 1] = random() * 30;
    seeds[k * 4 + 2] = -45 + random() * 70;
    seeds[k * 4 + 3] = 0.8 + random() * 1.4;
  }
  const flakeGeometry = new THREE.BufferGeometry();
  flakeGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(flakes * 3), 3),
  );
  const dot = canvasTexture("flake", 64, (ctx, s) => {
    const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  });
  const snowfall = new THREE.Points(
    flakeGeometry,
    new THREE.PointsMaterial({
      size: 0.32,
      map: dot,
      transparent: true,
      depthWrite: false,
      color: "#ffffff",
    }),
  );
  snowfall.frustumCulled = false;
  g.add(snowfall);

  // At night the campfire is the key light, flickering, with soft shadows; the moon is a cool rim. By day the sun
  // leads at a normal exposure.
  sunLight(g, preset, [0, 0, -3], 22, night ? 0.8 : 1, outdoorBoost(preset));
  const fireLight = campfireLight(g, -4.5, 2.6, -2.5, night ? 95 : 30);
  if (night) {
    // The cabin's lit window and its porch lantern.
    const glowAt = onCabin(cs.windowX, 4.1, cs.d / 2 + 1.2);
    lampLight(g, glowAt.x, glowAt.y, glowAt.z, 25, "#ffb45e", 20);
    const lanternAt = onCabin(cs.doorX + 2.2, cs.porch.roofY - 1.4, cs.d / 2 + cs.porch.d - 0.8);
    lampLight(g, lanternAt.x, lanternAt.y, lanternAt.z, 10, "#ffb45e", 10);
  }

  return {
    group: g,
    ...LAYOUTS.forest,
    fog: { color: night ? "#0d1530" : "#dfe8f6", near: 30, far: 120 },
    update(t) {
      aurora.material.uniforms.uTime.value = t;
      // The campfire's flames (and anything else that moves by itself).
      for (const child of g.children) child.userData.update?.(t);
      puffs.forEach((puff, k) => {
        const phase = (t * 0.22 + k / puffs.length) % 1;
        puff.position.set(
          chimney.x + phase * 2.6 + Math.sin(t * 0.7 + k) * 0.3,
          chimney.y + phase * 8,
          chimney.z + phase * 0.8,
        );
        const size = 1 + phase * 3.2;
        puff.scale.set(size, size, 1);
        puff.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, phase * 1.15));
      });
      fireLight.intensity =
        (night ? 55 : 20) * (1 + 0.15 * Math.sin(t * 11) + 0.08 * Math.sin(t * 27));
      const p = flakeGeometry.attributes.position;
      for (let k = 0; k < flakes; k++) {
        const fall = seeds[k * 4 + 3];
        const y = (((seeds[k * 4 + 1] - fall * t) % 30) + 30) % 30;
        p.setXYZ(
          k,
          seeds[k * 4] + Math.sin(t * 0.8 + k) * 0.6,
          y,
          seeds[k * 4 + 2] + Math.cos(t * 0.6 + k * 1.3) * 0.4,
        );
      }
      p.needsUpdate = true;
    },
  };
}

const BUILDERS = {
  home,
  bedroom,
  kitchen,
  school,
  classroom,
  cafe,
  town,
  park,
  backyard,
  forest,
};

/** The names Claude can use for `place` in story.js. */
export const PLACE_NAMES = Object.keys(BUILDERS);

/** The light each place uses when a shot doesn't say. */
export const DEFAULT_LIGHT = {
  home: "evening",
  bedroom: "night",
  kitchen: "evening",
  school: "day",
  classroom: "day",
  cafe: "day",
  town: "day",
  park: "day",
  backyard: "day",
  forest: "night",
};

const cache = new Map();

export function getPlace(name, light) {
  const placeName = BUILDERS[name] ? name : "home";
  const preset = LIGHTS[light] ? light : DEFAULT_LIGHT[placeName];
  const key = `${placeName}|${preset}`;
  let place = cache.get(key);
  if (!place) {
    place = BUILDERS[placeName](preset);
    place.name = placeName;
    place.light = preset;
    place.update ??= () => {};
    place.exposure ??= place.indoor
      ? LIGHTS[preset].indoorExposure
      : LIGHTS[preset].outdoorExposure;
    place.env ??= LIGHTS[preset].env;
    place.group.visible = false;
    cache.set(key, place);
  }
  return place;
}
