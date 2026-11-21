// The places a story happens in. Each is built once per light ("day", "evening", "night") and cached.
// A place gives: the group, its layout (layouts.js: `spots` where characters stand, sit or lie, the furniture's
// footprints, the `wide` establishing shot, a `surface` for close-ups of small objects), fog, and `update(t)` for
// anything that moves.
import * as THREE from "three";
import { LAYOUTS } from "./layouts.js";
import {
  bed,
  bench,
  cabin,
  campfire,
  car,
  chair,
  door,
  floorLamp,
  glow,
  house,
  lockerTexture,
  nightstand,
  picture,
  pine,
  plant,
  rug,
  shelf,
  slide,
  sofa,
  streetLamp,
  swingSet,
  table,
  tableLamp,
  tree,
  tv,
  windowPane,
} from "./props.js";
import { block, canvasTexture, mesh, paint, rng, roundedBox, speckle } from "./util.js";

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

function ground(w, d, texture, { color = "#ffffff", roughness = 0.9 } = {}) {
  const m = mesh(new THREE.PlaneGeometry(w, d), paint(color, { map: texture, roughness }), {
    cast: false,
  });
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** A room: floor, four walls and a ceiling that only show from the inside (the camera can stand outside). */
function room(g, { w, d, h, floor, wall, ceiling = "#f2efe8" }) {
  g.add(ground(w, d, floor));
  const wallMaterial = paint(wall.color ?? "#ffffff", { map: wall.map ?? null, roughness: 0.92 });
  const walls = [
    [0, -d / 2, 0, w],
    [-w / 2, 0, Math.PI / 2, d],
    [w / 2, 0, -Math.PI / 2, d],
    [0, d / 2, Math.PI, w],
  ];
  for (const [x, z, ry, width] of walls) {
    const m = mesh(new THREE.PlaneGeometry(width, h), wallMaterial, { cast: false });
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    g.add(m);
    // Skirting board along the bottom.
    const board = mesh(roundedBox(width, 0.5, 0.2, 0.04), paint("#f4f1ea"), { cast: false });
    board.position.set(x + Math.sin(ry) * 0.1, 0.25, z + Math.cos(ry) * 0.1);
    board.rotation.y = ry;
    g.add(board);
  }
  const top = mesh(new THREE.PlaneGeometry(w, d), paint(ceiling, { roughness: 1 }), {
    cast: false,
  });
  top.rotation.x = Math.PI / 2;
  top.position.y = h;
  g.add(top);
}

const woodFloor = (tone = "#b07a4a") =>
  canvasTexture(
    `wood:${tone}`,
    512,
    (ctx, s) => {
      speckle(ctx, s, tone, ["#7a4f2c", "#c99464"], `wood${tone}`, 600, 2);
      const random = rng(`planks${tone}`);
      for (let row = 0; row < 8; row++) {
        const y = row * (s / 8);
        ctx.fillStyle = `rgba(0,0,0,${0.04 + random() * 0.08})`;
        ctx.fillRect(0, y, s, s / 8);
        ctx.fillStyle = "rgba(40,20,5,0.45)";
        ctx.fillRect(0, y, s, 3);
        const cut = random() * s;
        ctx.fillRect(cut, y, 3, s / 8);
      }
    },
    { repeat: [3, 3] },
  );

const plainWall = (color, seed) =>
  canvasTexture(
    `wall:${color}`,
    256,
    (ctx, s) => {
      // Very light speckles in the wall color: paint, not polka dots.
      const dark = new THREE.Color(color).multiplyScalar(0.9).getStyle();
      const light = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.25).getStyle();
      speckle(ctx, s, color, [dark, light], seed, 260, 2);
    },
    { repeat: [4, 2] },
  );

// ---------- Indoors ----------

function home(preset) {
  const g = new THREE.Group();
  const night = preset === "night";
  const lampsOn = preset !== "day";
  room(g, { w: 30, d: 26, h: 11, floor: woodFloor(), wall: { map: plainWall("#e9dcc4", "home") } });
  const homeRug = rug(13, 9, ["#b85c4a", "#f2d7a6"]);
  homeRug.position.z = -3;
  g.add(homeRug);

  const couch = sofa("#4f7f8a");
  couch.position.set(0, 0, -7.6);
  const coffee = table(5, 2.4, 1.35);
  coffee.position.set(0, 0, -3.3);
  const lamp = floorLamp(lampsOn);
  lamp.position.set(-7, 0, -9);
  const green = plant();
  green.position.set(6.6, 0, -9.3);
  const books = shelf();
  books.position.set(-12.2, 0, -3);
  books.rotation.y = Math.PI / 2;
  const screen = tv(night);
  screen.position.set(11.8, 0, -2);
  screen.rotation.y = -Math.PI / 2;
  const win = windowPane(6, 4.2, LIGHTS[preset].windowSky, night ? 0.45 : 0.85);
  win.position.set(-5.5, 4.2, -12.9);
  const art1 = picture(2.2, 1.6, "art1");
  art1.position.set(3, 5.6, -12.9);
  const art2 = picture(1.4, 1.8, "art2");
  art2.position.set(5.8, 5.4, -12.9);
  const entry = door();
  entry.position.set(9, 0, -12.85);
  g.add(couch, coffee, lamp, green, books, screen, win, art1, art2, entry);

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
  room(g, {
    w: 26,
    d: 22,
    h: 10.5,
    floor: canvasTexture(
      "carpet",
      256,
      (ctx, s) => speckle(ctx, s, "#c9b9a6", ["#a89480", "#e0d4c4"], "carpet", 1600, 2),
      { repeat: [4, 4] },
    ),
    wall: { map: plainWall("#a9c8e8", "bedroom") },
  });
  const bedroomRug = rug(8, 6, ["#f4c542", "#ef7d57"]);
  bedroomRug.position.set(2, 0.03, 1);
  g.add(bedroomRug);
  const bedroomBed = bed("#e46a6a");
  bedroomBed.position.set(-6, 0, -5.8);
  const stand = nightstand();
  stand.position.set(-1.8, 0, -9.2);
  const lamp = tableLamp(preset !== "day");
  lamp.position.set(-1.8, 2, -9.2);
  const win = windowPane(5, 4, LIGHTS[preset].windowSky, night ? 0.45 : 0.85);
  win.position.set(5, 4, -10.9);
  const desk = table(5, 2.4, 2.2, "#f4f1ea");
  desk.position.set(9.5, 0, -6);
  desk.rotation.y = -Math.PI / 2;
  const deskChair = chair("#3b5dc9");
  deskChair.position.set(7.4, 0, -6);
  deskChair.rotation.y = -Math.PI / 2;
  const poster1 = picture(2.4, 3.2, "poster1");
  poster1.position.set(-6, 5.6, -10.9);
  const poster2 = picture(2, 2, "poster2");
  poster2.position.set(12.9, 5, -2);
  poster2.rotation.y = -Math.PI / 2;
  const toys = block(1.6, 1.6, 1.6, "#3b5dc9", 7, 0, 3, { radius: 0.2 });
  g.add(bedroomBed, stand, lamp, win, desk, deskChair, poster1, poster2, toys);

  // The window's light (no shadow: the engine's key light casts them), the bedside lamp's warm pool with soft
  // shadows in the evening and at night, a faint glow from the hall. No ceiling light.
  const daylight = sunLight(g, preset, [0, 0, -3], 16, night ? 0.3 : 0.6);
  daylight.castShadow = false;
  if (preset !== "day") {
    lampSpot(g, [-1.8, 3.4, -9.1], [1.8, -2.6, 4], { intensity: night ? 110 : 70 });
    lampLight(g, -1.8, 3.5, -8.9, night ? 10 : 6, "#ffc27a", 10);
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
  const tiles = canvasTexture(
    "tiles",
    256,
    (ctx, s) => {
      speckle(ctx, s, "#d9dbe0", ["#b8bcc6", "#f2f3f6", "#9aa0ae"], "marble", 1400, 3);
      ctx.fillStyle = "rgba(90,96,110,0.35)";
      ctx.fillRect(0, 0, s, 3);
      ctx.fillRect(0, 0, 3, s);
    },
    { repeat: [6, 24] },
  );
  // A matte floor: a shiny one mirrors the ceiling panels and glows white.
  const floor = ground(w, length, tiles, { roughness: 0.75 });
  floor.position.z = z0 + length / 2;
  g.add(floor);
  const wallMaterial = paint("#e3e6ea", { roughness: 0.9 });
  for (const side of [-1, 1]) {
    const wall = mesh(new THREE.PlaneGeometry(length, 11), wallMaterial, { cast: false });
    wall.position.set((side * w) / 2, 5.5, z0 + length / 2);
    wall.rotation.y = -side * (Math.PI / 2);
    g.add(wall);
  }
  const end = mesh(new THREE.PlaneGeometry(w, 11), wallMaterial, { cast: false });
  end.position.set(0, 5.5, z0);
  g.add(end);
  const back = mesh(new THREE.PlaneGeometry(w, 11), wallMaterial, { cast: false });
  back.position.set(0, 5.5, z0 + length);
  back.rotation.y = Math.PI;
  g.add(back);
  const ceiling = mesh(new THREE.PlaneGeometry(w, length), paint("#f4f4f4", { roughness: 1 }), {
    cast: false,
  });
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 11, z0 + length / 2);
  g.add(ceiling);
  for (let z = z0 + 5; z < z0 + length; z += 7) {
    const panel = mesh(roundedBox(3.2, 0.15, 1.2, 0.05), glow("#ffffff", 1.3), { cast: false });
    panel.position.set(0, 10.9, z);
    g.add(panel);
  }

  // Lockers along both walls: one instanced mesh.
  const lockerGeometry = roundedBox(1.9, 6.6, 1.5, 0.08);
  const lockerMaterial = paint("#ffffff", {
    map: lockerTexture(),
    roughness: 0.45,
    metalness: 0.15,
  });
  const count = 2 * 30;
  const lockers = new THREE.InstancedMesh(lockerGeometry, lockerMaterial, count);
  lockers.castShadow = true;
  lockers.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let i = 0;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 30; k++) {
      const z = z0 + 3 + k * 2.0 + (k > 14 ? 4 : 0);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -side * (Math.PI / 2));
      m.compose(new THREE.Vector3(side * (w / 2 - 0.78), 3.3, z), q, new THREE.Vector3(1, 1, 1));
      lockers.setMatrixAt(i++, m);
    }
  }
  g.add(lockers);
  const doors = door("#5a6a8a");
  doors.position.set(-1.7, 0, z0 + 0.2);
  const doors2 = door("#5a6a8a");
  doors2.position.set(1.7, 0, z0 + 0.2);
  const sign = picture(3, 1.6, "schoolsign");
  sign.position.set(-w / 2 + 0.1, 6.4, z0 + 33);
  sign.rotation.y = Math.PI / 2;
  g.add(doors, doors2, sign);

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

// ---------- Outdoors ----------

function sky(preset) {
  return { day: "#cfe6ff", evening: "#f0a27a", night: "#141d3f" }[preset];
}

function town(preset) {
  const g = new THREE.Group();
  const lit = preset !== "day";
  const grass = canvasTexture(
    "grassTown",
    256,
    (ctx, s) => speckle(ctx, s, "#5aa04f", ["#3f8a3e", "#79b863"], "gt", 1800, 3),
    { repeat: [30, 20] },
  );
  const lawn = ground(200, 140, grass);
  lawn.position.y = -0.02;
  g.add(lawn);
  const asphalt = canvasTexture(
    "road",
    512,
    (ctx, s) => {
      speckle(ctx, s, "#4a4d55", ["#3a3c42", "#5e616a"], "asphalt", 2600, 2);
      ctx.fillStyle = "#f4d35e";
      for (let x = 0; x < s; x += 128) ctx.fillRect(x + 20, s / 2 - 6, 70, 12);
    },
    { repeat: [20, 1] },
  );
  const road = ground(200, 9, asphalt, { roughness: 0.8 });
  road.position.y = 0.01;
  g.add(road);
  const pavement = canvasTexture(
    "pavement",
    256,
    (ctx, s) => {
      speckle(ctx, s, "#c4c4c8", ["#a8a8ae", "#dadade"], "pv", 900, 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, 4, s);
    },
    { repeat: [50, 1] },
  );
  for (const z of [-6.5, 6.5]) {
    const walk = mesh(
      new THREE.BoxGeometry(200, 0.3, 4),
      paint("#ffffff", { map: pavement, roughness: 0.85 }),
    );
    walk.position.set(0, 0.15, z);
    g.add(walk);
  }
  const random = rng("town");
  for (let k = -5; k <= 5; k++) {
    const h = house(`h${k}`, lit);
    h.position.set(k * 15 + (random() - 0.5) * 2, 0, -15);
    g.add(h);
    const t = tree(`t${k}`, 0.9 + random() * 0.3);
    t.position.set(k * 15 + 7.5, 0, -10.5);
    g.add(t);
    if (k % 2 === 0) {
      const back = house(`hb${k}`, lit);
      back.position.set(k * 15 + 5, 0, 44);
      back.rotation.y = Math.PI;
      g.add(back);
    }
  }
  for (let k = -3; k <= 3; k++) {
    const lamp = streetLamp(lit);
    lamp.position.set(k * 15 - 2.5, 0.3, -8);
    g.add(lamp);
  }
  const parked = car("#3b5dc9");
  parked.position.set(11, 0, -2.4);
  const parked2 = car("#e8344e");
  parked2.position.set(-16, 0, 2.4);
  parked2.rotation.y = Math.PI;
  g.add(parked, parked2);

  // The sun (or moon) is the key light with its shadows; once it's dark, the street lamps near the middle cast warm
  // pools with soft shadows.
  sunLight(g, preset, [0, 0, 0], 24, 1, outdoorBoost(preset));
  if (lit) {
    for (const x of [-1.3, 13.7, -16.3]) {
      lampSpot(g, [x, 7.1, -8], [0.2, -7, 2.2], {
        color: "#ffd9a0",
        intensity: preset === "night" ? 170 : 70,
        angle: 1.05,
        distance: 34,
        shadow: x === -1.3,
      });
    }
  }

  return {
    group: g,
    ...LAYOUTS.town,
    fog: { color: sky(preset), near: 60, far: 160 },
  };
}

function park(preset) {
  const g = new THREE.Group();
  const grass = canvasTexture(
    "grassPark",
    256,
    (ctx, s) => speckle(ctx, s, "#63ad55", ["#4b9545", "#8acb6c", "#a7d77f"], "gp", 2000, 3),
    { repeat: [24, 24] },
  );
  g.add(ground(200, 200, grass));
  const path = canvasTexture(
    "path",
    256,
    (ctx, s) => speckle(ctx, s, "#d8c49a", ["#bfa97c", "#ead9b4"], "path", 1600, 2),
    { repeat: [2, 20] },
  );
  const walkway = ground(6, 120, path);
  walkway.position.set(2, 0.02, 0);
  walkway.rotation.z = 0.18;
  g.add(walkway);
  const playSlide = slide();
  playSlide.position.set(-9, 0, -11);
  playSlide.rotation.y = 0.5;
  const swings = swingSet();
  swings.position.set(9, 0, -14);
  swings.rotation.y = -0.2;
  const seat = bench();
  seat.position.set(9, 0, -3);
  seat.rotation.y = -0.9;
  const sand = block(8, 0.4, 6, "#e8d29a", -10, 0, -3, { radius: 0.15, roughness: 1 });
  g.add(playSlide, swings, seat, sand);
  const random = rng("park");
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + random() * 0.3;
    const r = 26 + random() * 14;
    const t = tree(`pt${k}`, 1 + random() * 0.4);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 6);
    g.add(t);
  }
  for (let k = 0; k < 24; k++) {
    const flower = block(
      0.4,
      0.5,
      0.4,
      ["#e8344e", "#f4c542", "#ffffff", "#e86a8a"][k % 4],
      -14 + random() * 28,
      0,
      -16 + random() * 8,
      { radius: 0.12 },
    );
    g.add(flower);
  }
  for (let k = 0; k < 3; k++) {
    const hill = mesh(new THREE.SphereGeometry(40, 24, 12), paint("#5c9c55", { roughness: 1 }), {
      cast: false,
    });
    hill.scale.set(1.6, 0.35, 1);
    hill.position.set(-70 + k * 70, -4, -110);
    g.add(hill);
  }

  sunLight(g, preset, [0, 0, -4], 24, 1, outdoorBoost(preset));

  return {
    group: g,
    ...LAYOUTS.park,
    fog: { color: sky(preset), near: 70, far: 200 },
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
  for (let k = 0; k < 14; k++) {
    const a = random() * Math.PI * 2;
    const r = 17 + random() * 30;
    const p = pine(`fp${k}`, 1.4 + random() * 0.8, true);
    p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 10);
    if (p.position.z > 10) continue;
    g.add(p);
  }
  const hut = cabin(night);
  hut.position.set(9, 0, -17);
  hut.rotation.y = -0.4;
  const fire = campfire();
  fire.position.set(-4.5, 0, -2.5);
  g.add(hut, fire);
  for (let k = 0; k < 2; k++) {
    const log = block(4, 0.9, 1, "#5a3a24", -4.5 + (k ? 3 : -3.2), 0, -2.5 + (k ? 1.6 : -1), {
      radius: 0.35,
    });
    log.rotation.y = k ? -0.9 : 0.7;
    g.add(log);
  }

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
  if (night) lampLight(g, 6.5, 3.5, -12.5, 25, "#ffb45e", 20);

  return {
    group: g,
    ...LAYOUTS.forest,
    fog: { color: night ? "#0d1530" : "#dfe8f6", near: 30, far: 120 },
    update(t) {
      aurora.material.uniforms.uTime.value = t;
      fire.userData.update(t);
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

const BUILDERS = { home, bedroom, school, town, park, forest };

/** The names Claude can use for `place` in story.js. */
export const PLACE_NAMES = Object.keys(BUILDERS);

/** The light each place uses when a shot doesn't say. */
export const DEFAULT_LIGHT = {
  home: "evening",
  bedroom: "night",
  school: "day",
  town: "day",
  park: "day",
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
