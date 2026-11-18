// A Kairos film. Kairos calls window.renderOut(t) for each frame, with t in seconds.
// Draw everything from t alone (no timers, no Date.now(), no Math.random()),
// so any frame can be drawn again in any order and always looks the same.

const TITLE = "{{title_js}}";
const DURATION = 5; // seconds, same as "duration" in kairos.json

const canvas = document.getElementById("film");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const UNIT = Math.min(W, H);

// Optional: scene markers for the Kairos timeline (seconds).
window.KAIROS_SCENES = [
  { name: "Intro", start: 0, end: 1 },
  { name: "Title", start: 1, end: 4 },
  { name: "Outro", start: 4, end: 5 },
];

const COLORS = {
  night: "#1a1c2c",
  steel: "#333c57",
  silver: "#94b0c2",
  white: "#f4f4f4",
  mint: "#73eff7",
  orange: "#ef7d57",
  yellow: "#ffcd75",
};

// A 16x16 pixel hourglass: F = frame, G = glass, S = sand.
const HOURGLASS = [
  ".FFFFFFFFFFFFFF.",
  "..FFFFFFFFFFFF..",
  "..G..........G..",
  "..G..........G..",
  "...GSSSSSSSSG...",
  "....GSSSSSSG....",
  ".....GSSSSG.....",
  "......GSSG......",
  "......GSSG......",
  ".....G.S..G.....",
  "....G..S...G....",
  "...G...S....G...",
  "..G...SSSS...G..",
  "..GSSSSSSSSSSG..",
  "..FFFFFFFFFFFF..",
  ".FFFFFFFFFFFFFF.",
];
const PIXEL_COLORS = { F: COLORS.orange, G: COLORS.mint, S: COLORS.yellow };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

function drawHourglass(cx, cy, cell, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  HOURGLASS.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = PIXEL_COLORS[char];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect((x - 8) * cell, (y - 8) * cell, cell, cell);
    });
  });
  ctx.restore();
}

// Biggest font size (up to `size`) that keeps `text` inside `maxWidth`.
function fitFont(text, size, maxWidth, family) {
  ctx.font = `bold ${size}px ${family}`;
  const width = ctx.measureText(text).width;
  return width > maxWidth ? Math.floor((size * maxWidth) / width) : size;
}

window.renderOut = (t) => {
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(0, 0, W, H);

  // The hourglass flips every 2 seconds; each flip takes half a second.
  const cell = Math.max(2, Math.round(UNIT / 60));
  const flip = easeInOut(clamp(((t % 2) - 1.5) / 0.5, 0, 1));
  drawHourglass(W / 2, H * 0.36, cell, (Math.floor(t / 2) + flip) * Math.PI);

  // The title slides in during the first second and fades out during the last one.
  const enter = easeOut(clamp(t, 0, 1));
  const leave = clamp(DURATION - t, 0, 1);
  const family = "system-ui, sans-serif";
  const size = fitFont(TITLE, Math.round(UNIT * 0.09), W * 0.9, family);
  ctx.globalAlpha = Math.min(enter, leave);
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(TITLE, W / 2 - (1 - enter) * W * 0.3, H * 0.62);
  ctx.globalAlpha = 1;

  // A timer and a progress bar.
  ctx.fillStyle = COLORS.silver;
  ctx.font = `${Math.round(UNIT * 0.035)}px ui-monospace, monospace`;
  ctx.fillText(`t = ${t.toFixed(2)} s`, W / 2, H * 0.78);
  const bar = Math.max(4, Math.round(UNIT / 90));
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(0, H - bar, W, bar);
  ctx.fillStyle = COLORS.mint;
  ctx.fillRect(0, H - bar, W * clamp(t / DURATION, 0, 1), bar);
};

// Show the first frame when the page is opened on its own.
window.renderOut(0);
