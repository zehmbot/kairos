// Captions drawn on the 2D layer over the picture.
// "words" style: 2-3 words at a time, the word being said in yellow (the default, like narrated shorts).
// "lines" style: up to two lines of the sentence, with *key words* in color.
// Word times come from the film's voices (voice.js); a shot without a voice guesses them from its length.
import { clamp, easeOut } from "./util.js";

export const CAPTION_FONT = '"Blocky Caption", "Arial Black", sans-serif';

/** Splits "Hello *world*, again" into words, marking *key words*. */
function splitWords(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const key = /^\*.*\*[.,!?;:…"']*$/.test(raw);
      return { text: raw.replace(/\*/g, ""), key };
    });
}

/**
 * Word timings for one shot: spread over the shot, longer words and pauses after punctuation taking longer.
 * `start` and `end` are seconds from the film's start.
 */
export function timeWords(say, shotStart, seconds) {
  const words = splitWords(say ?? "");
  if (words.length === 0) return [];
  const weight = (w) => w.text.length + 2 + (/[.,!?;:…]$/.test(w.text) ? 3 : 0);
  const total = words.reduce((sum, w) => sum + weight(w), 0);
  const lead = Math.min(0.08, seconds * 0.05);
  const span = Math.max(0.1, seconds - lead - Math.min(0.15, seconds * 0.08));
  let t = shotStart + lead;
  return words.map((w) => {
    const d = (weight(w) / total) * span;
    const timed = { ...w, start: t, end: t + d };
    t += d;
    return timed;
  });
}

/** Groups timed words into chunks of up to 3 (2 when a word is long), breaking after punctuation. */
export function chunkWords(words) {
  const chunks = [];
  let current = [];
  for (const w of words) {
    current.push(w);
    const letters = current.reduce((n, x) => n + x.text.length, 0);
    if (current.length >= 3 || letters > 14 || /[.,!?;:…]$/.test(w.text)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function drawWord(ctx, text, x, y, size, fill) {
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.28;
  ctx.shadowOffsetY = size * 0.07;
  ctx.lineWidth = size * 0.17;
  ctx.strokeStyle = "#101018";
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * Draws the caption for time `t`. `words` are all timed words of the current shot.
 * settings: { style, highlight, key, position, size } (see story.js CAPTIONS).
 */
export function drawCaptions(ctx, words, t, W, H, settings = {}) {
  const style = settings.style ?? "words";
  if (style === "none" || words.length === 0) return;
  const highlight = settings.highlight ?? "#ffd61f";
  const keyColor = settings.key ?? highlight;
  const base = Math.min(W, H) * (settings.size ?? 0.056);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  if (style === "lines") {
    // The sentence so far, up to two lines, key words colored.
    const shown = words.filter((w) => w.start <= t);
    if (!shown.length) return;
    const size = base * 0.95;
    ctx.font = `800 ${size}px ${CAPTION_FONT}`;
    const maxWidth = W * 0.84;
    const lines = [[]];
    let width = 0;
    for (const w of words) {
      const wWidth = ctx.measureText(`${w.text} `).width;
      if (width + wWidth > maxWidth && lines.at(-1).length) {
        lines.push([]);
        width = 0;
      }
      lines.at(-1).push(w);
      width += wWidth;
    }
    // Show the two lines around the current word.
    const current = lines.findIndex((line) => line.some((w) => w.end > t));
    const first = Math.max(
      0,
      Math.min((current < 0 ? lines.length - 1 : current) - 1, lines.length - 2),
    );
    const visible = lines.slice(first, first + 2);
    const y0 = H * (settings.position ?? 0.66) - ((visible.length - 1) * size * 1.15) / 2;
    visible.forEach((line, row) => {
      const lineWidth =
        line.reduce((n, w) => n + ctx.measureText(`${w.text} `).width, 0) -
        ctx.measureText(" ").width;
      let x = (W - lineWidth) / 2;
      for (const w of line) {
        if (w.start <= t)
          drawWord(ctx, w.text, x, y0 + row * size * 1.15, size, w.key ? keyColor : "#ffffff");
        x += ctx.measureText(`${w.text} `).width;
      }
    });
    return;
  }

  // "words": the chunk being said, popping in, the current word highlighted.
  const chunks = chunkWords(words);
  const index = chunks.findLastIndex((chunk) => chunk[0].start <= t);
  if (index < 0) return;
  const chunk = chunks[index];
  const chunkEnd = chunks[index + 1]?.[0].start ?? chunk.at(-1).end + 0.25;
  if (t >= chunkEnd + 0.1) return;
  const pop = easeOut(clamp((t - chunk[0].start) / 0.09));
  let size = base;
  ctx.font = `800 ${size}px ${CAPTION_FONT}`;
  const space = ctx.measureText(" ").width;
  let total =
    chunk.reduce((n, w) => n + ctx.measureText(w.text).width, 0) + space * (chunk.length - 1);
  if (total > W * 0.86) {
    size *= (W * 0.86) / total;
    ctx.font = `800 ${size}px ${CAPTION_FONT}`;
    total = (total * (W * 0.86)) / total;
  }
  const cx = W / 2;
  const cy = H * (settings.position ?? 0.64);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.84 + 0.16 * pop, 0.84 + 0.16 * pop);
  const gap = ctx.measureText(" ").width;
  let x =
    -chunk.reduce((n, w) => n + ctx.measureText(w.text).width, 0) / 2 -
    (gap * (chunk.length - 1)) / 2;
  for (const w of chunk) {
    const speaking = t >= w.start && t < w.end;
    drawWord(ctx, w.text, x, size * 0.35, size, speaking || w.key ? highlight : "#ffffff");
    x += ctx.measureText(w.text).width + gap;
  }
  ctx.restore();
}
