---
name: kairos-camera
description: Camera language for Kairos films - shot sizes, lenses (focal length in mm), camera moves and depth of field, with three.js code. Use when placing or animating a camera in a 3D film, choosing how to frame a shot, or when the user mentions a lens, mm, wide shot, close-up, dolly, orbit, push-in or a "cinematic camera".
---

# Camera and lens

## What each lens does

Focal length (in mm, full-frame equivalent) decides how much the camera sees and how space feels. A longer lens
gives a **tighter** shot from the same place, not a wider one.

| Lens | Name | What it does |
|------|------|--------------|
| 14-24 mm | wide | Everything fits. Space feels big, lines stretch toward the edges. Dramatic when close to a subject. |
| 35 mm | natural wide | Storytelling: the person and their world together. |
| 50 mm | medium | What your eyes see. Neutral, honest. |
| 85 mm | portrait | The background melts away. Flattering faces, the subject stands apart. |
| 135 mm | close-up | Only the face. Strong separation, intimate. |
| 200 mm+ | long | From across the field: the background is compressed, it looks big and close behind the subject. Watching from afar. |

**Compression:** to keep a subject the same size with a longer lens, move the camera back. The subject stays the
same, but the background grows and flattens behind it. To make a mountain or the moon loom behind a character,
use a long lens from far away.

## Shot sizes

| Shot | Shows | Use it for |
|------|-------|-----------|
| extreme wide | the whole place, the subject tiny | where are we, scale, loneliness |
| wide | the full subject and the space around | establishing, action |
| medium | waist up | dialogue, gestures |
| close-up | the face | feelings, reactions |
| insert | a detail (a clock, a hand, a letter) | story information |

Cut between sizes to give rhythm: wide → medium → close-up, and back out for a reveal.

## Lenses in three.js

```js
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);
camera.filmGauge = 36; // full-frame, so focal lengths behave like on a real camera
camera.setFocalLength(85);

/** Distance at which an object `height` tall fills `fill` (0-1) of the frame height. */
function distanceFor(height, fill = 0.8) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  return height / fill / 2 / Math.tan(vFov / 2);
}
```

For vertical films (9:16), three.js applies the film gauge to the long side, which matches how phones are held.

**Dolly zoom** (the background seems to rush toward or away from the subject): change the focal length and the
distance together so the subject keeps its size: `distance = startDistance * focal / startFocal`.

## Camera moves

A still camera is a choice too: most shots should hold, or move slowly. Every move needs a reason.

| Move | Feeling |
|------|---------|
| push-in | realisation, intimacy, tension rising |
| pull-out | reveal, loneliness, the end |
| dolly / track | following, being there |
| orbit | showing an object or a moment from all sides |
| crane / pedestal | revealing scale, rising hope (up) or weight (down) |
| handheld | urgency, documentary feeling (keep it subtle) |

Every move is a function of `t`, eased, with a short hold at the start and the end:

```js
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const progress = (t, start, end) => ease(Math.min(1, Math.max(0, (t - start) / (end - start))));
const from = new THREE.Vector3(0, 1.6, 9);
const to = new THREE.Vector3(0, 1.5, 4);
const target = new THREE.Vector3(0, 1.4, 0);

function placeCamera(t) {
  camera.position.lerpVectors(from, to, progress(t, 0.5, 4.5)); // push-in from 0.5 s to 4.5 s
  camera.lookAt(target);
}
```

For curved paths use `new THREE.CatmullRomCurve3(points)` and `curve.getPointAt(progress(...))`.

**Handheld feel** from seeded noise (never `Math.random()` in `renderOut`):

```js
function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/** Smooth noise between -1 and 1. Same x and seed, same value. */
function noise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(i * 374761393 + seed * 668265263) * 2 - 1;
  const b = hash((i + 1) * 374761393 + seed * 668265263) * 2 - 1;
  return a + (b - a) * s;
}
// after placing the camera: a few millimetres and a fraction of a degree are enough
camera.position.x += noise(t * 0.8, 1) * 0.01;
camera.position.y += noise(t * 0.8, 2) * 0.008;
camera.rotation.z += noise(t * 0.5, 3) * 0.003;
```

## Depth of field

A shallow focus isolates the subject, like the 85-135 mm shots. With post-processing:

```js
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 5, aperture: 0.002, maxblur: 0.01 });
composer.addPass(bokeh);
composer.addPass(new OutputPass());

// in renderOut(t), after moving things:
bokeh.uniforms.focus.value = camera.position.distanceTo(subject.position);
composer.render();
```

A cheaper alternative is fog (`scene.fog = new THREE.Fog(color, near, far)`), which fades the background and adds
depth layers.

## Framing rules

- Eyes on the upper third. Leave room in front of the face in the direction the character looks or moves.
- Two characters talking: keep the camera on one side of the line between them (the 180° rule), so they keep
  facing each other across cuts.
- Match eye level to the feeling: low camera (looking up) makes a subject strong; high camera makes it small.
- Check each shot with `kairos_frame` at its start, middle and end: is the subject where the eye lands?
