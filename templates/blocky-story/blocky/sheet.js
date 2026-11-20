// Sheets: every character, pose, face, prop and place on one picture, with checks. They show at a glance what a
// film will look like, and catch mistakes before they reach a film: an object at the wrong size, a joint pushed
// past its limit, a part that comes off the body, a door too small for the figures.
// The effects sheet shows every effect at its peak, and checks the story's effects.
// sheet.html?sheet=cast|poses|faces|props|places|effects&place=home&who=milo (see sheet.html).
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BLOCKY_CAST } from "./cast.js";
import { makeCharacter } from "./characters.js";
import { makeSky } from "./engine.js";
import { EXPRESSIONS } from "./faces.js";
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
import { DEFAULT_LIGHT, getPlace } from "./places.js";
import { POSE_NAMES, poseAt } from "./poses.js";
import { PROP_NAMES, PROPS, table } from "./props.js";
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
import { plainWord, sayWords } from "./timing.js";

export const SHEETS = ["cast", "poses", "faces", "props", "places", "effects"];

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
        camera.fov = 40;
        camera.aspect = cell.w / (cell.h - LABEL_H);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        draw(cell, place);
        label(cell, `${placeName} · ${light} · ${name}`, r === 0 && c === 0 && bad.has(0));
      });
    });
  }

  /** Doors, tables and seats against the size chart and the figures. */
  function checkPlace(place) {
    place.group.traverse((object) => {
      const kind = object.userData.kind;
      if (!kind) return;
      const box = new THREE.Box3().setFromObject(object);
      const height = box.max.y - box.min.y;
      if (kind === "seat") {
        if (Math.abs(box.max.y - SEAT_HEIGHT) > 0.2) {
          report(
            `${placeName}: a seat is ${box.max.y.toFixed(2)} units high; seats sit at the figures' knee height (${SEAT_HEIGHT}).`,
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
    else placesSheet();
    drawLabels();
    checks.length = 0;
    for (const [text, count] of found) checks.push(count > 1 ? `${text} (×${count})` : text);
  }

  // Drawn once, then again when asked (the picture doesn't change with time).
  render();
  return {
    ready: Promise.resolve(),
    render,
    /** The problems found, in plain words (also in `window.KAIROS_CHECKS`). */
    checks,
    sheet,
    places: Object.keys(DEFAULT_LIGHT),
  };
}
