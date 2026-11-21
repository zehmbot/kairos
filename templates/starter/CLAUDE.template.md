# {{title}}

This folder is a Kairos film. Kairos plays it live while you work, and the preview reloads by itself every
time a file here is saved.

## The brief

If this folder has `brief.md`, read it first: it is what the user asked for (their idea, script or answers
to the template's questions). Build the film from it, and keep to it when you change things later.

If the film has references (videos or pictures the user likes, in `references/`), look at them with
`kairos_references` too: their notes say what to take from each.

## Voices

When the brief says "Voices: make them with the film", the film has a narrator (and characters who talk, when it
fits). Once the picture works:

1. Cast every speaker by type with `kairos_voices` and `cast` (narrator, woman, man, girl, boy, old-woman,
   old-man): Kairos picks the voices.
2. Write the script with `kairos_script`: one short line per moment, starting when the moment starts (about 2.5
   words per second). Then make it (`make: true`).
3. Fit the film to the voices with the real starts and lengths from the answer: move scenes or shots to them,
   and make the film long enough for the last line.

The `kairos` skill has the details (Voices).

## Files

- `kairos.json`: `title`, `width` and `height` in pixels, `fps` (frames per second, 1 to 120), `duration` in
  seconds, `status`, and `audio`: sound tracks like `[{ "file": "audio/music.mp3", "start": 0, "volume": 0.5 }]`
  (start in seconds, volume 0 to 2). Kairos plays them with the preview and mixes them into the video. And
  `video`: videos and pictures Kairos draws over the film, like
  `[{ "file": "assets/images/logo.png", "start": 0, "length": 5, "size": 0.2, "x": 0.88, "y": 0.84 }]`
  (see Video clips in the `kairos` skill).
- `index.html`: the page that holds the film. It uses a canvas here, but any HTML, CSS, SVG or WebGL works.
  Build it at the exact size in `kairos.json`; Kairos scales the preview itself.
- `film.js`: defines `window.renderOut(t)`, which draws the frame at time `t` (in seconds, from 0 to
  `duration`).
- `assets/`: put images, fonts and sounds here.

## Rules for renderOut(t)

- It must depend only on `t`. Don't use timers, `requestAnimationFrame` loops, `Date.now()`, unseeded random
  numbers or CSS animations that run on their own. Kairos asks for frames in any order.
- It may be `async` (return a Promise), for example to wait for an image to decode or a video to seek.
- If the film needs to load something first, set `window.READY` to a Promise; Kairos waits for it.
- Optional: `window.KAIROS_SCENES = [{ name, start, end }]` (in seconds) puts scene markers on the
  Kairos timeline.
- Optional: `window.KAIROS_LENGTH` (seconds), for a film that works out its own length. Kairos tells the user, and
  `kairos_frame` tells you, when it differs from `duration`.
- If you change the length, update both `duration` in `kairos.json` and any constant in `film.js`.

## Working with Kairos

When the Kairos tools are connected (Kairos → Settings → Claude Code), use them:

- `kairos_notes` shows the user's open frame notes: the time, what should change, the marks they drew and a
  picture of the marked frame. Start there when asked to fix notes.
- After a change, look at the frame again with `kairos_frame` (`t` in seconds). It also shows errors the film
  throws.
- When a note is done, mark it with `kairos_note_update` (`status: "fixed"`). Never edit `.kairos/` by hand.
- `kairos_film_settings` changes the title, length, frame rate or status with checks.
- When the user asks for the video, `kairos_render` makes an MP4 in `renders/`; `kairos_renders` shows progress
  and the finished versions.
- `kairos_references` shows the videos and pictures the user added as references, with what to take from each,
  their shot lengths and frame sheets. Look at them before building or restyling the film.
- `kairos_assets` lists the user's asset library (images, videos, sounds, fonts); `kairos_use_asset` copies one into
  this film and gives its path (a sound becomes a sound track).
- `kairos_voices` casts the speakers by type (free); `kairos_script` writes what they say and when, and makes the
  voices with fish.audio (uses the user's credits; unchanged lines are reused); `kairos_words` gives word timings.

## Skills

Kairos adds skills to Claude Code (turn them on or off in Kairos → Skills). Use them when they fit: `kairos` (how
this folder works), `kairos-directing` (idea, shots, rhythm), `kairos-camera` (framing, lenses, camera moves),
`kairos-3d` (three.js films) and `kairos-captions` (words on screen). Films made with the Blocky Story or Blocky
Cinema templates have their own guides: `kairos-blocky-story` and `kairos-blocky-cinema`.
