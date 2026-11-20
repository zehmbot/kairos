---
name: kairos
description: How Kairos films work and how to change them safely. Use whenever you work in a Kairos film folder (it has kairos.json and a page that defines window.renderOut), when the user asks you to fix their frame notes, or when you add scenes to a film.
---

# Working on a Kairos film

Kairos is the user's local video studio. A **film** is a web page that draws any frame on request. Kairos shows it
live, collects the user's frame notes, and later renders it to a video file by drawing every frame.

## Start from the brief

If the film folder has `brief.md`, read it before anything else: it is what the user asked for when they
made the film (their idea, script, or answers to the template's questions). Build the film from it, and keep
to it when you change things later. The user can edit it in Kairos; read it again when they say they did.

## The film folder

```
kairos.json   title, width, height (pixels), fps (1 to 120), duration (seconds), status, audio
brief.md      what the user asked for (when the film was made from a template's form)
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
- Optional `window.KAIROS_LENGTH` (seconds), for a film that works out its own length (set both before
  `window.READY` settles). Kairos shows when it differs from `duration`, and `kairos_frame` says so too.

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

## Video clips

The user's own videos and pictures (a real shot, a logo, a screenshot) go over the film as clips, listed in
`kairos.json`. Kairos draws them: in the preview, in frame pictures and in the video. The film page never does.

```json
"video": [
  { "file": "assets/videos/street.mp4", "start": 4, "from": 1, "length": 3 },
  { "file": "assets/images/logo.png", "start": 0, "length": 12, "size": 0.18, "x": 0.89, "y": 0.84 }
]
```

- `start` and `length`: when it shows on the film, in seconds. A picture needs a `length`; a video plays to
  its end when it has none. `from`: where in the video it starts.
- `size`: its box's width as a share of the film's width (1 = the whole frame, the default: a cut-away). The box
  has the film's shape, centered at `x`, `y` (0 to 1 across and down).
- `fit`: `"fill"` (the default) covers the box, cropping the clip; `"fit"` shows it whole, with the film around.
- `opacity` (0 to 1), `fade` (seconds in and out), and for videos `volume` (0 to 2) and `muted`.
- `lane`: its video track; higher tracks draw over lower ones.
- Put files in with `kairos_use_asset` (with `start`, it also places the clip), or copy them into `assets/`.

The user moves, trims and sets clips on the timeline: keep them as they are unless asked.

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
- `from` and `length` (seconds, optional): trim the file. It plays from `from` seconds into the file, for
  `length` seconds (left out: to the end of the file).
- `lane` (optional): which track the clip sits on in the Kairos timeline (0 = the first). Several clips can
  share a lane, like a voice track with many lines.
- `muted` (optional): the clip stays in the film but makes no sound.
- A single `"audio": "file.mp3"` also works.

The user sees and edits these on the timeline under the preview (move, trim, mute), so keep them as they are
unless asked to change the sound.

Kairos plays the tracks in step with the preview and mixes them into the rendered MP4, cut at the film's
`duration`. The page itself never plays sound: Kairos does. Time the picture to the sound (a beat, a word) with
`start` values and constants in `film.js`, not with timers.

## Voices

Kairos makes spoken lines with fish.audio. **They cost the user's credits:** make them when the brief says
"Voices: make them with the film" or when the user asks for a voice. Choosing voices is free.

1. **Cast** with `kairos_voices` and `cast`: every speaker and its type (`narrator`, `woman`, `man`, `girl`,
   `boy`, `old-woman`, `old-man`). Kairos picks a fitting voice for each one without a voice, and a character
   keeps its voice from film to film. Use short names in small letters (`narrator`, `ruby`, `grandpa-bo`).
   `choose` sets a voice yourself: only when the user names one. A narrator the user chose in New film is
   already there: keep it.
2. **Write the script** with `kairos_script` and `lines`: every line with its speaker, words and `start` (seconds
   on the film), in time order. `lines` replaces the whole script: read it first, and keep the lines marked
   "by the user" unless they ask you to change them.
   - One line per sentence or beat, so shots and captions can follow them.
   - About 2.5 words per second: a line must end before the next one starts.
3. **Make the voices** with `kairos_script` and `make: true`.
   - Each line becomes `voice/<speaker>-<n>.mp3`, with its word timings in `voice/<speaker>-<n>.words.json`, and
     is placed at its start (after the line before when they would overlap).
   - The answer gives each line's real start, length and every word as `word@seconds` on the film.
   - Unchanged lines are reused: writing the script again with new starts and making it again costs nothing.
4. **Fit the film to the voices:** give each line its moment (move scenes or shots to the real starts), and set
   `duration` to cover the last line (`kairos_film_settings`). For captions, read `voice/*.words.json` (see the
   `kairos-captions` skill).

`kairos_say` makes a single line and places it after the voice lines already there; it joins the script.
`kairos_words`
gives the word timings of any sound in the film; for the user's own recording it can ask fish.audio's
speech-to-text (`transcribe: true`, uses credits).

The user sees all of this in the film page's Voice tab: who speaks, one list of every line (each tagged Claude or
You, and whether its voice is made or out of date), and **Write with Claude**, which runs Claude in the background
to write the lines.

## References and assets

- **References** are videos and pictures the user likes, added on the film page (they live in `references/`).
  `kairos_references` shows each one with the user's note (what to take from it), its length, shot count and
  shot lengths, and frame sheets: one picture from the middle of each shot, left to right, top to bottom. Look
  at them before building or restyling a film, take the style (pace, framing, light, type), never the content.
- **Assets** are the user's own files shared by all films (Assets page). `kairos_assets` lists them;
  `kairos_use_asset` copies one into the film (`assets/images/...`, `assets/fonts/...`) and gives its path. A
  sound becomes a sound track in `kairos.json`.
- The user can also add sounds on the film page (Sound panel): they appear in `kairos.json` `audio`.

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
Films made with the Blocky template (a `story.js` and a `blocky/` folder) are directed with kairos-blocky.
