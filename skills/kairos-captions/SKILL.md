---
name: kairos-captions
description: Words on screen in Kairos films - word-by-word captions synced to a voice, titles, labels, callouts and kinetic typography. Use when a film has narration or subtitles, shows any text, or the user asks for captions, subtitles, titles, labels, lower thirds or animated text.
---

# Captions and kinetic type

## Word-by-word captions

Short vertical stories often show the narration **one word at a time** (or 2-3 short words), big and centered.
It keeps eyes on the screen even with the sound off.

Data: one entry per word, times in seconds, from the start of the film:

```js
const WORDS = [
  { text: "Every", start: 0.2, end: 0.48 },
  { text: "night", start: 0.48, end: 0.9 },
  // ...
];
```

Style that reads on any picture:
- A heavy sans font, white fill, a thick dark outline (or a 4-direction shadow).
- Centered, about **62-68% down** the frame in 9:16, clear of faces and of the phone app's buttons at the bottom.
- Size: the word's height about 5-7% of the frame height.
- A small pop when each word appears: scale 0.85 → 1 over ~0.08 s, eased.
- One accent color for key words (names, numbers, the twist); everything else white.
- Every word stays at least ~0.2 s on screen: merge very short words with their neighbour.

```js
const ctx = canvas.getContext("2d");
function drawCaption(t) {
  const word = WORDS.find((w) => t >= w.start && t < w.end);
  if (!word) return;
  const pop = Math.min(1, (t - word.start) / 0.08);
  const scale = 0.85 + 0.15 * (1 - (1 - pop) ** 3);
  const size = Math.round(H * 0.06);
  ctx.save();
  ctx.translate(W / 2, H * 0.65);
  ctx.scale(scale, scale);
  ctx.font = `800 ${size}px "Caption Sans"`; // loaded in READY, see Fonts
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = "#111";
  ctx.strokeText(word.text, 0, 0); // outline first,
  ctx.fillStyle = word.accent ? "#ffcd75" : "#fff";
  ctx.fillText(word.text, 0, 0); // then the fill on top
  ctx.restore();
}
```

With three.js, draw captions on a 2D canvas laid over the WebGL canvas (both at film size, absolutely positioned),
or as a canvas texture on a plane in front of the camera.

**Where the word times come from:** Kairos keeps the real ones next to each voice file. A line made with
`kairos_say` (or the Voice tab) has `voice/<speaker>-<n>.words.json`; a recording gets `<file>.words.json` when
the user presses **Get words** (or `kairos_words` with `transcribe: true`):

```json
{ "version": 1, "text": "Every night...", "duration": 3.1, "source": "speech",
  "words": [{ "text": "Every", "start": 0, "end": 0.28 }, { "text": "night", "start": 0.3, "end": 0.66 }] }
```

These times are from the start of the file. Add the clip's `start` from `kairos.json` `audio` (and subtract its
`from` if it is trimmed) to get film time. Load them in `READY` with `fetch` (the page and its files share an
origin), or copy them into the film's code when they won't change. Words keep their punctuation ("night,"):
strip it for display if the style wants. Only if there is no voice yet, estimate (about 2.5 words per second,
plus pauses at punctuation), say clearly that the times are estimates, and keep them in one list so they are easy
to replace.

```js
// In READY: words of every voice clip, in film time.
const film = await (await fetch("kairos.json")).json();
const WORDS = [];
for (const clip of film.audio ?? []) {
  const res = await fetch(clip.file.replace(/\.[^./]+$/, ".words.json"));
  if (!res.ok) continue;
  const { words } = await res.json();
  const from = clip.from ?? 0;
  const end = from + (clip.length ?? Infinity);
  for (const w of words) {
    const at = (clip.start ?? 0) - from;
    if (w.start >= from && w.start < end) WORDS.push({ ...w, start: at + w.start, end: at + w.end });
  }
}
WORDS.sort((a, b) => a.start - b.start);
```

## Kinetic type patterns

- **Build-up:** lines appear one after another and stay, so the statement assembles on screen. Each line slides
  or fades in over 0.2-0.4 s.
- **Strike-through swap:** show a common belief, draw a line through it, then reveal the real point below ("It's not
  the tool." → strike → "It's direction."). The strike draws left to right over ~0.3 s.
- **One highlight color:** a single accent color marks the key word in each line; everything else stays neutral.
- **Numbered callouts:** a small numbered badge with a short label, and a thin line drawing from the label to the
  thing it points at in the picture. Number them in the order they appear.
- **Big number labels:** a huge number with a small caption ("85 mm" + "background melts", "30M+" + "views").
  Count numbers up with an ease-out over ~0.6 s.
- **Section titles:** a short title held at least 1.2 s, plus about 0.3 s per word.

Timing:
- Animate in over 0.2-0.4 s with an ease-out; animate out faster, or cut.
- Give viewers time to read: roughly 3 words per second at most.
- Don't change text and the picture's focus at the same moment; let one lead.

## Fonts

Never rely on fonts installed on the computer: the render may run elsewhere. Put the font files in
`assets/fonts/`, declare them, and wait for them in `window.READY`:

```css
@font-face { font-family: "Caption Sans"; src: url("assets/fonts/caption-sans-800.woff2"); font-weight: 800; }
```

```js
window.READY = document.fonts.load('800 64px "Caption Sans"');
```

Use fonts whose license allows this (for example SIL Open Font License fonts).

## Layout and readability

- Keep text inside the safe area: away from the edges, the top ~12% and the bottom ~20% in 9:16.
- Short lines: about 20 characters per line in 9:16, 40 in 16:9. Break lines by meaning, not just width.
- Strong contrast: outline, shadow, or a soft dark band behind the text when the picture is busy.
- Check frames with `kairos_frame` where text appears, changes and leaves: readable, not covering the subject,
  nothing cut off.
