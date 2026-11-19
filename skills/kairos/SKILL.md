---
name: kairos
description: How Kairos films work and how to change them safely. Use whenever you work in a Kairos film folder (it has kairos.json and a page that defines window.renderOut), when the user asks you to fix their frame notes, or when you add scenes to a film.
---

# Working on a Kairos film

Kairos is the user's local video studio. A **film** is a web page that draws any frame on request. Kairos shows it
live, collects the user's frame notes, and later renders it to a video file by drawing every frame.

## The film folder

```
kairos.json   title, width, height (pixels), fps (1 to 120), duration (seconds), status, audio
index.html    the page, built at exactly width × height (Kairos scales the preview itself)
film.js       defines window.renderOut(t)
assets/       images, fonts, sounds
.kairos/      notes and their pictures: managed by Kairos, never edit by hand
```

## The contract: `window.renderOut(t)`

- `t` is the time in seconds, from 0 to `duration`. The function draws that exact frame.
- **It must depend only on `t`.** Kairos asks for frames in any order, jumps around, and renders frames one by one.
  Never use `Date.now()`, `performance.now()`, `requestAnimationFrame` loops, `setTimeout`, unseeded
  `Math.random()`, CSS animations or transitions, or `<video>` playing on its own.
- It may be `async` (return a Promise): for example to wait for an image to decode or a video to seek.
- Anything that must load first goes in `window.READY = (async () => { ... })()`. Kairos waits for it, and for
  fonts, before the first frame. Set `window.READY` right away, before any `await`.
- Optional scene markers for the Kairos timeline: `window.KAIROS_SCENES = [{ name, start, end }]` (seconds).

Helpers that keep motion deterministic:

```js
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
/** 0 before `start`, 1 after `end`, eased in between. */
const progress = (t, start, end, ease = easeInOutCubic) => ease(clamp((t - start) / (end - start)));
const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOutBack = (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

/** Seeded random numbers: the same seed always gives the same sequence. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
```

## Fixing the user's notes

When the Kairos tools are connected:

1. `kairos_status`: check the film and how many notes are open.
2. `kairos_notes`: read the open notes. Each has a time (or a range), the user's words, the marks they drew (in
   film pixels, the same coordinates as the page) and a **picture of the marked frame**. Look at the picture: the
   marks show exactly what they mean.
3. Change the film. Keep the change to what the note asks.
4. `kairos_frame` at the note's time to check it. For a range note, check its start, middle and end. The tool also
   returns any error the film throws.
5. `kairos_note_update` with `status: "fixed"`, only once you have seen the frame and it is right.
6. Tell the user what you changed, note by note. If a note is unclear, ask rather than guess.

## Sound

Sound files live in the film folder (for example `audio/`) and are listed in `kairos.json`:

```json
"audio": [
  { "file": "audio/music.mp3", "volume": 0.5 },
  { "file": "audio/voice.wav", "start": 1.2 }
]
```

- `start`: when the track begins on the film's timeline, in seconds (default 0).
- `volume`: 0 to 2 (default 1). Put music under a voice at about 0.3-0.5.
- A single `"audio": "file.mp3"` also works.

Kairos plays the tracks in step with the preview and mixes them into the rendered MP4, cut at the film's
`duration`. The page itself never plays sound: Kairos does. Time the picture to the sound (a beat, a word) with
`start` values and constants in `film.js`, not with timers.

## Making the video

When the user asks for the video file, `kairos_render` puts the film in the render queue (an MP4 in
`renders/`, a new version each time, never overwritten). Rendering draws every frame, so a film that throws on any
frame fails: check a few frames with `kairos_frame` first. Follow it with `kairos_renders`, which also shows the
reason when a render fails (the frame and the error).

## Longer films: one file per scene

Past about 20 seconds, split the film into scenes so each part stays easy to change:

```
stage.js              the shared canvas (or three.js renderer) that every scene draws on
scenes/01-intro.js    export default { name: "Intro", duration: 4, draw(t) { ... } }
scenes/02-street.js   ...
film.js               imports the scenes, lays them end to end, and calls the right one
```

```js
import intro from "./scenes/01-intro.js";
import street from "./scenes/02-street.js";

const SCENES = [intro, street];
let start = 0;
const timeline = SCENES.map((scene) => {
  const entry = { scene, start, end: start + scene.duration };
  start = entry.end;
  return entry;
});
window.KAIROS_SCENES = timeline.map(({ scene, start, end }) => ({ name: scene.name, start, end }));
window.renderOut = async (t) => {
  const entry = timeline.find((item) => t < item.end) ?? timeline.at(-1);
  await entry.scene.draw(t - entry.start); // each scene gets its own local time, from 0
};
```

Load `film.js` with `<script type="module">` for this. When the total length changes, update `duration` with
`kairos_film_settings` (or in `kairos.json`).

## 3D

Kairos serves three.js to every film. Add this import map to `index.html`, then `import * as THREE from "three"`:

```html
<script type="importmap">
  { "imports": { "three": "/__kairos/lib/three/build/three.module.js",
                 "three/addons/": "/__kairos/lib/three/examples/jsm/" } }
</script>
```

The kairos-3d skill has the details.

## Before you say you're done

- Look at real frames with `kairos_frame`: the first frame, each scene change, the big moment and the last frame.
- `renderOut` should draw a frame quickly (well under a second): the render draws every frame of the film.
- Don't change `width` or `height` without updating the page to match.
- Never write to `.kairos/`. Notes change only through the Kairos tools.

For the craft of the video itself, use the other Kairos skills when they fit: kairos-directing (idea, shots,
rhythm), kairos-camera (framing, lenses, camera moves), kairos-3d (three.js) and kairos-captions (on-screen words).
