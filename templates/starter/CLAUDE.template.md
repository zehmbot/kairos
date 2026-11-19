# {{title}}

This folder is a Kairos film. Kairos plays it live while you work, and the preview reloads by itself every
time a file here is saved.

## The brief

If this folder has `brief.md`, read it first: it is what the user asked for (their idea, script or answers
to the template's questions). Build the film from it, and keep to it when you change things later.

## Files

- `kairos.json`: `title`, `width` and `height` in pixels, `fps` (frames per second, 1 to 120), `duration` in
  seconds, `status`, and `audio`: sound tracks like `[{ "file": "audio/music.mp3", "start": 0, "volume": 0.5 }]`
  (start in seconds, volume 0 to 2). Kairos plays them with the preview and mixes them into the video.
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

## Skills

Kairos adds skills to Claude Code (turn them on or off in Kairos → Skills). Use them when they fit: `kairos` (how
this folder works), `kairos-directing` (idea, shots, rhythm), `kairos-camera` (framing, lenses, camera moves),
`kairos-3d` (three.js films) and `kairos-captions` (words on screen).
