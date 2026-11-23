// The Blocky engine: turns the shot list in story.js into frames. The narration never stops: shots cut on
// its words (timing.js), and effects (fx.js) land on them. People move and act (motion.js, figure.js), and things
// fall, tumble and fly by physics (simulation.js), worked out once when the film loads. renderOut(t) is a pure
// function of t.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { drawCaptions } from "./captions.js";
import { BLOCKY_CAST } from "./cast.js";
import { makeCharacter } from "./characters.js";
import { createEffects } from "./effects.js";
import { faceAt, figureAt } from "./figure.js";
import {
  actorState,
  cameraState,
  drawEffects,
  effectSounds,
  moveEffects,
  planEffects,
} from "./fx.js";
import { layoutOf, solidsOf } from "./layouts.js";
import { headDrop, personState, planMotion, wrapAngle } from "./motion.js";
import { drawOverlays } from "./overlays.js";
import { loadPhysics } from "./physics.js";
import { getPlace, LIGHTS, PLACE_NAMES, setLook, shadowSize } from "./places.js";
import { PROPS } from "./props.js";
import { blendFrames, partFrames, poseFrames } from "./rig.js";
import { frameShot, SHOT_TYPES, viewBlocked } from "./shots.js";
import { LIMB_NAMES, sampleTrack, simulate, thingSpots } from "./simulation.js";
import { fitSize, SIZES } from "./sizes.js";
import { makeSky } from "./sky.js";
import { planStory } from "./timing.js";
import { clamp, hash, lerp, smooth, wobble } from "./util.js";
import { loadVoices } from "./voice.js";

/** Focus blur by shot type: close shots blur the background more. */
const APERTURE = {
  wide: 0.00012,
  full: 0.0003,
  medium: 0.0006,
  close: 0.0011,
  xclose: 0.0015,
  ots: 0.001,
  low: 0.0005,
  high: 0.0004,
  insert: 0.0016,
};

/** Is a camera position inside the room (clear of its walls) and out of its furniture? */
function roomForCamera(layout, p) {
  if (layout.walls) {
    const w = layout.walls;
    if (p.x < w.minX + 0.6 || p.x > w.maxX - 0.6 || p.z < w.minZ + 0.6 || p.z > w.maxZ - 0.6)
      return false;
  }
  return solidsOf(layout).every((box) => {
    const c = Math.cos(box.rot ?? 0);
    const s = Math.sin(box.rot ?? 0);
    const dx = p.x - box.x;
    const dz = p.z - box.z;
    return !(
      Math.abs(dx * c - dz * s) < box.w / 2 + 0.5 &&
      Math.abs(dx * s + dz * c) < box.d / 2 + 0.5 &&
      Math.abs(p.y - box.y) < box.h / 2 + 0.5
    );
  });
}

/**
 * A camera that would stand outside the room's walls or inside furniture moves in along its line toward what it
 * looks at, until it's clear, and widens its lens so the framing stays the same (as a crew does in a small room).
 */
export function fitInRoom(view, layout) {
  if (!layout.walls && !(layout.solids ?? []).length) return view;
  if (roomForCamera(layout, view.position)) return view;
  const far = view.position.distanceTo(view.target);
  for (let k = 0.02; k <= 0.86; k += 0.02) {
    const p = view.position.clone().lerp(view.target, k);
    if (!roomForCamera(layout, p)) continue;
    const near = p.distanceTo(view.target);
    const half = Math.atan((Math.tan(THREE.MathUtils.degToRad(view.fov) / 2) * far) / near);
    return {
      ...view,
      position: p,
      fov: Math.min(72, THREE.MathUtils.radToDeg(2 * half)),
      // The subject is that much closer now (the focus follows).
      focus: Math.max(0.5, view.focus - (far - near)),
    };
  }
  return view;
}

/**
 * How far along a ray (from `o`, unit direction `d`) it enters a physics box `b` ({ x, y, z, w, h, d, rot }), or
 * Infinity when it misses. The box turns like everywhere else: local x = dx·cos − dz·sin, local z = dx·sin + dz·cos.
 */
function rayBox(o, d, b) {
  const c = Math.cos(b.rot ?? 0);
  const s = Math.sin(b.rot ?? 0);
  const ox = o.x - b.x;
  const oz = o.z - b.z;
  const axes = [
    [ox * c - oz * s, d.x * c - d.z * s, b.w / 2],
    [o.y - b.y, d.y, b.h / 2],
    [ox * s + oz * c, d.x * s + d.z * c, b.d / 2],
  ];
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (const [start, step, half] of axes) {
    if (Math.abs(step) < 1e-9) {
      if (Math.abs(start) > half) return Number.POSITIVE_INFINITY;
      continue;
    }
    let a = (-half - start) / step;
    let z = (half - start) / step;
    if (a > z) [a, z] = [z, a];
    near = Math.max(near, a);
    far = Math.min(far, z);
    if (near > far) return Number.POSITIVE_INFINITY;
  }
  return near;
}

/**
 * How much furniture spoils the view (0 = not at all): standing between the camera and anyone it frames (their head
 * or chest: 1 each), covering the middle of the picture in front of them (beyond a fifth of it), or standing close
 * to the camera anywhere in the picture, edges too (a shelf down one side: beyond an eighth of it). Rays from the
 * camera against the place's physics boxes (layouts.js `solids`, which the Places sheet checks against what's
 * built), so a richly detailed place costs no more than a plain one. Low things (pavements, decks, rugs) don't count.
 */
const probe = new THREE.PerspectiveCamera();
function furnitureInView(place, look, aspect, framed) {
  let cost = 0;
  const layout = layoutOf(place.name);
  // Still inside furniture or outside the walls after moving in (rays from there see through it all): the worst.
  if (!roomForCamera(layout, look.position)) cost += 3;
  place.viewSolids ??= solidsOf(layout).filter((b) => b.y + b.h / 2 > 0.6);
  const { position } = look;
  const subject = Math.min(...framed.map((s) => s.head.distanceTo(position)));
  // Only boxes that could be in the way.
  const reach = subject + 12;
  const solids = place.viewSolids.filter(
    (b) => Math.hypot(b.x - position.x, b.z - position.z) - Math.hypot(b.w, b.d) / 2 < reach,
  );
  const hits = (dir, far) => solids.some((b) => rayBox(position, dir, b) < far);
  for (const s of framed) {
    for (const point of [s.head, s.chest]) {
      const toward = point.clone().sub(position);
      const far = toward.length();
      if (far < 1e-3) continue;
      if (hits(toward.normalize(), far - 0.9 * s.size)) cost += 1;
    }
  }
  // The middle of the picture: furniture in front of the subjects covering more than a fifth of it.
  probe.fov = look.fov;
  probe.aspect = aspect;
  probe.near = 0.1;
  probe.far = 900;
  probe.position.copy(position);
  probe.up.copy(look.up ?? new THREE.Vector3(0, 1, 0));
  probe.lookAt(look.target);
  probe.updateProjectionMatrix();
  probe.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  /** Is there furniture along this ray (a point of the picture), nearer than `far`? */
  const blocked = (x, y, far) => {
    dir.set(x, y, 0.5).unproject(probe).sub(position).normalize();
    return hits(dir, far);
  };
  let middle = 0;
  for (let gx = -2; gx <= 2; gx++) {
    for (let gy = -2; gy <= 2; gy++) if (blocked(gx * 0.32, gy * 0.32, subject * 0.75)) middle++;
  }
  // The whole picture, edges too: furniture close to the camera (a slab of shelf down one side) covering more
  // than an eighth of it.
  let near = 0;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gy = -3; gy <= 3; gy++) if (blocked(gx * 0.31, gy * 0.31, subject * 0.45)) near++;
  }
  return cost + Math.max(0, middle / 25 - 0.2) + Math.max(0, near / 49 - 0.125);
}

/**
 * The look (quality level) to draw with: `SETTINGS.look` when the story sets one, `?look=` in the page's address;
 * else the live preview in Kairos (`?kairos=preview`) gets "standard", frames and renders get "cinematic", and
 * "draft" whenever the browser draws without a graphics card (software drawing: a computer without one, or a render
 * where you chose not to use it). Only the finish changes: where people are, how they move and the physics are the
 * same at every level.
 */
function chooseLook(renderer, settings) {
  const looks = ["draft", "standard", "cinematic"];
  if (looks.includes(settings.look)) return settings.look;
  const asked = new URLSearchParams(globalThis.location?.search ?? "").get("look");
  if (looks.includes(asked ?? "")) return asked;
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  const preview =
    new URLSearchParams(globalThis.location?.search ?? "").get("kairos") === "preview";
  if (software) return "draft";
  return preview ? "standard" : "cinematic";
}

/** A soft round shadow texture (the contact shadow under someone's feet). */
let blobTexture = null;
function contactShadowTexture() {
  if (blobTexture) return blobTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(0,0,0,0.75)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.35)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  blobTexture = new THREE.CanvasTexture(canvas);
  return blobTexture;
}

/** Icons the effects draw now (fx.js); the others ("!", "?", "idea") stay icons. */
const FX_ICONS = new Set(["music", "heart", "sparkle", "zzz", "sweat", "anger"]);

export function createEngine({ width: W, height: H, story }) {
  const shots = story.SHOTS ?? [];
  const cast = { ...BLOCKY_CAST, ...(story.CAST ?? {}) };
  const settings = story.SETTINGS ?? {};

  // The picture: WebGL below, a 2D layer for captions and extras on top.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = "film-3d";
  document.body.appendChild(renderer.domElement);
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  layer.className = "film-2d";
  document.body.appendChild(layer);
  const ctx = layer.getContext("2d");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 900);
  const look = chooseLook(renderer, settings);
  setLook(look);
  const sky = makeSky(look);
  scene.add(sky.group);
  const effects = createEffects(renderer, scene, camera, W, H, settings, look);
  // Lighting as on a film set, placed around each shot's camera: a key light beside the camera (faces are always
  // lit; indoors it casts the soft shadows), a soft fill from the other side, and a cool rim behind people that
  // draws their outline against the background.
  const key = new THREE.DirectionalLight("#fff0dc", 1);
  key.shadow.mapSize.set(shadowSize(), shadowSize());
  Object.assign(key.shadow.camera, {
    left: -11,
    right: 11,
    top: 11,
    bottom: -11,
    near: 1,
    far: 90,
  });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 5;
  const fill = new THREE.DirectionalLight("#e8eeff", 0.3);
  const rim = new THREE.DirectionalLight("#d6e4ff", 0.8);
  scene.add(key, key.target, fill, fill.target, rim, rim.target);
  // Contact shadows: a soft dark patch under each figure, so feet touch the floor.
  const contacts = new Map();
  const contactShadow = (id) => {
    let blob = contacts.get(id);
    if (!blob) {
      blob = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: contactShadowTexture(),
          transparent: true,
          depthWrite: false,
          opacity: 0.5,
        }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.renderOrder = -1;
      scene.add(blob);
      contacts.set(id, blob);
    }
    return blob;
  };

  // The timeline: when each shot starts, and its words. The voice leads (see timing.js): it is built again once
  // the film's voices are read; until then the words are spread at a speaking rate.
  let timeline = [];
  let duration = 0;
  let scenes = [];
  /** Every word of the narration, timed, with its speaker. */
  let stream = [];
  let events = [];
  let sounds = [];
  /** Where everyone is and how they move (motion.js). */
  let motion = { entries: [], moves: [], problems: [], holds: [], throws: [], punches: [] };
  /** How far each close shot's camera turns to see past someone in the way (worked out once per shot). */
  let viewTurns = new Map();
  /** The story's things that move by physics, and the physics of the whole film (null until it's worked out). */
  const things = story.THINGS ?? {};
  let physics = null;
  /** Each shot's place. */
  let placesOf = [];
  const sizeOf = (id) => cast[id]?.size ?? 1;
  const phaseOf = (id) => (hash(id) % 1000) / 1000;

  /** What figure.js needs to pose anyone at any moment. */
  const figures = () => ({
    plan: motion,
    timeline,
    placeOf: (i) => placesOf[i],
    layoutAt: (i) => layoutOf(placesOf[i]),
    sizeOf,
    phaseOf,
    cueFor,
    sim: physics,
  });

  function build(lines, createWorld) {
    const plan = planStory(shots, lines);
    duration = plan.duration;
    stream = plan.words;
    timeline = plan.entries;
    // Where everyone is, their walks and actions, and the dust and patter of runs.
    placesOf = [];
    for (const entry of timeline) placesOf.push(entry.shot.place ?? placesOf.at(-1) ?? "home");
    motion = planMotion(timeline, {
      aspect: W / H,
      sizeOf,
      isCharacter: (id) => Boolean(cast[id]),
      placeOf: (_entry, i) => placesOf[i],
      things: thingSpots(things),
    });
    // The physics, from the plan: once, from the start, at a fixed step (simulation.js).
    physics = null;
    if (createWorld) {
      const posing = { ...figures(), sim: null };
      physics = simulate(createWorld, {
        timeline,
        placeOf: (i) => placesOf[i],
        motion,
        things,
        sizeOf,
        isCharacter: (id) => Boolean(cast[id]),
        figureAt: (i, id, t) => figureAt(posing, i, id, t),
      });
    }
    events = [...planEffects(timeline), ...moveEffects(motion.moves, timeline)];
    viewTurns = new Map();
    sounds = effectSounds(events);
    // Scene markers for the Kairos timeline: one per run of shots in the same place.
    scenes = [];
    let placeSoFar;
    for (const entry of timeline) {
      placeSoFar = entry.shot.place ?? placeSoFar ?? "home";
      const last = scenes.at(-1);
      if (last && last.place === placeSoFar) last.end = entry.start + entry.seconds;
      else
        scenes.push({
          place: placeSoFar,
          name: placeSoFar[0].toUpperCase() + placeSoFar.slice(1),
          start: entry.start,
          end: entry.start + entry.seconds,
        });
    }
  }
  build([]);

  // Characters are built when first needed and kept.
  const actors = new Map();
  function actor(id) {
    let a = actors.get(id);
    if (!a) {
      const spec = cast[id];
      if (!spec) return null;
      a = makeCharacter(spec);
      a.phase = (hash(id) % 1000) / 1000;
      // Where the eyes are when standing, for a size-1 figure (the camera follows walkers at this height).
      a.apply({});
      a.root.updateMatrixWorld(true);
      a.headHeight = a.headWorld(new THREE.Vector3()).y / a.size;
      a.root.visible = false;
      scene.add(a.root);
      actors.set(id, a);
    }
    return a;
  }

  const props = new Map();
  function prop(key, name) {
    let p = props.get(key);
    if (!p && PROPS[name]) {
      // Every object at its real size (sizes.js): a phone is a phone, in a hand or on a table.
      p = fitSize(PROPS[name](), SIZES[name] ?? 0);
      p.userData.fit = p.scale.x;
      p.visible = false;
      props.set(key, p);
    }
    return p;
  }

  /** Who says the word at `time` (a character id, or null), who spoke before them, and how far the heads turned. */
  function speakerAt(time) {
    const i = stream.findLastIndex((w) => w.start <= time);
    if (i < 0) return { id: null, before: null, k: 1 };
    const id = stream[i].speaker ?? null;
    let j = i;
    while (j > 0 && (stream[j - 1].speaker ?? null) === id) j--;
    const before = j > 0 ? (stream[j - 1].speaker ?? null) : null;
    return { id, before, k: smooth((time - stream[j].start + 0.1) / 0.4) };
  }

  /** Gestures on a shot's key words, and a nod at the end of a sentence (talking poses). */
  function cueFor(entry, id, phase) {
    const speakers = new Set(entry.words.map((w) => w.speaker).filter(Boolean));
    const talks =
      speakers.has(id) || entry.shot.talk === id || Boolean(entry.shot.talk?.includes?.(id));
    const mine = entry.words.filter(
      (w) => w.speaker === id || ((!w.speaker || !cast[w.speaker]) && talks),
    );
    if (!mine.length) return undefined;
    const shift = phase * 3 - entry.start;
    const keys = mine.filter((w) => w.key);
    const beats = (keys.length ? keys : mine.filter((_, i) => i % 4 === 1)).map(
      (w) => w.start + shift,
    );
    const nods = mine.filter((w) => /[.!?…]["')\]]*$/.test(w.text)).map((w) => w.end + shift);
    return { beats, nods };
  }

  let shownPlace = null;
  const tmp = new THREE.Vector3();

  function render(time) {
    const t = clamp(time, 0, Math.max(0, duration - 1e-4));
    const entry = timeline.findLast((e) => e.start <= t) ?? timeline[0];
    ctx.clearRect(0, 0, W, H);
    if (!entry) {
      renderer.setClearColor("#1a1c2c");
      renderer.clear();
      return;
    }
    const { shot, index, start, seconds } = entry;
    const u = t - start;
    // Captions show the shot's words; the speaker of the word being said moves their mouth.
    const words = entry.words;
    const saying = stream.find((w) => t >= w.start && t < w.end) ?? null;
    const speakers = new Set(entry.words.map((w) => w.speaker).filter(Boolean));
    const talksIn = (id) =>
      speakers.has(id) || shot.talk === id || Boolean(shot.talk?.includes?.(id));

    // The place and its light. A shot without a place stays where the previous one was.
    let placeName = shot.place;
    for (let i = index; !placeName && i >= 0; i--) placeName = timeline[i].shot.place;
    const place = getPlace(placeName ?? "home", shot.light);
    if (shownPlace !== place) {
      if (shownPlace) shownPlace.group.visible = false;
      if (!place.group.parent) scene.add(place.group);
      place.group.visible = true;
      shownPlace = place;
    }
    sky.set(place.light);
    sky.update(t);
    scene.fog = place.fog ? new THREE.Fog(place.fog.color, place.fog.near, place.fog.far) : null;
    renderer.toneMappingExposure = place.exposure * (settings.exposure ?? 1);
    scene.environmentIntensity = place.env;
    place.update(t);

    // Characters: where they are, their pose and their face.
    for (const a of actors.values()) a.root.visible = false;
    for (const blob of contacts.values()) blob.visible = false;
    for (const p of props.values()) {
      p.visible = false;
      p.removeFromParent();
    }
    // Where everyone is now (motion.js: spots, walks, sitting down and standing up).
    const layout = layoutOf(place.name);
    const states = new Map();
    for (const id of shot.who ?? []) {
      if (!actor(id) || states.has(id)) continue;
      const state = personState(motion, index, id, t, layout);
      if (state) states.set(id, state);
    }
    const who = [...states.keys()];
    const posing = figures();
    for (const id of who) {
      const a = actor(id);
      const st = states.get(id);
      if (st.hidden) {
        // Not in the picture yet (they come in later in the shot).
        a.root.visible = false;
        continue;
      }
      // The whole body at this moment (figure.js): walks, actions, carrying, reactions, aimed arms.
      const figure = figureAt(posing, index, id, t);
      a.root.position.set(figure.root.x, figure.root.y, figure.root.z);
      a.root.rotation.set(0, figure.root.rot, 0);
      a.pose = figure.pose;
      a.lying = st.posture === "lie" && !st.act;
      a.apply(figure.pose);
      // Knocked down: the falling body comes from the physics, and getting up starts from where it fell.
      const fall =
        st.act?.kind === "knocked"
          ? physics?.limbs.get(id)?.find((f) => Math.abs(f.t0 - st.act.stage.t0) < 0.05)
          : null;
      if (fall) {
        const lying = (time) =>
          partFrames(
            Object.fromEntries(
              LIMB_NAMES.map((name) => [name, sampleTrack(fall.parts.get(name), time)]),
            ),
          );
        if (st.act.phase === "getUp") {
          a.applyFrames(
            blendFrames(
              lying(fall.t1),
              poseFrames(figure.pose, figure.root),
              smooth(st.act.k / 0.4),
            ),
          );
        } else a.applyFrames(lying(t));
        a.lying = st.act.phase !== "getUp";
      }
      a.root.visible = true;
      // The contact shadow: under the feet (under the hips when down), fainter in the air.
      const blob = contactShadow(id);
      const ground = (st.y ?? 0) - (st.lift ?? 0);
      a.root.updateMatrixWorld(true);
      const under = fall ? a.root.localToWorld(new THREE.Vector3(0, 2, 0)) : a.root.position;
      blob.position.set(under.x, ground + 0.03, under.z);
      blob.scale.setScalar((fall ? 4.2 : 3.3) * a.size);
      blob.material.opacity = 0.5 * Math.max(0, 1 - (st.lift ?? 0) / 3);
      blob.visible = !a.lying || Boolean(fall);

      // Faces: the shot's expression (crossfading from the one before), blinking, a talking mouth on spoken
      // words, and a start when something hits them.
      const look = faceAt(timeline, (i) => placesOf[i], index, id);
      let expression = look.expression;
      let change = { from: look.from, k: (t - look.since) / 0.25 };
      const hit = (physics?.hits ?? []).findLast((h) => h.id === id && h.t <= t);
      if (hit && t - hit.t < 0.9) {
        expression = "shocked";
        change = { from: look.expression, k: (t - hit.t) / 0.08 };
      }
      const period = 3.1 + a.phase * 1.8;
      const blink = (t + a.phase * 5) % period < 0.12;
      // The word being said now, when this character says it.
      const word =
        saying && (saying.speaker === id || (!saying.speaker && talksIn(id))) ? saying : null;
      const talk = word
        ? Math.sin((t - word.start) * 26) > -0.2
          ? (stream.indexOf(word) % 2) + 1
          : 0
        : 0;
      a.face(expression, { blink, talk }, change);

      const held = shot.hold?.[id];
      if (held) {
        const p = prop(`${id}:${held}`, held);
        if (p) {
          // The hand is inside the figure, which is scaled by its size: undo that, so the object keeps its size.
          p.scale.setScalar(p.userData.fit / a.size);
          p.rotation.set(Math.PI / 2, 0, 0);
          a.hand.add(p);
          p.visible = true;
        }
      }
    }

    // Things that move by physics, where the physics has them now (before it's worked out: where they were put).
    for (const body of physics?.things ?? []) {
      if (body.place !== place.name) continue;
      const p = prop(`thing:${body.key}`, body.prop);
      if (!p) continue;
      const now = sampleTrack(physics.tracks.get(body.key), t);
      p.position.copy(now.position);
      p.quaternion.copy(now.quaternion);
      scene.add(p);
      p.visible = true;
    }

    // A small object: on the place's surface (the table, the nightstand...).
    let object = null;
    if (shot.prop && PROPS[shot.prop]) {
      const p = prop(`${place.name}:${shot.prop}`, shot.prop);
      p.position.set(...place.surface);
      scene.add(p);
      p.visible = true;
      p.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(p);
      const size = box.getSize(new THREE.Vector3());
      object = {
        center: box.getCenter(new THREE.Vector3()),
        radius: size.length() / 2,
        height: size.y,
      };
    }

    scene.updateMatrixWorld(true);
    const focusId = shot.focus && who.includes(shot.focus) ? shot.focus : who[0];
    const ordered = focusId ? [focusId, ...who.filter((id) => id !== focusId)] : [];
    const end = start + seconds;
    // Walks in this shot: the camera follows a walker, holds where someone comes in (or where they leave from),
    // or pans (`move: "pan"`), always facing them the same way and without the bob of their steps.
    const shotMoves = motion.moves.filter(
      (m) => m.kind === "go" && who.includes(m.id) && m.t0 < end && m.t1 > start,
    );
    const moveFor = (id) => {
      const mine = shotMoves.filter((m) => m.id === id);
      return mine.find((m) => t >= m.t0 && t < m.t1) ?? mine.findLast((m) => m.t1 <= t) ?? mine[0];
    };
    const cameraMode = (move) =>
      shot.move === "follow" || shot.move === "pan"
        ? shot.move
        : move.enters
          ? "end"
          : move.exits
            ? "start"
            : "follow";
    /**
     * Where the camera frames someone's head at a time, from the plan (never from the drawn body, so every frame and
     * every render worker agrees), and which way they face: someone knocked down is framed where they stood until
     * they're down, then on the floor where they lie, rising as they get up.
     */
    const framing = (id, time) => {
      const a = actors.get(id);
      const st = personState(motion, index, id, time, layout) ?? states.get(id);
      const stage = st.act?.kind === "knocked" ? st.act.stage : null;
      if (stage) {
        const standing = a.size * a.headHeight;
        const low = a.size * 1.1;
        const falling = st.act.phase === "fall";
        const at = falling ? stage.from : stage.to;
        const y = falling
          ? standing
          : st.act.phase === "lie"
            ? low
            : lerp(low, standing, smooth(st.act.k));
        return {
          head: new THREE.Vector3(at.x, (st.y ?? 0) + y, at.z),
          rot: falling ? stage.fromRot : stage.rot,
        };
      }
      const drop = headDrop(st, a.size);
      return {
        head: new THREE.Vector3(st.x, (st.y ?? 0) + a.size * (a.headHeight + drop), st.z),
        rot: st.rot,
      };
    };
    const frameHead = (id, time) => framing(id, time).head;
    const subjectsAt = (time, panning = false) =>
      ordered.map((id) => {
        const a = actors.get(id);
        const move = moveFor(id);
        if (states.get(id)?.act?.kind === "knocked") {
          const f = framing(id, time);
          return {
            head: f.head,
            chest: f.head.clone().add(new THREE.Vector3(0, -1.6 * a.size, 0)),
            forward: new THREE.Vector3(Math.sin(f.rot), 0, Math.cos(f.rot)),
            size: a.size,
            lying: false,
          };
        }
        if (!move || a.lying) {
          return {
            head: a.headWorld(new THREE.Vector3()),
            chest: a.chestWorld(new THREE.Vector3()),
            forward: new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
            size: a.size,
            lying: a.lying,
          };
        }
        const mode = cameraMode(move);
        const at =
          mode === "end"
            ? move.t1 - 1e-3
            : mode === "start" || (mode === "pan" && panning)
              ? Math.max(move.t0, start)
              : time;
        const head = frameHead(id, at);
        return {
          head,
          chest: head.clone().add(new THREE.Vector3(0, -1.6 * a.size, 0)),
          forward: new THREE.Vector3(Math.sin(move.view), 0, Math.cos(move.view)),
          size: a.size,
          lying: false,
        };
      });
    const subjects = subjectsAt(t);
    // A view someone or something stands in (another person in a close shot, furniture in any shot): the camera turns
    // around the subject, or rises, to see past them. Checked at moments through the whole shot (a following camera
    // moves), from the plan, so every frame and every render worker agrees.
    let turnAndRise = viewTurns.get(index);
    if (turnAndRise === undefined) {
      turnAndRise = { turn: 0, rise: 0 };
      const kind = SHOT_TYPES[shot.shot] !== undefined ? shot.shot : "medium";
      if (kind !== "wide" && kind !== "insert" && ordered.length) {
        const close = kind === "close" || kind === "xclose";
        const stillAt = (time) =>
          ordered.map((id) => {
            const st = personState(motion, index, id, time, layout) ?? states.get(id);
            const f = framing(id, time);
            const move = moveFor(id);
            const rot = move && st.act?.kind !== "knocked" ? move.view : f.rot;
            return {
              head: f.head,
              chest: f.head.clone().add(new THREE.Vector3(0, -1.6 * actors.get(id).size, 0)),
              forward: new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)),
              size: actors.get(id).size,
              lying: st.posture === "lie" && !st.act,
            };
          });
        const moments = [0, 0.25, 0.5, 0.75, 0.98].map((k) => start + k * seconds);
        const samples = moments.map((time) => ({ time, still: stillAt(time) }));
        const costOf = (turn, rise) =>
          samples.reduce((sum, { time, still }) => {
            const look = fitInRoom(
              frameShot({
                shot,
                subjects: still,
                place,
                aspect: W / H,
                u: time - start,
                seconds,
                index,
                object,
                extraTurn: turn,
                extraRise: rise,
              }),
              layout,
            );
            const framed = close ? still.slice(0, 1) : still;
            // Someone else in the way: of the close shot's target, or of the one the shot is about.
            const others = still.slice(1);
            const people =
              (close && viewBlocked(look.position, look.target, others) ? 1 : 0) +
              (others.length && viewBlocked(look.position, still[0].head, others) ? 1 : 0);
            return sum + people + furnitureInView(place, look, W / H, framed);
          }, 0);
        // The first clear view, in this order; when none is clear, the least spoiled one.
        let best = Number.POSITIVE_INFINITY;
        found: for (const rise of [0, 0.3, 0.6]) {
          for (const turn of [0, 0.5, -0.5, 0.95, -0.95, 1.4, -1.4, 1.9, -1.9]) {
            const cost = costOf(turn, rise);
            if (cost < best - 1e-9) {
              best = cost;
              turnAndRise = { turn, rise };
            }
            if (cost === 0) break found;
          }
        }
      }
      viewTurns.set(index, turnAndRise);
    }
    const extraTurn = turnAndRise.turn;
    const extraRise = turnAndRise.rise;

    // Effects on the characters: popping in, jumping, dashing, squash and stretch. The camera frames them as
    // they stand, so a jump goes up in the picture.
    for (const id of who) {
      const a = actors.get(id);
      const state = actorState(events, index, t, id);
      if (state.hidden) {
        a.root.visible = false;
        continue;
      }
      a.root.scale.set(a.size * state.sx, a.size * state.sy, a.size * state.sx);
      if (state.lift) a.root.position.y += state.lift * 5.3 * a.size;
      if (state.slide) {
        const r = a.root.rotation.y;
        a.root.position.add(tmp.set(Math.cos(r), 0, -Math.sin(r)).multiplyScalar(state.slide));
      }
    }
    scene.updateMatrixWorld(true);

    // Inside the room, clear of furniture (a camera that would stand behind a wall moves in with a wider lens).
    const view = fitInRoom(
      frameShot({
        shot,
        subjects,
        place,
        aspect: W / H,
        u,
        seconds,
        index,
        object,
        extraTurn,
        extraRise,
      }),
      layout,
    );
    if (shot.move === "pan" && shotMoves.length) {
      // The camera stays where it framed the walk's start and turns to keep the walker in the picture.
      const from = fitInRoom(
        frameShot({
          shot,
          subjects: subjectsAt(t, true),
          place,
          aspect: W / H,
          u,
          seconds,
          index,
          object,
          extraTurn,
          extraRise,
        }),
        layout,
      );
      view.position.copy(from.position);
      view.focus = view.position.distanceTo(subjects[0]?.head ?? view.target);
    }
    const punch = cameraState(events, index, t);
    view.fov *= punch.zoom;
    if (punch.shake > 0) {
      const d = view.position.distanceTo(view.target) * 0.05 * punch.shake;
      view.target.add(tmp.set(wobble(t * 30, index) * d, wobble(t * 33, index + 5) * d, 0));
    }
    view.blur = Math.max(view.blur, punch.blur);
    camera.fov = view.fov;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    camera.position.copy(view.position);
    camera.up.copy(view.up);
    camera.lookAt(view.target);
    // The key, fill and rim lights around this shot's camera.
    const towardCamera = view.position.clone().sub(view.target).setY(0);
    if (towardCamera.lengthSq() < 1e-6) towardCamera.set(0, 0, 1);
    towardCamera.normalize();
    const around = (angle, distance, height) =>
      view.target
        .clone()
        .addScaledVector(
          towardCamera.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
          distance,
        )
        .add(new THREE.Vector3(0, height, 0));
    const strength = settings.fill ?? 1;
    const indoor = Boolean(place.indoor);
    key.position.copy(around(0.62, 16, 11));
    key.target.position.copy(view.target);
    key.castShadow = indoor && look !== "draft";
    key.intensity = strength * (indoor ? (place.light === "night" ? 1.0 : 1.35) : 0.45);
    fill.position.copy(around(-0.95, 14, 3));
    fill.target.position.copy(view.target);
    fill.intensity = strength * (indoor ? 0.32 : 0.2);
    rim.position.copy(around(Math.PI - 0.35, 14, 10));
    rim.target.position.copy(view.target);
    rim.intensity = strength * (place.light === "night" ? 0.9 : 0.7);

    // Heads: people look at whoever talks (turning from the one before), everyone looks at someone walking,
    // `look` says who looks at whom, and in closer shots the others look toward the camera.
    const type = shot.shot ?? (who.length ? "medium" : "wide");
    const toCamera = ["close", "xclose", "medium", "low"].includes(type) && shot.look !== "away";
    const looks = shot.look && typeof shot.look === "object" ? shot.look : {};
    const talking = speakerAt(t);
    const walker = who.find((id) => states.get(id)?.move?.kind === "go");
    let turned = false;
    for (const id of ordered) {
      const a = actors.get(id);
      const st = states.get(id);
      if (!a.root.visible || a.lying || st.move?.kind === "go") continue;
      const head = a.headWorld(new THREE.Vector3());
      const angleTo = (other) => {
        const b = other !== id ? actors.get(other) : null;
        if (!b?.root.visible || !who.includes(other)) return null;
        const there = b.headWorld(new THREE.Vector3());
        return wrapAngle(Math.atan2(there.x - head.x, there.z - head.z) - a.root.rotation.y);
      };
      let angle = null;
      if (typeof looks[id] === "string") angle = angleTo(looks[id]);
      else if (walker && walker !== id) angle = angleTo(walker);
      else if (talking.id && talking.id !== id) {
        const now = angleTo(talking.id);
        const before = talking.before ? (angleTo(talking.before) ?? 0) : 0;
        angle = now === null ? null : lerp(before, now, talking.k);
      }
      if (angle !== null) {
        angle = clamp(angle * 0.9, -1.1, 1.1);
      } else if (toCamera) {
        const toCam = camera.position.clone().sub(head);
        angle = clamp(
          wrapAngle(Math.atan2(toCam.x, toCam.z) - a.root.rotation.y) * 0.55,
          -0.7,
          0.7,
        );
      } else continue;
      a.apply({ ...a.pose, headY: (a.pose.headY ?? 0) + angle });
      turned = true;
    }
    if (turned) scene.updateMatrixWorld(true);

    effects.render({
      t,
      focus: view.focus,
      aperture: (APERTURE[type] ?? 0.0006) * (settings.focusAmount ?? 1),
      blur: view.blur,
      blurDir: index % 2 ? 1 : -1,
    });

    // The 2D layer: extras, then captions on top.
    const headAt = (id) => {
      const a = actors.get(id);
      if (!a?.root.visible) return null;
      const head = a.headWorld(new THREE.Vector3());
      const top = head.clone().add(new THREE.Vector3(0, 0.66 * a.size, 0));
      const p = head.clone().project(camera);
      const q = top.project(camera);
      if (p.z > 1) return null;
      const x = ((p.x + 1) / 2) * W;
      const y = ((1 - p.y) / 2) * H;
      const r = Math.hypot(((q.x + 1) / 2) * W - x, ((1 - q.y) / 2) * H - y);
      return { x, y, r };
    };
    // The ground around someone's feet, on screen (magic rings, dust).
    const ringAt = (on, radius, n) => {
      // Around someone, or around a point on the ground (where a run started).
      const a = typeof on === "string" ? actors.get(on) : null;
      const center = a ? a.root.position : on;
      const size = a ? a.size : 1;
      if (!center || radius <= 0) return null;
      const points = [];
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const p = new THREE.Vector3(
          center.x + Math.cos(angle) * radius * 2.2 * size,
          (center.y || 0) + 0.05,
          center.z + Math.sin(angle) * radius * 2.2 * size,
        ).project(camera);
        if (p.z > 1) return null;
        points.push([((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H]);
      }
      return points;
    };
    drawOverlays(
      ctx,
      { ...shot, icons: (shot.icons ?? []).filter((i) => !FX_ICONS.has(i?.icon ?? i)) },
      u,
      W,
      H,
      headAt,
      focusId,
    );
    drawEffects(ctx, events, index, t, { W, H, headAt, ringAt, focus: focusId });
    drawCaptions(ctx, words, t, W, H, settings.captions);
  }

  const font = new FontFace("Blocky Caption", "url(assets/fonts/Poppins-ExtraBoldItalic.ttf)", {
    weight: "800",
    style: "normal",
  });
  // Ready once the caption font, the voices and the physics are in, and the film is planned and simulated.
  const ready = Promise.all([
    font.load().then((loaded) => {
      document.fonts.add(loaded);
    }),
    Promise.all([loadVoices(), loadPhysics()]).then(([lines, createWorld]) =>
      build(lines, createWorld),
    ),
  ]);

  return {
    ready,
    render,
    /** The story's length in seconds (after `ready`: with the voices). */
    get duration() {
      return duration;
    },
    /** The effects' sounds, for the timeline's Effects lane: `[{ key, sound, t, volume }]`. */
    get sounds() {
      return sounds;
    },
    /** The places this engine can show (the Sheets tab lists them). */
    places: PLACE_NAMES,
    /** The effects, timed (for sheets and tests). */
    get effects() {
      return events;
    },
    /** Where everyone is and how they move, with the problems found (for the Moves sheet and tests). */
    get motion() {
      return motion;
    },
    /** The film's physics (simulation.js), with its problems and timings. */
    get physics() {
      return physics;
    },
    /** Someone's whole body at a moment (figure.js), for sheets and tests. */
    figureAt: (index, id, t) => figureAt(figures(), index, id, t),
    get scenes() {
      return scenes.map(({ name, start, end }) => ({ name, start, end }));
    },
    lights: LIGHTS,
  };
}
