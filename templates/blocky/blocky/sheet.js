// Sheets: every character, pose, face, prop and place on one picture, with checks. They show at a glance what a
// film will look like, and catch mistakes before they reach a film: an object at the wrong size, a joint pushed
// past its limit, a part that comes off the body, a door too small for the figures.
// The effects sheet shows every effect at its peak, and checks the story's effects. The moves sheet shows the gaits
// and sitting down and standing up, checks that feet don't slide, and checks the story's walks.
// sheet.html?sheet=cast|poses|faces|props|places|effects|moves&place=home&who=milo (see sheet.html).
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { getUpPose, jumpPose, pickUpPose, punchPose, throwPose } from "./animation.js";
import { BLOCKY_CAST } from "./cast.js";
import { makeCharacter } from "./characters.js";
import { fitInRoom } from "./engine.js";
import { EXPRESSIONS } from "./faces.js";
import { figureAt } from "./figure.js";
import {
  actorState,
  cameraState,
  drawEffects,
  FX,
  FX_NAMES,
  FX_SOUNDS,
  normalizeFx,
  planEffects,
} from "./fx.js";
import { layoutOf, solidsOf } from "./layouts.js";
import { composePose, GRAVITY, insideBlock, personState, planMotion, poseFor } from "./motion.js";
import { loadPhysics } from "./physics.js";
import { DEFAULT_LIGHT, getPlace, PLACE_NAMES } from "./places.js";
import {
  GAIT_NAMES,
  GAITS,
  gaitPose,
  POSE_NAMES,
  poseAt,
  SEAT_REACH,
  seatBack,
  sitDownPose,
} from "./poses.js";
import { PROP_NAMES, PROPS, table } from "./props.js";
import { aimArm } from "./rig.js";
import { NO_PHYSICS } from "./shapes.js";
import { simulate, thingSpots } from "./simulation.js";
import {
  fitSize,
  longestSide,
  measure,
  meters,
  SEAT_HEIGHT,
  SIZES,
  sizeWords,
  UNITS_PER_METER,
  WORLD,
} from "./sizes.js";
import { makeSky } from "./sky.js";
import { plainWord, planStory, sayWords } from "./timing.js";
import { loadVoices } from "./voice.js";

export const SHEETS = ["cast", "poses", "faces", "props", "places", "effects", "moves"];

/** How far a foot on the ground may slide, in units (2 cm). */
const SLIDE_LIMIT = meters(0.02);

/** A small room for the moves sheet: a seat to walk to, sit on and get up from. */
const MOVES_ROOM = {
  spots: {
    start: { x: 0, z: 3.4, rot: Math.PI },
    seat: { x: 0, z: -1.2, rot: 0, seat: SEAT_HEIGHT },
    side: { x: 5, z: 0.6, rot: -1.1 },
  },
  seats: ["seat"],
  beds: [],
  blocks: [{ name: "the seat", x: 0, z: -1.55, w: 2.2, d: 2 }],
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
  wide: { pos: [0, 6, 14], target: [0, 2, 0] },
};
const MOVES_WORDS = "one two three four five six seven eight nine ten eleven twelve";

/** Each effect on the effects sheet: its shot's `fx`, the moment shown, and the face that goes with it. */
const EFFECT_SAMPLES = [
  [{ notes: true }, 1.1, "happy"],
  [{ sparkles: true }, 0.7, "grin"],
  [{ hearts: true }, 0.9, "love"],
  [{ tears: true }, 0.7, "crying"],
  [{ sweat: true }, 0.5, "scared"],
  [{ anger: true }, 0.4, "furious"],
  [{ zzz: true }, 0.8, "sleepy"],
  [{ dust: true }, 0.3, "neutral"],
  [{ magic: true, appear: true }, 0.62, "shocked"],
  [{ confetti: true }, 1.0, "laugh"],
  [{ label: true, text: "575 days", count: true }, 1.2, "neutral"],
  [{ float: "Augustus" }, 0.7, "grin"],
  [{ big: "THREE TIMES" }, 0.4, "shocked"],
  [{ punch: true }, 0.4, "shocked"],
  [{ shake: true }, 0.1, "scared"],
  [{ flash: true }, 0.08, "shocked"],
  [{ bounce: true }, 0.2, "happy"],
  [{ jump: true }, 0.45, "happy"],
  [{ dash: true }, 0.12, "grin"],
];
const W = 1920;
const H = 1080;
const LABEL_H = 30;
const ANGLES = [
  ["front", 0],
  ["three-quarter", -0.7],
  ["side", -Math.PI / 2],
  ["back", Math.PI],
];
/** Times in a pose (seconds) where the checks look. */
const CHECK_TIMES = [0, 0.2, 0.45, 0.7, 1.0, 1.4];

/** The grid's cells, row by row, in pixels (y from the top). */
function cells(count, cols) {
  const rows = Math.max(1, Math.ceil(count / cols));
  const w = Math.floor(W / cols);
  const h = Math.floor(H / rows);
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * w,
    y: Math.floor(i / cols) * h,
    w,
    h,
  }));
}

/** Aims `camera` at a box of `height` units standing on the ground, from `angle` (radians around y). */
function frameStanding(camera, aspect, center, height, angle, closeness = 1.12, elevation = 0.18) {
  camera.fov = 26;
  camera.aspect = aspect;
  const half = (camera.fov * Math.PI) / 360;
  const fit = Math.max(height, (height * 0.85) / aspect);
  const distance = ((fit * closeness) / 2 / Math.tan(half)) * 1.05;
  const target = new THREE.Vector3(center.x, center.y + height / 2, center.z);
  camera.position.set(
    target.x + Math.sin(angle) * distance,
    target.y + distance * elevation,
    target.z + Math.cos(angle) * distance,
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/** Do two parts of a figure touch (their boxes overlap, with a little room)? */
function touching(a, b, room = 0.08) {
  const boxA = new THREE.Box3();
  for (const part of a) boxA.expandByObject(part);
  const boxB = new THREE.Box3();
  for (const part of b) boxB.expandByObject(part);
  return boxA.expandByScalar(room).intersectsBox(boxB);
}

const JOINT_WORDS = {
  neck: "the head",
  waist: "the chest",
  shoulderL: "the left arm",
  shoulderR: "the right arm",
  elbowL: "the left forearm",
  elbowR: "the right forearm",
  wristL: "the left hand",
  wristR: "the right hand",
  hipL: "the left leg",
  hipR: "the right leg",
  kneeL: "the left shin",
  kneeR: "the right shin",
  ankleL: "the left foot",
  ankleR: "the right foot",
};

export function createSheet({ story, params }) {
  const sheet = SHEETS.includes(params.get("sheet")) ? params.get("sheet") : "cast";
  const cast = { ...BLOCKY_CAST, ...(story?.CAST ?? {}) };
  const ids = Object.keys(cast);
  const who = cast[params.get("who")] ? params.get("who") : ids[0];
  const placeName = params.get("place") ?? "home";
  // The moves sheet checks the story's walks with the film's voices and shape.
  let voiceLines = [];
  let filmAspect = 16 / 9;
  /** The physics, once loaded (the moves sheet runs the story's physics for its checks). */
  let createWorld = null;
  /** Problems found, in plain words (the same problem found several times is counted). */
  const checks = [];
  const found = new Map();
  const report = (text) => found.set(text, (found.get(text) ?? 0) + 1);
  /** Cells with a problem get a red frame. */
  const bad = new Set();

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = "sheet-3d";
  document.body.appendChild(renderer.domElement);
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  layer.className = "sheet-2d";
  document.body.appendChild(layer);
  const ctx = layer.getContext("2d");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 900);

  // A plain studio for the cast, poses, faces and props: a soft floor, a key light and a fill.
  const studio = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshStandardMaterial({ color: "#d9dde4", roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(6, 14, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  const fill = new THREE.HemisphereLight("#eef3ff", "#8a8070", 1.1);
  studio.add(floor, key, key.target, fill);

  // Everything a sheet adds goes in `content`, made again for every drawing.
  let content = new THREE.Group();
  scene.add(content);
  const add = (...objects) => content.add(...objects);

  const actors = new Map();
  function actor(id) {
    let a = actors.get(id);
    if (!a) {
      a = makeCharacter(cast[id]);
      actors.set(id, a);
    }
    a.root.visible = true;
    a.root.position.set(0, 0, 0);
    a.root.rotation.set(0, 0, 0);
    add(a.root);
    return a;
  }

  const items = [];
  const label = (cell, text, problem = false) => items.push({ cell, text, problem });
  /** 2D drawings on top of the cells (the effects sheet), drawn with the labels. */
  const overlays = [];

  function draw(cell, place = null) {
    const y = H - cell.y - cell.h;
    renderer.setViewport(cell.x, y + LABEL_H, cell.w, cell.h - LABEL_H);
    renderer.setScissor(cell.x, y + LABEL_H, cell.w, cell.h - LABEL_H);
    renderer.setScissorTest(true);
    if (place) {
      renderer.toneMappingExposure = place.exposure;
      scene.environmentIntensity = place.env;
    } else {
      renderer.toneMappingExposure = 1.1;
      scene.environmentIntensity = 0.35;
    }
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
  }

  // ---------- The sheets ----------

  function castSheet() {
    add(studio);
    scene.background = new THREE.Color("#c9ced8");
    const list = cells(ids.length * ANGLES.length, ids.length);
    ids.forEach((id, c) => {
      const a = actor(id);
      ANGLES.forEach(([name, angle], r) => {
        const cell = list[r * ids.length + c];
        for (const other of actors.values()) other.root.visible = false;
        a.root.visible = true;
        a.root.position.set(0, 0, 0);
        a.root.rotation.set(0, -angle, 0);
        a.apply(poseAt("idle", 0.4, 0));
        a.face("neutral", { blink: false, talk: 0 });
        frameStanding(camera, cell.w / (cell.h - LABEL_H), a.root.position, 5.5 * a.size, 0);
        draw(cell);
        label(cell, `${cast[id].name ?? id} · ${name}`);
      });
    });
  }

  function posesSheet() {
    add(studio);
    scene.background = new THREE.Color("#c9ced8");
    const a = actor(who);
    a.root.visible = true;
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, SEAT_HEIGHT, 2),
      new THREE.MeshStandardMaterial({ color: "#8b5a35", roughness: 0.6 }),
    );
    seat.castShadow = true;
    seat.receiveShadow = true;
    seat.position.set(0, SEAT_HEIGHT / 2, -0.35);
    add(seat);
    const list = cells(POSE_NAMES.length, 6);
    POSE_NAMES.forEach((name, i) => {
      // Checks: every joint within its range and every part still on the body, through the pose.
      const reported = new Set();
      for (const u of CHECK_TIMES) {
        const pose = poseAt(name, u, 0);
        const over = a.apply(pose);
        for (const o of over) {
          const text = `${name}: ${o.key} asks ${o.value.toFixed(2)}, past the joint's limit (${o.min} to ${o.max}).`;
          if (!reported.has(text)) {
            reported.add(text);
            report(text);
            bad.add(i);
          }
        }
        a.root.updateMatrixWorld(true);
        for (const link of a.links) {
          if (touching(link.parent, link.child)) continue;
          const text = `${name}: ${JOINT_WORDS[link.joint] ?? link.joint} comes off the body.`;
          if (!reported.has(text)) {
            reported.add(text);
            report(text);
            bad.add(i);
          }
        }
      }
      // The picture: mid-move, three-quarter view, sitting poses on a seat at knee height.
      const cell = list[i];
      const pose = poseAt(name, 0.6, 0);
      const sitting = name.startsWith("sit");
      const lying = ["lie", "sleep", "faint"].includes(name);
      seat.visible = sitting;
      if (sitting) pose.bodyY = (pose.bodyY ?? 0) + SEAT_HEIGHT / a.size - 1.5;
      if (lying) pose.bodyY = (pose.bodyY ?? 0) + 0.5;
      a.root.rotation.set(0, 0.6, 0);
      a.apply(pose);
      a.face(name === "cry" ? "crying" : name === "laugh" ? "laugh" : "neutral", {
        blink: false,
        talk: 0,
      });
      frameStanding(camera, cell.w / (cell.h - LABEL_H), a.root.position, 5.6 * a.size, -0.25);
      draw(cell);
      label(cell, name, bad.has(i));
    });
    seat.visible = false;
  }

  function facesSheet() {
    add(studio);
    scene.background = new THREE.Color("#c9ced8");
    const a = actor(who);
    a.root.visible = true;
    a.root.rotation.set(0, 0, 0);
    a.apply(poseAt("idle", 0, 0));
    a.root.updateMatrixWorld(true);
    const head = a.headWorld(new THREE.Vector3());
    const names = Object.keys(EXPRESSIONS);
    const list = cells(names.length, 6);
    names.forEach((name, i) => {
      const cell = list[i];
      a.face(name, { blink: false, talk: 0 });
      camera.fov = 22;
      camera.aspect = cell.w / (cell.h - LABEL_H);
      camera.position.set(head.x, head.y + 0.2, head.z + 6.2 * a.size);
      camera.lookAt(head.x, head.y, head.z);
      camera.updateProjectionMatrix();
      draw(cell);
      label(cell, name);
    });
  }

  function propsSheet() {
    add(studio);
    scene.background = new THREE.Color("#c9ced8");
    // Each object at its real size on a tabletop, with a 10 cm ruler beside it.
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(meters(1.2), 0.1, meters(0.8)),
      new THREE.MeshStandardMaterial({ color: "#b98a5e", roughness: 0.6 }),
    );
    top.receiveShadow = true;
    top.position.y = -0.05;
    const ruler = new THREE.Group();
    for (let cm = 0; cm < 10; cm++) {
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(meters(0.01), meters(0.003), meters(0.012)),
        new THREE.MeshStandardMaterial({ color: cm % 2 ? "#1a1c2c" : "#f4f4f4" }),
      );
      tick.position.set(meters(0.005 + cm * 0.01), meters(0.0015), 0);
      ruler.add(tick);
    }
    add(top, ruler);
    const names = [...PROP_NAMES];
    const list = cells(names.length + 1, 5);
    names.forEach((name, i) => {
      const cell = list[i];
      const real = SIZES[name];
      const p = fitSize(PROPS[name](), real ?? 0);
      add(p);
      const measured = longestSide(p) / UNITS_PER_METER;
      if (!real) {
        report(
          `${name} has no real size in sizes.js: it shows at the size it was built (${sizeWords(measured)}).`,
        );
        bad.add(i);
      } else if (Math.abs(measured - real) > real * 0.15) {
        report(`${name} is ${sizeWords(measured)}, but should be ${sizeWords(real)}.`);
        bad.add(i);
      }
      const span = Math.max(meters(0.3), longestSide(p) * 2.2);
      const box = new THREE.Box3().setFromObject(p);
      const center = box.getCenter(new THREE.Vector3());
      ruler.position.set(center.x - meters(0.05), 0, box.max.z + meters(0.03));
      camera.fov = 26;
      camera.aspect = cell.w / (cell.h - LABEL_H);
      const distance =
        span / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
      camera.position.set(
        center.x + distance * 0.35,
        center.y + distance * 0.55,
        center.z + distance,
      );
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      draw(cell);
      content.remove(p);
      label(cell, `${name} · ${real ? sizeWords(real) : "no size"}`, bad.has(i));
    });
    // The line-up: a figure by a desk, with every object on it, all at real size.
    content.remove(top, ruler);
    const cell = list[names.length];
    const desk = table(meters(1.6), meters(0.6), meters(0.75));
    desk.position.set(meters(0.9), 0, 0);
    add(desk);
    let x = meters(0.2);
    for (const name of names) {
      const p = fitSize(PROPS[name](), SIZES[name] ?? 0);
      const size = measure(p);
      p.position.set(x + size.x / 2, meters(0.75), 0);
      x += size.x + meters(0.03);
      add(p);
    }
    const a = actor(who);
    a.root.visible = true;
    a.root.position.set(-meters(0.4), 0, 0);
    a.root.rotation.set(0, 0.5, 0);
    a.apply(poseAt("idle", 0, 0));
    a.face("happy", { blink: false, talk: 0 });
    frameStanding(
      camera,
      cell.w / (cell.h - LABEL_H),
      new THREE.Vector3(meters(0.4), 0, 0),
      6,
      -0.3,
    );
    draw(cell);
    label(cell, `all together, with ${cast[who].name ?? who}`);
  }

  function placesSheet() {
    if (!PLACE_NAMES.includes(placeName)) {
      report(`There's no place called "${placeName}": the places are ${PLACE_NAMES.join(", ")}.`);
      bad.add(0);
    }
    const sky = makeSky();
    add(sky.group);
    const lights = ["day", "evening", "night"];
    const list = cells(lights.length * 4, 4);
    const a = actor(who);
    lights.forEach((light, r) => {
      const place = getPlace(placeName, light);
      for (const other of content.children) {
        if (other.userData.place) other.visible = false;
      }
      add(place.group);
      place.group.userData.place = true;
      place.group.visible = true;
      place.update(0);
      sky.set(place.light);
      scene.background = null;
      scene.fog = place.fog ? new THREE.Fog(place.fog.color, place.fog.near, place.fog.far) : null;
      // A figure in the middle shows the scale.
      const center = place.spots.center;
      a.root.visible = true;
      a.root.position.set(center.x, center.y ?? 0, center.z);
      a.root.rotation.set(0, center.rot, 0);
      a.apply(poseAt("idle", 0, 0));
      a.face("neutral", { blink: false, talk: 0 });
      if (r === 0) checkPlace(place);
      const target = new THREE.Vector3(...place.wide.target);
      const from = new THREE.Vector3(...place.wide.pos).sub(target);
      const views = [
        ["wide", from.clone()],
        ["left", from.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9)],
        ["right", from.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9)],
        [
          "from above",
          from
            .clone()
            .multiplyScalar(0.8)
            .setY(from.y * 2.4),
        ],
      ];
      views.forEach(([name, offset], c) => {
        const cell = list[r * 4 + c];
        // Where a film's camera would stand: inside the room, out of the furniture (as the engine does).
        const view = fitInRoom(
          { position: target.clone().add(offset), target, fov: 40, focus: offset.length() },
          layoutOf(placeName),
        );
        camera.fov = view.fov;
        camera.aspect = cell.w / (cell.h - LABEL_H);
        camera.position.copy(view.position);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        draw(cell, place);
        label(cell, `${placeName} · ${light} · ${name}`, r === 0 && c === 0 && bad.has(0));
      });
    });
  }

  /** Doors, tables and seats against the size chart and the figures. */
  /**
   * The place's physics against what's built (layouts.js `solids`): every piece of furniture where people go is
   * covered by physics shapes (most of its points inside one), and every shape stands on something built (no
   * invisible walls).
   */
  function checkPhysics(place) {
    const layout = layoutOf(place.name);
    const solids = solidsOf(layout);
    if (!solids.length) return;
    place.group.updateMatrixWorld(true);
    const bounds = layout.bounds ?? { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    const walls = layout.walls;
    const insideSolid = (p, grow) =>
      solids.some((b) => {
        const c = Math.cos(b.rot ?? 0);
        const sn = Math.sin(b.rot ?? 0);
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        return (
          Math.abs(dx * c - dz * sn) <= b.w / 2 + grow &&
          Math.abs(dx * sn + dz * c) <= b.d / 2 + grow &&
          Math.abs(p.y - b.y) <= b.h / 2 + grow
        );
      });
    const nameAt = (x, z) =>
      (layout.blocks ?? []).find((b) => insideBlock(b, { x, z }, 0.6))?.name ??
      `a piece at x ${x.toFixed(1)}, z ${z.toFixed(1)}`;
    // The pieces: what stands in the place, near where people go (not the floor, walls, ceiling or rugs, not
    // what hangs on the walls, not the tiny decorations).
    const pieces = [];
    /** Everything built (an instanced piece counts one by one), for "the shape stands on something". */
    const built = [];
    const candidates = [];
    const tops = [];
    for (const piece of place.group.children) {
      // Far scenery (hills, tree lines) isn't furniture.
      if (piece.isLight || piece.isPoints || piece.userData.scenery) continue;
      // A piece built along the place (a fence down the street, string lights) is checked run by run.
      const along =
        piece.userData.piece && piece.userData.piece.x === undefined && piece.children.length > 1;
      if (along) tops.push(...piece.children);
      else tops.push(piece);
      // Things on walls and ceilings (windows, doors, boards, lights) have no physics on purpose: they only count
      // as something built.
      if (NO_PHYSICS.has(piece.userData.piece?.kind)) piece.userData.wallThing = true;
    }
    for (const piece of tops) {
      if (piece.isLight || piece.isPoints) continue;
      if (piece.isInstancedMesh) {
        if (!piece.geometry.boundingBox) piece.geometry.computeBoundingBox();
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < piece.count; i++) {
          piece.getMatrixAt(i, matrix);
          const box = piece.geometry.boundingBox
            .clone()
            .applyMatrix4(matrix)
            .applyMatrix4(piece.matrixWorld);
          candidates.push({ piece, box, instance: i });
        }
        continue;
      }
      const box = new THREE.Box3().setFromObject(piece);
      if (!box.isEmpty()) candidates.push({ piece, box });
    }
    for (const { piece, box, instance } of candidates) {
      const size = box.getSize(new THREE.Vector3());
      if (size.y < 0.3) continue;
      built.push(box);
      if (Math.max(size.x, size.z) > 30 || piece.userData.wallThing) continue;
      if (box.min.y > 2.5 || Math.max(size.x, size.z) < 0.6) continue;
      if (box.max.x < bounds.minX - 2 || box.min.x > bounds.maxX + 2) continue;
      if (box.max.z < bounds.minZ - 2 || box.min.z > bounds.maxZ + 2) continue;
      // Flat on a wall (a door, a skirting board).
      if (walls && Math.min(size.x, size.z) < 0.6) {
        const nearWall =
          box.min.x < walls.minX + 0.8 ||
          box.max.x > walls.maxX - 0.8 ||
          box.min.z < walls.minZ + 0.8 ||
          box.max.z > walls.maxZ - 0.8;
        if (nearWall) continue;
      }
      pieces.push({ piece, box, instance });
    }
    for (const { piece, box, instance } of pieces) {
      // Points of the piece's own meshes (or of its one instance), in the world.
      const points = [];
      const one = new THREE.Matrix4();
      if (instance !== undefined) piece.getMatrixAt(instance, one);
      piece.traverse((m) => {
        // Glowing parts (lamp shades, screens) don't need to collide.
        const glowing =
          (m.material?.emissive?.getHex?.() ?? 0) > 0 && m.material.emissiveIntensity > 0.5;
        if (!m.isMesh || glowing) return;
        const position = m.geometry.attributes.position;
        const step = Math.max(1, Math.floor(position.count / 60));
        const toWorld = m.matrixWorld.clone().multiply(one);
        for (let i = 0; i < position.count; i += step) {
          points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toWorld));
        }
      });
      if (!points.length) continue;
      const covered = points.filter((p) => insideSolid(p, 0.35)).length / points.length;
      if (covered < 0.6) {
        const center = box.getCenter(new THREE.Vector3());
        report(
          `${placeName}: ${nameAt(center.x, center.z)} has no physics shape (${Math.round(covered * 100)}% of it is covered): add it to the place's solids in blocky/layouts.js.`,
        );
        bad.add(0);
      }
    }
    // Every shape stands on something built.
    for (const b of solids) {
      const r = Math.hypot(b.w, b.d) / 2;
      const box = new THREE.Box3(
        new THREE.Vector3(b.x - r, b.y - b.h / 2, b.z - r),
        new THREE.Vector3(b.x + r, b.y + b.h / 2, b.z + r),
      );
      const real = built.some((other) => other.intersectsBox(box));
      const outside =
        b.x + r < bounds.minX - 2 ||
        b.x - r > bounds.maxX + 2 ||
        b.z + r < bounds.minZ - 2 ||
        b.z - r > bounds.maxZ + 2;
      if (!real && !outside && Math.max(b.w, b.d) <= 30) {
        report(
          `${placeName}: the physics shape at x ${b.x}, z ${b.z} has nothing built there (an invisible wall): remove it from blocky/layouts.js.`,
        );
        bad.add(0);
      }
    }
  }

  function checkPlace(place) {
    checkPhysics(place);
    const layout = layoutOf(place.name);
    place.group.traverse((object) => {
      const kind = object.userData.kind;
      if (!kind) return;
      const box = new THREE.Box3().setFromObject(object);
      const height = box.max.y - box.min.y;
      if (kind === "seat") {
        // From the ground it stands on (a garden chair on a deck stands a step up).
        const middle = box.getCenter(new THREE.Vector3());
        const seat = box.max.y - (layout.ground ? layout.ground(middle.x, middle.z) : 0);
        if (Math.abs(seat - SEAT_HEIGHT) > 0.2) {
          report(
            `${placeName}: a seat is ${seat.toFixed(2)} units high; seats sit at the figures' knee height (${SEAT_HEIGHT}).`,
          );
          bad.add(0);
        }
        return;
      }
      const range = WORLD[kind];
      if (!range) return;
      const real = height / UNITS_PER_METER;
      if (real < range.min - 0.01 || real > range.max + 0.01) {
        report(
          `${placeName}: a ${kind} is ${sizeWords(real)} high; it should be ${sizeWords(range.min)} to ${sizeWords(range.max)}.`,
        );
        bad.add(0);
      }
    });
  }

  function effectsSheet() {
    add(studio);
    scene.background = new THREE.Color("#c9ced8");
    const a = actor(who);
    a.root.visible = true;

    // Checks: every effect in the story is one the engine knows, lands on one of its shot's words, and its sound
    // is one Kairos makes.
    (story?.SHOTS ?? []).forEach((shot, i) => {
      for (const item of shot.fx ?? []) {
        const fx = normalizeFx(item);
        const name = typeof item === "string" ? item : Object.keys(item ?? {})[0];
        if (!fx) {
          report(`Shot ${i + 1}: "${name}" isn't an effect. Effects: ${FX_NAMES.join(", ")}.`);
          continue;
        }
        const words = sayWords(shot.say).map((w) => plainWord(w.text));
        if (fx.at && !words.includes(plainWord(fx.at))) {
          report(`Shot ${i + 1}: ${fx.type} is on "${fx.at}", but the shot doesn't say that word.`);
        }
        if (typeof fx.sound === "string" && !FX_SOUNDS.includes(fx.sound)) {
          report(`Shot ${i + 1}: there's no "${fx.sound}" sound. Sounds: ${FX_SOUNDS.join(", ")}.`);
        }
        if ((fx.type === "float" || fx.type === "big") && fx.value === true && !fx.text) {
          report(`Shot ${i + 1}: ${fx.type} needs its words: { ${fx.type}: "..." }.`);
        }
      }
    });

    const list = cells(EFFECT_SAMPLES.length, 6);
    EFFECT_SAMPLES.forEach(([fx, moment, face], i) => {
      const cell = list[i];
      const type = Object.keys(fx).find((key) => FX[key]);
      const entry = {
        shot: { who: [who], fx: [fx], say: type },
        index: 0,
        start: 0,
        seconds: 3,
        words: [],
      };
      const events = planEffects([entry]);
      // `moment` is seconds into the effect.
      const t = (events[0]?.t0 ?? 0) + moment;
      const state = actorState(events, 0, t, who);
      a.root.position.set(0, 0, 0);
      a.root.rotation.set(0, 0.35, 0);
      a.apply(poseAt(type === "notes" ? "talk" : "idle", t, 0));
      a.face(face, { blink: false, talk: 0 });
      a.root.visible = !state.hidden;
      a.root.scale.set(a.size * state.sx, a.size * state.sy, a.size * state.sx);
      a.root.position.y += state.lift * 5.3 * a.size;
      const aspect = cell.w / (cell.h - LABEL_H);
      frameStanding(camera, aspect, new THREE.Vector3(0, 0, 0), 6.8 * a.size, -0.2);
      camera.fov *= cameraState(events, 0, t).zoom;
      camera.updateProjectionMatrix();
      draw(cell);
      a.root.updateMatrixWorld(true);

      // Where the head and the feet are in this cell, for the 2D drawing (taken now: the figure moves on).
      const view = camera.clone();
      const cw = cell.w;
      const ch = cell.h - LABEL_H;
      const toCell = (p) => {
        const q = p.clone().project(view);
        return [((q.x + 1) / 2) * cw, ((1 - q.y) / 2) * ch];
      };
      const head = a.headWorld(new THREE.Vector3());
      const [hx, hy] = toCell(head);
      const [, ty] = toCell(head.clone().add(new THREE.Vector3(0, 0.66 * a.size, 0)));
      const feet = a.root.position.clone();
      const size = a.size;
      const headAt = () =>
        a.root.visible || state.hidden ? { x: hx, y: hy, r: Math.abs(hy - ty) } : null;
      const ringAt = (_id, radius, n) =>
        radius > 0
          ? Array.from({ length: n }, (_, k) => {
              const angle = (k / n) * Math.PI * 2;
              return toCell(
                new THREE.Vector3(
                  feet.x + Math.cos(angle) * radius * 2.2 * size,
                  0.05,
                  feet.z + Math.sin(angle) * radius * 2.2 * size,
                ),
              );
            })
          : null;
      overlays.push(() => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cw, ch);
        ctx.clip();
        ctx.translate(cell.x, cell.y);
        drawEffects(ctx, events, 0, t, { W: cw, H: ch, headAt, ringAt, focus: who });
        ctx.restore();
      });
      const sound = events[0]?.sound;
      if (sound && !FX_SOUNDS.includes(sound)) {
        report(`${type}: its sound "${sound}" isn't one Kairos makes.`);
        bad.add(i);
      }
      label(cell, `${type}${sound ? ` · ${sound}` : ""}`, bad.has(i));
    });
    a.root.scale.setScalar(a.size);
  }

  /** The most a foot on the ground slides through two cycles of a gait (units). */
  function footSlide(a, pace) {
    const g = GAITS[pace];
    let worst = 0;
    const planted = [null, null];
    for (let i = 0; i <= 120; i++) {
      const phase = i / 60;
      a.root.position.set(0, 0, phase * g.cycle * a.size);
      a.root.rotation.set(0, 0, 0);
      a.apply(gaitPose(pace, phase));
      a.root.updateMatrixWorld(true);
      [0, 0.5].forEach((offset, side) => {
        const c = (((phase + offset) % 1) + 1) % 1;
        if (c > 0.02 && c < g.stance - 0.02) {
          const at = a.ankleWorld(side, new THREE.Vector3());
          if (!planted[side]) planted[side] = at;
          else worst = Math.max(worst, at.distanceTo(planted[side]));
        } else {
          planted[side] = null;
        }
      });
    }
    return worst;
  }

  /** The most the feet slide while sitting down (units). */
  function sitSlide(a) {
    let worst = 0;
    let first = null;
    const drop = (SEAT_HEIGHT - 1.5 * a.size) / a.size;
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      a.root.position.set(0, 0, -SEAT_REACH * a.size * seatBack(k));
      a.root.rotation.set(0, 0, 0);
      a.apply(sitDownPose(k, drop));
      a.root.updateMatrixWorld(true);
      const at = a.ankleWorld(0, new THREE.Vector3());
      if (!first) first = at;
      else worst = Math.max(worst, at.distanceTo(first));
    }
    return worst;
  }

  /**
   * The story's walks and actions, planned the way the film plans them, and its physics run the way the film runs
   * it: the problems found (walking into furniture, a throw that misses, things that never settle...).
   */
  function storyProblems() {
    const shots = story?.SHOTS ?? [];
    const things = story?.THINGS ?? {};
    const plan = planStory(shots, voiceLines);
    const places = [];
    for (const entry of plan.entries) places.push(entry.shot.place ?? places.at(-1) ?? "home");
    const sizeOf = (id) => cast[id]?.size ?? 1;
    const isCharacter = (id) => Boolean(cast[id]);
    const motion = planMotion(plan.entries, {
      aspect: filmAspect,
      sizeOf,
      isCharacter,
      placeOf: (_entry, i) => places[i],
      things: thingSpots(things),
    });
    const problems = [...motion.problems];
    for (const [id, spec] of Object.entries(things)) {
      if (!PROPS[spec?.prop])
        problems.push(`THINGS: "${id}" is a "${spec?.prop}", which isn't a prop.`);
    }
    if (createWorld) {
      const posing = {
        plan: motion,
        timeline: plan.entries,
        placeOf: (i) => places[i],
        layoutAt: (i) => layoutOf(places[i]),
        sizeOf,
        phaseOf: () => 0,
        sim: null,
      };
      const physics = simulate(createWorld, {
        timeline: plan.entries,
        placeOf: (i) => places[i],
        motion,
        things,
        sizeOf,
        isCharacter,
        figureAt: (i, id, t) => figureAt(posing, i, id, t),
      });
      problems.push(...physics.problems);
    }
    return problems;
  }

  function movesSheet() {
    add(studio);
    scene.background = new THREE.Color("#c9ced8");
    const a = actor(who);
    a.root.visible = true;
    // Marks on the floor every 25 cm: a foot on the ground stays on its mark.
    const marks = new THREE.Group();
    for (let k = -16; k <= 24; k++) {
      const mark = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.012, 0.05),
        new THREE.MeshStandardMaterial({ color: "#8a90a0", roughness: 0.9 }),
      );
      mark.position.set(0, 0.006, k * meters(0.25));
      marks.add(mark);
    }
    add(marks);
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, SEAT_HEIGHT, 2),
      new THREE.MeshStandardMaterial({ color: "#8b5a35", roughness: 0.6 }),
    );
    seat.castShadow = true;
    seat.receiveShadow = true;
    seat.position.set(0, SEAT_HEIGHT / 2, -1.55);

    for (const problem of storyProblems()) report(problem);

    const list = cells(GAIT_NAMES.length * 4 + 8 + 16, 8);
    let c = 0;
    // The gaits, side on with the camera still: four moments of a cycle.
    for (const pace of GAIT_NAMES) {
      const g = GAITS[pace];
      const slide = footSlide(a, pace);
      const problem = slide > SLIDE_LIMIT;
      if (problem) {
        report(
          `${pace}: a foot on the ground slides ${((slide / UNITS_PER_METER) * 100).toFixed(1)} cm.`,
        );
      }
      for (let k = 0; k < 4; k++) {
        const cell = list[c++];
        const phase = k / 4;
        a.root.position.set(0, 0, phase * g.cycle * a.size);
        a.root.rotation.set(0, 0, 0);
        a.apply({ ...poseAt("idle", 0, 0), ...gaitPose(pace, phase) });
        a.face(pace === "sneak" ? "suspicious" : pace === "run" ? "grin" : "neutral", {
          blink: false,
          talk: 0,
        });
        frameStanding(
          camera,
          cell.w / (cell.h - LABEL_H),
          new THREE.Vector3(0, 0, 0.5 * g.cycle * a.size),
          5.8 * a.size,
          Math.PI / 2 - 0.25,
          1.25,
        );
        draw(cell);
        label(cell, `${pace} · ${k + 1}/4`, problem);
      }
    }
    // Walking to a seat (turning to it, then around to sit), then standing up and walking off.
    const sitting = sitSlide(a);
    const sitProblem = sitting > SLIDE_LIMIT;
    if (sitProblem) {
      report(`sitting down: a foot slides ${((sitting / UNITS_PER_METER) * 100).toFixed(1)} cm.`);
    }
    add(seat);
    const shots = [
      {
        place: "room",
        who: [who],
        at: { [who]: "start" },
        go: { [who]: "seat" },
        say: MOVES_WORDS,
      },
      { who: [who], go: { [who]: "side" }, say: MOVES_WORDS },
    ];
    const plan = planStory(shots, []);
    const motion = planMotion(plan.entries, {
      sizeOf: () => a.size,
      layouts: () => MOVES_ROOM,
      placeOf: () => "room",
    });
    const rows = [
      ["to the seat", motion.moves[0], 0],
      ["up and away", motion.moves.find((m) => m.kind === "go" && m.entry === 1), 1],
    ];
    for (const [name, move, entryIndex] of rows) {
      for (let k = 0; k < 4; k++) {
        const cell = list[c++];
        if (!move) {
          label(cell, `${name}: no move`, true);
          continue;
        }
        const t = move.t0 + ((move.t1 - move.t0) * k) / 3;
        const st = personState(motion, entryIndex, who, Math.min(t, move.t1 - 1e-3), MOVES_ROOM);
        a.root.position.set(st.x, st.y ?? 0, st.z);
        a.root.rotation.set(0, st.rot, 0);
        const entry = plan.entries[entryIndex];
        const pose = composePose(st, poseAt(poseFor(entry, who, st.posture), t, 0), {
          idle: () => poseAt("idle", t, 0),
          size: a.size,
          t,
          poseTime: t,
        });
        a.apply(pose);
        a.face("neutral", { blink: false, talk: 0 });
        frameStanding(
          camera,
          cell.w / (cell.h - LABEL_H),
          new THREE.Vector3(1.8, 0, 1),
          9 * a.size,
          0.75,
          1.1,
          0.5,
        );
        draw(cell);
        const what = st.act?.kind === "gait" ? "walk" : (st.act?.kind ?? st.posture);
        label(cell, `${name} · ${what}`, name === "to the seat" && sitProblem);
      }
    }
    content.remove(seat);

    // Actions, side on: the jump (crouch, push off, tucked over the top, landing), a punch at someone's face
    // (wind-up, the drive, the contact, follow-through), getting up from the floor, picking up and throwing.
    const idle = poseAt("idle", 0, 0);
    const side = (pose, lift = 0, faceName = "neutral") => {
      a.root.position.set(0, lift, 0);
      a.root.rotation.set(0, 0, 0);
      a.apply(pose);
      a.face(faceName, { blink: false, talk: 0 });
    };
    const frameIt = (cell, y = 0) =>
      frameStanding(
        camera,
        cell.w / (cell.h - LABEL_H),
        new THREE.Vector3(0, y, 0.6),
        6.4 * a.size,
        Math.PI / 2 - 0.3,
        1.25,
      );
    const air = 0.64;
    const arc = (u) => (GRAVITY / 2) * u * (air - u);
    const run = gaitPose("run", 0.2);
    const jumps = [
      ["jump · crouch", jumpPose(run, { before: 0.05, after: -1, air, k: 0 }), 0],
      ["jump · push off", jumpPose(run, { before: -0.05, after: -1, air, k: 0.1 }), arc(0.064)],
      ["jump · over the top", jumpPose(run, { before: -0.3, after: -1, air, k: 0.5 }), arc(0.32)],
      ["jump · landing", jumpPose(run, { before: -1, after: 0.08, air, k: 1 }), 0],
    ];
    for (const [name, pose, lift] of jumps) {
      const cell = list[c++];
      side({ ...idle, ...pose }, lift, "grin");
      frameIt(cell, lift);
      draw(cell);
      label(cell, name);
    }
    // The punch aims at a face 2.3 units ahead (another figure's head height).
    const target = new THREE.Vector3(0, 4.7 * a.size, 2.3 * a.size);
    const root = { x: 0, y: 0, z: 0, rot: 0, size: a.size };
    const punches = [
      ["punch · wind-up", { phase: "windUp", k: 0.9 }],
      ["punch · drive", { phase: "drive", k: 0.6 }],
      ["punch · contact", { phase: "drive", k: 1 }],
      ["punch · follow-through", { phase: "follow", k: 0.6 }],
    ];
    for (const [name, act] of punches) {
      const cell = list[c++];
      const { pose, aim } = punchPose({ ...act, side: "R" }, idle);
      const aimed = aimArm(pose, root, "R", target);
      const armR = pose.armR.map((v, i) => v + (aimed.armR[i] - v) * aim);
      side({ ...pose, armR, elbowR: pose.elbowR + (aimed.elbowR - pose.elbowR) * aim }, 0, "angry");
      frameIt(cell);
      draw(cell);
      label(cell, name);
    }
    for (const k of [0.05, 0.3, 0.65, 0.95]) {
      const cell = list[c++];
      side(getUpPose(k), 0, "tired");
      frameIt(cell);
      draw(cell);
      label(cell, `getting up · ${Math.round(k * 100)}%`);
    }
    const hands = [
      ["pick up · reach", pickUpPose({ phase: "reach", k: 0.95 }, idle, 0.9).pose],
      ["pick up · lift", pickUpPose({ phase: "lift", k: 0.6 }, idle, 0.9).pose],
      ["throw · wind-up", throwPose({ phase: "windUp", k: 0.55 }, idle)],
      ["throw · release", throwPose({ phase: "windUp", k: 1 }, idle)],
    ];
    for (const [name, pose] of hands) {
      const cell = list[c++];
      side(pose, 0, "angry");
      frameIt(cell);
      draw(cell);
      label(cell, name);
    }
  }

  function drawLabels() {
    ctx.clearRect(0, 0, W, H);
    for (const paint of overlays) paint();
    for (const { cell, text, problem } of items) {
      ctx.fillStyle = problem ? "#b13e53" : "#1a1c2c";
      ctx.fillRect(cell.x, cell.y + cell.h - LABEL_H, cell.w, LABEL_H);
      ctx.fillStyle = "#f4f4f4";
      ctx.font = "600 17px Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cell.x + 10, cell.y + cell.h - LABEL_H / 2, cell.w - 20);
      ctx.strokeStyle = problem ? "#b13e53" : "#1a1c2c";
      ctx.lineWidth = problem ? 6 : 2;
      ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
    }
  }

  function render() {
    items.length = 0;
    overlays.length = 0;
    found.clear();
    bad.clear();
    scene.remove(content);
    content = new THREE.Group();
    scene.add(content);
    scene.fog = null;
    renderer.setScissorTest(false);
    renderer.setClearColor("#1a1c2c");
    renderer.clear();
    if (sheet === "cast") castSheet();
    else if (sheet === "poses") posesSheet();
    else if (sheet === "faces") facesSheet();
    else if (sheet === "props") propsSheet();
    else if (sheet === "effects") effectsSheet();
    else if (sheet === "moves") movesSheet();
    else placesSheet();
    drawLabels();
    checks.length = 0;
    for (const [text, count] of found) checks.push(count > 1 ? `${text} (×${count})` : text);
  }

  // Drawn once, then again when asked (the picture doesn't change with time).
  render();
  // The moves sheet waits for the film's voices and shape, then draws again.
  const ready =
    sheet === "moves"
      ? Promise.all([
          loadVoices(),
          fetch("kairos.json", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null),
          loadPhysics().catch(() => null),
        ]).then(([lines, config, physics]) => {
          voiceLines = lines;
          createWorld = physics;
          if (config?.width > 0 && config?.height > 0) filmAspect = config.width / config.height;
          render();
        })
      : Promise.resolve();
  return {
    ready,
    render,
    /** The problems found, in plain words (also in `window.KAIROS_CHECKS`). */
    checks,
    sheet,
    places: Object.keys(DEFAULT_LIGHT),
  };
}
