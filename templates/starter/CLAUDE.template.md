# {{title}}

This folder is a Kairos film. Kairos plays it live while you work, and the preview reloads by itself every
time a file here is saved.

## Files

- `kairos.json`: `title`, `width` and `height` in pixels, `fps`, `duration` in seconds, `status`.
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
