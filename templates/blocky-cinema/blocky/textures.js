// Surfaces made by code: each one a color map and a matching bump map (its relief, which catches the light), drawn
// once on a canvas from a seed and cached. Use them with paint(): `paint("#ffffff", { ...siding("#e8d7b5"),
// bumpScale: 1.5 })`. The color is in the map, so the paint color stays white.
import { canvasTexture, rng } from "./util.js";

/**
 * A surface drawn twice with the same seed: once in color, once in grays for its height (0 low, 255 high).
 * `draw(ctx, s, fill)` paints with `fill(color, height)`, which picks the color or the gray.
 */
function surface(key, size, repeat, draw) {
  const pass = (mode) => (ctx, s) => {
    const fill = (color, height) =>
      mode === "color" ? color : `rgb(${height | 0},${height | 0},${height | 0})`;
    draw(ctx, s, fill);
  };
  return {
    map: canvasTexture(`${key}:color`, size, pass("color"), { repeat }),
    bumpMap: canvasTexture(`${key}:bump`, size, pass("bump"), { repeat, srgb: false }),
  };
}

/** A color a little lighter (k > 0) or darker (k < 0), as a CSS color. */
function shade(hex, k) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Soft dots over the whole canvas (dirt, speckles), drawn with `fill`. */
function dots(ctx, s, fill, random, count, radius, colors, heights, alpha = [0.08, 0.2]) {
  for (let i = 0; i < count; i++) {
    const k = Math.floor(random() * colors.length);
    ctx.globalAlpha = alpha[0] + random() * (alpha[1] - alpha[0]);
    ctx.fillStyle = fill(colors[k], heights[k]);
    ctx.beginPath();
    ctx.arc(random() * s, random() * s, radius * (0.4 + random()), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Grass: a green ground covered in short blades, a few darker clumps and the odd tiny flower. */
export function grass(base = "#5aa04f", repeat = [20, 20], flowers = true) {
  return surface(`grass:${base}:${flowers}`, 512, repeat, (ctx, s, fill) => {
    const random = rng(`grass${base}`);
    ctx.fillStyle = fill(base, 110);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      70,
      26,
      [shade(base, -0.25), shade(base, 0.15)],
      [80, 140],
      [0.15, 0.3],
    );
    const greens = [shade(base, -0.3), shade(base, -0.12), shade(base, 0.12), shade(base, 0.3)];
    ctx.lineCap = "round";
    for (let i = 0; i < 9000; i++) {
      const k = Math.floor(random() * greens.length);
      const x = random() * s;
      const y = random() * s;
      const len = 4 + random() * 7;
      const lean = (random() - 0.5) * 0.9;
      ctx.strokeStyle = fill(greens[k], 140 + k * 25);
      ctx.globalAlpha = 0.45 + random() * 0.45;
      ctx.lineWidth = 1 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean * len, y - len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (flowers) {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = fill(["#ffffff", "#ffe066", "#f3a6c8"][i % 3], 200);
        ctx.beginPath();
        ctx.arc(random() * s, random() * s, 1.6 + random() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Lap siding: horizontal boards, each one's lower edge throwing a thin shadow on the next. */
export function siding(color, repeat = [2, 2]) {
  return surface(`siding:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`siding${color}`);
    const boards = 8;
    const h = s / boards;
    for (let b = 0; b < boards; b++) {
      const y = b * h;
      const tone = (random() - 0.5) * 0.06;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, fill(shade(color, 0.06 + tone), 70));
      grad.addColorStop(0.85, fill(shade(color, tone), 200));
      grad.addColorStop(1, fill(shade(color, -0.18 + tone), 230));
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, s, h);
      ctx.fillStyle = fill(shade(color, -0.35), 20);
      ctx.fillRect(0, y, s, 2);
      // A few end joints along the board.
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = fill(shade(color, -0.2), 60);
        ctx.fillRect(random() * s, y + 2, 1.5, h - 2);
      }
    }
    dots(ctx, s, fill, random, 300, 2, [shade(color, -0.15), shade(color, 0.12)], [120, 150]);
  });
}

/** Roof shingles: staggered rows of tabs with dark gaps and a lighter lower edge. */
export function shingles(color, repeat = [3, 3]) {
  return surface(`shingles:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`shingles${color}`);
    const rows = 8;
    const h = s / rows;
    const w = s / 6;
    ctx.fillStyle = fill(shade(color, -0.45), 20);
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (w / 2);
      for (let c = -1; c < 7; c++) {
        const x = c * w + offset + (random() - 0.5) * 4;
        const tone = (random() - 0.5) * 0.22;
        ctx.fillStyle = fill(shade(color, tone), 170 + tone * 200);
        ctx.fillRect(x + 1.5, r * h + 1.5, w - 3, h - 2);
        ctx.fillStyle = fill(shade(color, tone - 0.18), 230);
        ctx.fillRect(x + 1.5, r * h + h - 4, w - 3, 3);
      }
    }
    dots(ctx, s, fill, random, 500, 1.5, [shade(color, -0.3), shade(color, 0.2)], [120, 200]);
  });
}

/**
 * Wooden planks with grain and the odd knot: floors, decks, fences, tables. `across` lays the planks along x (a
 * floor), otherwise they stand up (fence boards).
 */
export function planks(color, repeat = [3, 3], { count = 6, across = true } = {}) {
  return surface(`planks:${color}:${count}:${across}`, 512, repeat, (ctx, s, fill) => {
    const random = rng(`planks${color}`);
    if (!across) {
      ctx.translate(s, 0);
      ctx.rotate(Math.PI / 2);
    }
    const h = s / count;
    for (let p = 0; p < count; p++) {
      const y = p * h;
      const tone = (random() - 0.5) * 0.16;
      ctx.fillStyle = fill(shade(color, tone), 160);
      ctx.fillRect(0, y, s, h);
      // Grain: long wavy streaks along the plank.
      for (let g = 0; g < 14; g++) {
        const gy = y + random() * h;
        const amp = 1 + random() * 2.5;
        const freq = 0.01 + random() * 0.02;
        ctx.strokeStyle = fill(shade(color, tone - 0.12 - random() * 0.1), 120);
        ctx.globalAlpha = 0.35 + random() * 0.3;
        ctx.lineWidth = 0.8 + random();
        ctx.beginPath();
        for (let x = 0; x <= s; x += 8) {
          const yy = gy + Math.sin(x * freq + g) * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (random() < 0.5) {
        ctx.fillStyle = fill(shade(color, -0.35), 90);
        ctx.beginPath();
        ctx.ellipse(
          random() * s,
          y + h / 2,
          5 + random() * 5,
          2.5 + random() * 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      // The seam between planks, and a butt joint somewhere along it.
      ctx.fillStyle = fill(shade(color, -0.5), 10);
      ctx.fillRect(0, y, s, 2.5);
      ctx.fillRect(random() * s, y, 2.5, h);
    }
  });
}

/** Bricks in running bond with light mortar. */
export function bricks(color = "#a5523f", repeat = [2, 2]) {
  return surface(`bricks:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`bricks${color}`);
    ctx.fillStyle = fill("#cfc6b8", 40);
    ctx.fillRect(0, 0, s, s);
    const rows = 10;
    const h = s / rows;
    const w = s / 4;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (w / 2);
      for (let c = -1; c < 5; c++) {
        const tone = (random() - 0.5) * 0.25;
        ctx.fillStyle = fill(shade(color, tone), 190);
        ctx.fillRect(c * w + offset + 2, r * h + 2, w - 4, h - 4);
      }
    }
    dots(ctx, s, fill, random, 600, 1.4, [shade(color, -0.3), shade(color, 0.25)], [150, 210]);
  });
}

/** Asphalt: fine grit, darker patches and thin cracks. */
export function asphalt(repeat = [20, 1]) {
  return surface("asphalt", 512, repeat, (ctx, s, fill) => {
    const random = rng("asphalt");
    ctx.fillStyle = fill("#4a4d55", 140);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      6000,
      1.5,
      ["#3a3c42", "#5e616a", "#6b6e77"],
      [100, 170, 190],
      [0.2, 0.5],
    );
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = fill("#3f4249", 130);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(random() * s, random() * s, 40 + random() * 80, 20 + random() * 50);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = fill("#2c2e33", 30);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      let x = random() * s;
      let y = random() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 12; k++) {
        x += (random() - 0.5) * 22;
        y += (random() - 0.3) * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/** Concrete slabs: light gray with seams and faint stains (pavements, patios, paths). */
export function concrete(color = "#c4c4c8", repeat = [10, 1], slabs = 2) {
  return surface(`concrete:${color}:${slabs}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`concrete${color}`);
    ctx.fillStyle = fill(color, 160);
    ctx.fillRect(0, 0, s, s);
    dots(ctx, s, fill, random, 1600, 1.6, [shade(color, -0.15), shade(color, 0.1)], [140, 175]);
    dots(ctx, s, fill, random, 12, 30, [shade(color, -0.12)], [150], [0.08, 0.16]);
    ctx.fillStyle = fill(shade(color, -0.35), 30);
    for (let k = 0; k < slabs; k++) {
      ctx.fillRect((k * s) / slabs, 0, 2.5, s);
      ctx.fillRect(0, (k * s) / slabs, s, 2.5);
    }
  });
}

/** A path of packed earth and small pebbles. */
export function gravel(color = "#d8c49a", repeat = [2, 20]) {
  return surface(`gravel:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`gravel${color}`);
    ctx.fillStyle = fill(color, 120);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      1400,
      2.2,
      [shade(color, -0.2), shade(color, 0.15), "#a89f92"],
      [110, 170, 210],
      [0.3, 0.7],
    );
  });
}

/** Sand: fine grains and soft ripples. */
export function sand(color = "#e8d29a", repeat = [3, 3]) {
  return surface(`sand:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`sand${color}`);
    ctx.fillStyle = fill(color, 128);
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < 10; r++) {
      ctx.strokeStyle = fill(shade(color, -0.08), 170);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const y0 = (r / 10) * s;
      for (let x = 0; x <= s; x += 8) ctx.lineTo(x, y0 + Math.sin(x * 0.04 + r) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    dots(
      ctx,
      s,
      fill,
      random,
      2400,
      1,
      [shade(color, -0.2), shade(color, 0.2)],
      [100, 160],
      [0.3, 0.6],
    );
  });
}

/** Bark: dark vertical furrows. */
export function bark(color = "#7a5638", repeat = [1, 2]) {
  return surface(`bark:${color}`, 128, repeat, (ctx, s, fill) => {
    const random = rng(`bark${color}`);
    ctx.fillStyle = fill(color, 160);
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = fill(shade(color, -0.35 - random() * 0.2), 40);
      ctx.fillRect(random() * s, 0, 1 + random() * 2.5, s);
    }
  });
}

/** Leaves: a crown's surface of small overlapping leaves, light and dark. */
export function leaves(color = "#4caf5c", repeat = [2, 2]) {
  return surface(`leaves:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`leaves${color}`);
    ctx.fillStyle = fill(shade(color, -0.2), 90);
    ctx.fillRect(0, 0, s, s);
    const tones = [-0.3, -0.15, 0, 0.12, 0.25];
    for (let i = 0; i < 1500; i++) {
      const k = Math.floor(random() * tones.length);
      ctx.fillStyle = fill(shade(color, tones[k]), 100 + k * 35);
      ctx.beginPath();
      ctx.ellipse(
        random() * s,
        random() * s,
        3 + random() * 3,
        1.6 + random() * 1.6,
        random() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });
}

/** Rough stone (rocks, a pond's edge). */
export function stone(color = "#9a9aa2", repeat = [1, 1]) {
  return surface(`stone:${color}`, 128, repeat, (ctx, s, fill) => {
    const random = rng(`stone${color}`);
    ctx.fillStyle = fill(color, 140);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      500,
      3,
      [shade(color, -0.25), shade(color, 0.2)],
      [90, 200],
      [0.2, 0.5],
    );
  });
}

/** Painted plaster: a wall's color with the soft mottling of a roller. */
export function plaster(color, repeat = [1, 1]) {
  return surface(`plaster:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`plaster${color}`);
    ctx.fillStyle = fill(color, 128);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      90,
      22,
      [shade(color, -0.04), shade(color, 0.05)],
      [118, 140],
      [0.2, 0.4],
    );
    dots(
      ctx,
      s,
      fill,
      random,
      1400,
      1.2,
      [shade(color, -0.07), shade(color, 0.06)],
      [110, 150],
      [0.15, 0.35],
    );
  });
}

/** Wallpaper: soft stripes of two tones with a small pattern between them. */
export function wallpaper(color, accent, repeat = [1, 1]) {
  return surface(`wallpaper:${color}:${accent}`, 256, repeat, (ctx, s, fill) => {
    ctx.fillStyle = fill(color, 128);
    ctx.fillRect(0, 0, s, s);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = fill(shade(color, -0.06), 120);
      ctx.fillRect(k * (s / 4), 0, s / 8, s);
      for (let y = 0; y < 8; y++) {
        ctx.fillStyle = fill(accent, 140);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(k * (s / 4) + (3 * s) / 16, (y + 0.5) * (s / 8), 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  });
}

/** Upholstery: a woven fabric (sofas, armchairs, cushions, curtains). */
export function fabric(color, repeat = [1, 1]) {
  return surface(`fabric:${color}`, 128, repeat, (ctx, s, fill) => {
    const random = rng(`fabric${color}`);
    ctx.fillStyle = fill(color, 128);
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 3) {
      ctx.fillStyle = fill(shade(color, -0.08), 100);
      ctx.fillRect(0, i, s, 1);
      ctx.fillStyle = fill(shade(color, 0.06), 150);
      ctx.fillRect(i, 0, 1, s);
    }
    dots(
      ctx,
      s,
      fill,
      random,
      300,
      1.2,
      [shade(color, -0.12), shade(color, 0.1)],
      [100, 160],
      [0.2, 0.4],
    );
  });
}

/** Carpet: soft, flecked pile. */
export function carpet(color, repeat = [4, 4]) {
  return surface(`carpet:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`carpet${color}`);
    ctx.fillStyle = fill(color, 128);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      5000,
      1.1,
      [shade(color, -0.16), shade(color, 0.12), shade(color, -0.05)],
      [90, 170, 120],
      [0.35, 0.7],
    );
  });
}

/** Floor tiles: squares of one or two colors (a checkerboard) with grout lines. */
export function tiles(color, second = null, repeat = [6, 6], count = 4) {
  return surface(`tiles:${color}:${second}:${count}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`tiles${color}`);
    const t = s / count;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        const base = second && (r + c) % 2 ? second : color;
        ctx.fillStyle = fill(shade(base, (random() - 0.5) * 0.05), 170);
        ctx.fillRect(c * t, r * t, t, t);
      }
    }
    dots(
      ctx,
      s,
      fill,
      random,
      900,
      1.4,
      [shade(color, -0.12), shade(color, 0.1)],
      [150, 185],
      [0.1, 0.25],
    );
    ctx.fillStyle = fill("#9a958c", 40);
    for (let k = 0; k <= count; k++) {
      ctx.fillRect(k * t - 1.5, 0, 3, s);
      ctx.fillRect(0, k * t - 1.5, s, 3);
    }
  });
}

/** Cork board, with pinned papers drawn on it. */
export function cork(repeat = [1, 1]) {
  return surface("cork", 256, repeat, (ctx, s, fill) => {
    const random = rng("cork");
    ctx.fillStyle = fill("#b98a55", 120);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      2600,
      1.6,
      ["#8a6236", "#d2a774", "#6e4b2a"],
      [90, 170, 70],
      [0.4, 0.8],
    );
    const papers = ["#ffffff", "#fff4b0", "#cfe8ff", "#ffd1dc", "#d7f5c8"];
    for (let i = 0; i < 9; i++) {
      const w = 40 + random() * 40;
      const h = 34 + random() * 44;
      const x = random() * (s - w);
      const y = random() * (s - h);
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((random() - 0.5) * 0.25);
      ctx.fillStyle = fill(papers[i % papers.length], 200);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = fill("#9aa3b5", 190);
      for (let l = 0; l < 4; l++)
        ctx.fillRect(-w / 2 + 6, -h / 2 + 8 + l * 8, w - 12 - random() * 10, 2);
      ctx.fillStyle = fill(["#e8344e", "#3b5dc9", "#38b764"][i % 3], 230);
      ctx.beginPath();
      ctx.arc(0, -h / 2 + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

/** Granite: a speckled stone countertop. */
export function granite(color = "#d9d4cc", repeat = [2, 1]) {
  return surface(`granite:${color}`, 256, repeat, (ctx, s, fill) => {
    const random = rng(`granite${color}`);
    ctx.fillStyle = fill(color, 140);
    ctx.fillRect(0, 0, s, s);
    dots(
      ctx,
      s,
      fill,
      random,
      3200,
      1.3,
      ["#6b6660", "#ffffff", "#a39d94", "#3e3a36"],
      [120, 160, 140, 110],
      [0.35, 0.8],
    );
  });
}
