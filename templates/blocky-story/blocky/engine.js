// The Blocky Story engine: turns the shot list in story.js into frames. The narration never stops: shots cut on
// its words (timing.js), and effects (fx.js) land on them. renderOut(t) is a pure function of t.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { drawCaptions } from "./captions.js";
import { BLOCKY_CAST } from "./cast.js";
import { makeCharacter } from "./characters.js";
import { createEffects } from "./effects.js";
import {
  actorState,
  cameraState,
  drawEffects,
  effectSounds,
  moveEffects,
  planEffects,
} from "./fx.js";
import { layoutOf } from "./layouts.js";
import { composePose, headDrop, personState, planMotion, poseFor, wrapAngle } from "./motion.js";
import { drawOverlays } from "./overlays.js";
import { getPlace, LIGHTS } from "./places.js";
import { poseAt, TRAVEL } from "./poses.js";
import { PROPS } from "./props.js";
import { frameShot, SHOT_TYPES, viewBlocked } from "./shots.js";
import { fitSize, SIZES } from "./sizes.js";
import { planStory } from "./timing.js";
import { clamp, hash, lerp, smooth, wobble } from "./util.js";
import { loadVoices } from "./voice.js";

const SKY = {
  day: { top: "#5d9fe6", horizon: "#d6ecff" },
  evening: { top: "#33337a", horizon: "#ff9d6a" },
  night: { top: "#04081a", horizon: "#1a2a5c" },
};

/** The sky dome (gradient, stars and a moon at night); the Places sheet uses it too. */
export function makeSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 1.6 + 0.1, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.8)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  // Stars and a moon for nights.
  const stars = new THREE.BufferGeometry();
  const points = [];
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 1400; i++) {
    const a = random() * Math.PI * 2;
    const y = 0.08 + random() * 0.92;
    const r = Math.sqrt(1 - y * y);
    points.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
  }
  stars.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const starField = new THREE.Points(
    stars,
    new THREE.PointsMaterial({ color: "#ffffff", size: 1.4, sizeAttenuation: false, fog: false }),
  );
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(12, 24, 16),
    new THREE.MeshBasicMaterial({ color: "#fff6dc", fog: false }),
  );
  moon.position.set(-120, 190, -260);
  const sky = new THREE.Group();
  sky.add(dome, starField, moon);
  return {
    group: sky,
    set(preset) {
      material.uniforms.top.value.set(SKY[preset].top);
      material.uniforms.horizon.value.set(SKY[preset].horizon);
      starField.visible = preset === "night";
      moon.visible = preset === "night";
    },
  };
}

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
  const sky = makeSky();
  scene.add(sky.group);
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 900);
  const effects = createEffects(renderer, scene, camera, W, H, settings);
  // A soft light from the camera side, so faces never fall into darkness (a fill light, as on a film set).
  const fill = new THREE.DirectionalLight("#fff4e6", 0.45);
  scene.add(fill, fill.target);

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
  let motion = { entries: [], moves: [], problems: [] };
  /** How far each close shot's camera turns to see past someone in the way (worked out once per shot). */
  let viewTurns = new Map();

  function build(lines) {
    const plan = planStory(shots, lines);
    duration = plan.duration;
    stream = plan.words;
    timeline = plan.entries;
    // Where everyone is, their walks, and the dust and patter of runs.
    const placesOf = [];
    for (const entry of timeline) placesOf.push(entry.shot.place ?? placesOf.at(-1) ?? "home");
    motion = planMotion(timeline, {
      aspect: W / H,
      sizeOf: (id) => cast[id]?.size ?? 1,
      isCharacter: (id) => Boolean(cast[id]),
      placeOf: (_entry, i) => placesOf[i],
    });
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
    scene.fog = place.fog ? new THREE.Fog(place.fog.color, place.fog.near, place.fog.far) : null;
    renderer.toneMappingExposure = place.exposure * (settings.exposure ?? 1);
    scene.environmentIntensity = place.env;
    place.update(t);

    // Characters: where they are, their pose and their face.
    for (const a of actors.values()) a.root.visible = false;
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
    // Gestures on the shot's key words, and a nod at the end of a sentence (talking poses).
    const cueFor = (id, phase) => {
      const mine = entry.words.filter(
        (w) => w.speaker === id || ((!w.speaker || !cast[w.speaker]) && talksIn(id)),
      );
      if (!mine.length) return undefined;
      const shift = phase * 3 - start;
      const keys = mine.filter((w) => w.key);
      const beats = (keys.length ? keys : mine.filter((_, i) => i % 4 === 1)).map(
        (w) => w.start + shift,
      );
      const nods = mine.filter((w) => /[.!?…]["')\]]*$/.test(w.text)).map((w) => w.end + shift);
      return { beats, nods };
    };
    for (const id of who) {
      const a = actor(id);
      const st = states.get(id);
      const s = a.size;
      const poseName = poseFor(entry, id, st.posture);
      if (st.hidden) {
        // Not in the picture yet (they come in later in the shot).
        a.root.visible = false;
        continue;
      }
      a.root.position.set(st.x, st.y, st.z);
      a.root.rotation.set(0, st.rot, 0);
      const uPose = u + a.phase * 3;
      if (!st.act && !st.lastMove && TRAVEL[poseName]) {
        // A gait pose without a walk goes straight ahead at its speed, its feet planted.
        const travel = TRAVEL[poseName] * u * s;
        a.root.position.x += Math.sin(st.rot) * travel;
        a.root.position.z += Math.cos(st.rot) * travel;
      }
      const pose = composePose(st, poseAt(poseName, uPose, a.phase, cueFor(id, a.phase)), {
        idle: () => poseAt("idle", uPose, a.phase),
        size: s,
        t,
        poseTime: uPose,
        phase: a.phase,
      });
      a.pose = pose;
      a.lying = st.posture === "lie" && !st.act;
      a.apply(pose);
      a.root.visible = true;

      // Faces: the shot's expression, blinking, and a talking mouth on spoken words.
      const expression = shot.face?.[id] ?? "neutral";
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
      a.face(expression, { blink, talk });

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
    const frameHead = (id, time) => {
      const a = actors.get(id);
      const st = personState(motion, index, id, time, layout) ?? states.get(id);
      const drop = headDrop(st, a.size);
      return new THREE.Vector3(st.x, (st.y ?? 0) + a.size * (a.headHeight + drop), st.z);
    };
    const subjectsAt = (time, panning = false) =>
      ordered.map((id) => {
        const a = actors.get(id);
        const move = moveFor(id);
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
    // A close shot whose view someone else stands in: the camera turns around the focus to see past them. Worked
    // out from where everyone stands as the shot starts, so every frame (and every render worker) agrees.
    let extraTurn = viewTurns.get(index);
    if (extraTurn === undefined) {
      extraTurn = 0;
      const kind = SHOT_TYPES[shot.shot] !== undefined ? shot.shot : "medium";
      if ((kind === "close" || kind === "xclose") && ordered.length > 1) {
        const still = ordered.map((id) => {
          const st = personState(motion, index, id, start, layout) ?? states.get(id);
          const rot = moveFor(id)?.view ?? st.rot;
          return {
            head: frameHead(id, start),
            forward: new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)),
            size: actors.get(id).size,
            lying: st.posture === "lie",
          };
        });
        for (const turn of [0, 0.5, -0.5, 0.95, -0.95]) {
          const look = frameShot({
            shot,
            subjects: still,
            place,
            aspect: W / H,
            u: 0,
            seconds,
            index,
            object,
            extraTurn: turn,
          });
          if (!viewBlocked(look.position, look.target, still.slice(1))) {
            extraTurn = turn;
            break;
          }
        }
      }
      viewTurns.set(index, extraTurn);
    }

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

    const view = frameShot({
      shot,
      subjects,
      place,
      aspect: W / H,
      u,
      seconds,
      index,
      object,
      extraTurn,
    });
    if (shot.move === "pan" && shotMoves.length) {
      // The camera stays where it framed the walk's start and turns to keep the walker in the picture.
      const from = frameShot({
        shot,
        subjects: subjectsAt(t, true),
        place,
        aspect: W / H,
        u,
        seconds,
        index,
        object,
        extraTurn,
      });
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
    fill.position.copy(view.position).add(new THREE.Vector3(0, 2, 0));
    fill.target.position.copy(view.target);
    fill.intensity = (settings.fill ?? 1) * (place.light === "day" ? 0.25 : 0.45);

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
  const ready = Promise.all([
    font.load().then((loaded) => {
      document.fonts.add(loaded);
    }),
    loadVoices().then(build),
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
    /** The effects, timed (for sheets and tests). */
    get effects() {
      return events;
    },
    /** Where everyone is and how they move, with the problems found (for the Moves sheet and tests). */
    get motion() {
      return motion;
    },
    get scenes() {
      return scenes.map(({ name, start, end }) => ({ name, start, end }));
    },
    lights: LIGHTS,
  };
}
