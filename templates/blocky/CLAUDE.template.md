# {{title}}

This folder is a Kairos film made with the **Blocky** template: a narrated story told in quick shots, with
blocky toy characters, cinematic light and word-by-word captions. Kairos plays it live while you work, and the
preview reloads by itself every time a file here is saved.

## Make the film from the brief

1. Read `brief.md`: the user's story and their answers (characters, place, mood). If the film has references,
   look at them with `kairos_references`: their notes say what to take from each (pace, shots, faces...).
2. Write the shot list in `story.js` (format below). Normally it is the only file you change.
3. Look at frames with `kairos_frame` (a few per place, every new face or pose) and fix what looks wrong.
4. Set the length with `kairos_film_settings` (`duration` = the sum of all `seconds`, rounded to 0.1 s).

**Characters:**

- **"Keep the Blocky cast"** (the default): use only the cast.
- **"Make new characters for this story":** describe new ones in `CAST` (same blocky style). Give them their own
  colors and hair, and keep each one looking the same through the whole film.

**Main character, place and mood:** follow the brief. With "Let Claude choose", pick the place that fits the
story.

The `kairos-blocky` skill has the full style guide (pacing, shot choice, faces). Use it.

## story.js

```js
export const CAST = {}; // new characters for this film (the Blocky cast is always there)
export const SETTINGS = {}; // captions and the finishing look
export const SHOTS = [
  /* played one after the other */
];
```

### A shot

```js
{
  place: "home",            // home, bedroom, school, town, park, forest (kept from the shot before when left out)
  light: "evening",         // day, evening, night (each place has its own default)
  shot: "close",            // wide, full, medium, close, xclose, ots, low, high, insert
  who: ["milo", "ruby"],    // who is in the shot; the first one is the focus
  focus: "ruby",            // optional: who the camera is about
  at: { milo: "sofaL" },    // optional: a spot in the place (see below)
  turn: { milo: 0.4 },      // optional: turn someone (radians)
  pose: { milo: "sit" },    // see poses
  face: { milo: "shocked" },// see faces
  talk: "milo",             // whose mouth moves with the words (a name or a list)
  hold: { milo: "phone" },  // something in the right hand (see props)
  prop: "letter",           // an object on the place's table or surface (use with shot: "insert")
  icons: ["!", { icon: "heart", on: "ruby" }],
  labels: { ruby: "625 days" }, // green text over a head
  big: "x40 / WEEK",        // big see-through words in the upper part
  say: "and then *nobody* laughed.", // the narration for this shot (*key words* stay yellow)
  seconds: 2.2,
  move: "push",             // hold, push, pull, drift, orbit, rise, zoom, shake
  angle: "left",            // front, left, right, side, sideR, back
  whip: true,               // start with a fast blurred swing (between moments)
  look: "away",             // characters don't turn their heads to the camera
}
```

- **Characters:**
  - **Blocky cast:**
    - `milo`: 12, the usual narrator, orange hoodie;
    - `ruby`: 8, his sister, red buns, overalls;
    - `bo`: Grandpa, beard, glasses, cardigan;
    - `nadia`: Mom, ponytail, yellow sweater;
    - `theo`: Dad, green check shirt;
    - `zee`: Milo's best friend, teal beanie.
  - **New characters** (in `CAST`), with these fields:
    - `name`, `size` (1 = adult, 0.75 to 0.9 for kids), `skin`;
    - `hair`: short, messy, curly, bob, long, ponytail, buns, sides, spiky, bald;
    - `hairColor`, `hat` (beanie, cap, beret), `hatColor`;
    - `top`: plain, hoodie, overalls, cardigan, sweater, tee, check, stripes;
    - `shirt`, `shirt2`, `sleeves` (long, short), `pants`, `shoes`;
    - `beard` (a color);
    - `features` (`glasses`, `freckles`, `lashes`).
- **Spots:**
  - **Every place:** `center`, `left`, `right`, `back`.
  - **Extra spots:**
    - **home:** `front`, `door`, `window`, `sofa`, `sofaL`, `sofaR`;
    - **bedroom:** `window`, `bed` (lying), `bedSit`, `desk`;
    - **school:** `front`, `lockerL`, `lockerR`;
    - **town:** `road`, `far`;
    - **park:** `slide`, `bench`;
    - **forest:** `fire`, `cabin`, `logL`, `logR`.
  - **Without `at`:**
    - one person stands in the center;
    - two face each other;
    - three or more stand in an arc;
    - sitting poses use the place's seats, lying poses its bed.
- **Poses:**
  - **standing:** idle, talk, wave, point, cheer, shrug, cry, scared, think, facepalm, hug, angry, laugh, dance,
    jump;
  - **moving forward:** walk, run, sneak;
  - **sitting:** sit, sitTalk, sitSad;
  - **lying:** lie, sleep, faint.
- **Faces:** neutral, happy, grin, laugh, sad, crying, shocked, scared, angry, furious (red face), smug, sleepy,
  dizzy, love, embarrassed, thinking, suspicious. Eyes blink by themselves.
- **Icons:** music, heart, ?, !, zzz, sparkle, sweat, anger, idea.
- **Props:** letter, phone, cake, gift, book, ball, key, cup, photo, trophy, megaphone.
- **SETTINGS:**
  - `captions: { style, highlight, key, position, size }`:
    - `style`: "words" (2-3 words, the spoken one in yellow), "lines" (two lines, key words in color) or "none";
    - `position`: 0.64 = 64% down the frame.
  - The finishing look: `focusBlur`, `focusAmount`, `glow`, `vignette`, `grain`, `exposure`.

### Timing

Captions follow `say`: the words are spread over the shot, longer words and pauses after commas take longer. About
2.5 words per second sounds natural. A shot without `say` is a silent picture (wide shots, reactions).

## The engine

`blocky/` builds everything:

- **the cast:** `cast.js`;
- **figures and faces:** `characters.js`, `faces.js`;
- **poses and places:** `poses.js`, `places.js`;
- **objects:** `props.js`;
- **the camera:** `shots.js`;
- **captions and extras:** `captions.js`, `overlays.js`;
- **the look:** `effects.js`;
- **the timeline:** `engine.js`.

Change it only when the story needs something it doesn't have (a new place, a pose, a prop). Keep
`renderOut(t)` a pure function of `t`: no timers, clocks or unseeded random numbers. Our characters and world
are our own: never use a game's or brand's name, logos, avatars or another creator's characters.

## Files

- `kairos.json`: title, size, `fps`, `duration` (must match the shot list), `status`, and `audio` (sound
  tracks: `[{ "file": "audio/voice.mp3", "start": 0, "volume": 1 }]`).
- `index.html` and `film.js` hold the film; `story.js` is the story; `assets/fonts/` has the caption font
  (Poppins, SIL Open Font License).
- Scenes on the Kairos timeline come from the places in the story.

## Working with Kairos

When the Kairos tools are connected (Kairos → Settings → Claude Code), use them:

- `kairos_notes` shows the user's open frame notes. Start there when asked to fix notes.
- `kairos_frame` shows the frame at `t` (seconds), and any error the film throws.
- `kairos_note_update` (`status: "fixed"`) when a note is done. Never edit `.kairos/` by hand.
- `kairos_film_settings` changes the title, length, frame rate or status.
- `kairos_render` makes the MP4 when the user asks for the video; `kairos_renders` shows progress.
- `kairos_references` shows the videos and pictures the user added as references, with what to take from each,
  their shot lengths and frame sheets. Look at them before building or restyling the film.
- `kairos_assets` lists the user's asset library (images, videos, sounds, fonts); `kairos_use_asset` copies one into
  this film and gives its path (a sound becomes a sound track).
