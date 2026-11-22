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
