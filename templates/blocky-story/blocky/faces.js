// Flat drawn faces (eyes, brows, mouth) on a transparent canvas, wrapped around the front of a head.
// Each face state is drawn once and cached.
import * as THREE from "three";

const SIZE = 512;
const INK = "#1b1b22";
const MOUTH = "#4a1520";
const TONGUE = "#e86a7a";
const TEAR = "#6cc6ff";

/** Every expression: which eyes, brows and mouth, plus extras. */
export const EXPRESSIONS = {
  neutral: { eyes: "open", brows: "flat", mouth: "smileSmall" },
  happy: { eyes: "open", brows: "up", mouth: "smile" },
  grin: { eyes: "happy", brows: "up", mouth: "grin" },
  laugh: { eyes: "happy", brows: "raised", mouth: "laugh" },
  sad: { eyes: "down", brows: "sad", mouth: "frown" },
  crying: { eyes: "shutSad", brows: "sad", mouth: "wail", tears: true },
  shocked: { eyes: "wide", brows: "raised", mouth: "o" },
  scared: { eyes: "wide", brows: "sad", mouth: "wavy", sweat: true },
  angry: { eyes: "open", brows: "angry", mouth: "clench" },
  furious: { eyes: "red", brows: "angry", mouth: "shout", red: true },
  smug: { eyes: "lidded", brows: "oneUp", mouth: "smirk" },
  sleepy: { eyes: "shut", brows: "flat", mouth: "smallO" },
  dizzy: { eyes: "spiral", brows: "none", mouth: "wavy" },
  love: { eyes: "hearts", brows: "up", mouth: "smile", blush: true },
  embarrassed: { eyes: "happyShut", brows: "sad", mouth: "smileSmall", blush: true },
  thinking: { eyes: "up", brows: "oneUp", mouth: "flat" },
  suspicious: { eyes: "narrow", brows: "angry", mouth: "flat" },
};

/** Expressions whose talking mouth is a big open grin (the others talk with a round mouth). */
const CHEERFUL = new Set(["happy", "grin", "laugh", "love", "smug", "neutral", "embarrassed"]);

const EYE_Y = 228;
const EYE_DX = 64;
const BROW_Y = 150;
const MOUTH_Y = 338;

// On dark skin, face lines get a soft light edge so they still read.
let halo = false;

function stroke(ctx, width = 10, color = INK) {
  if (halo && color === INK) {
    ctx.lineWidth = width + 9;
    ctx.strokeStyle = "rgba(255, 236, 214, 0.45)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

/** One eye. `side` is -1 (left on screen) or 1. `look` moves the pupil: [x, y]. */
function eye(ctx, kind, x, y, side, look) {
  const pupil = (rx, ry, color = INK) => {
    ellipse(ctx, x + look[0] * 10 - side * 3, y + look[1] * 12 + 6, rx, ry);
    ctx.fillStyle = color;
    ctx.fill();
    ellipse(ctx, x + look[0] * 10 - side * 3 + 6, y + look[1] * 12 - 6, rx * 0.32, ry * 0.26);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  };
  const white = (rx, ry) => {
    ellipse(ctx, x, y, rx, ry);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    stroke(ctx, 9);
  };
  switch (kind) {
    case "open":
    case "up":
    case "down":
      white(34, 44);
      pupil(17, 23);
      break;
    case "wide":
      white(42, 54);
      pupil(10, 12);
      break;
    case "red":
      white(38, 40);
      pupil(14, 14, "#d0202a");
      break;
    case "narrow":
      white(34, 14);
      pupil(12, 10);
      break;
    case "lidded": {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 60, y - 6, 120, 80);
      ctx.clip();
      white(34, 40);
      pupil(16, 20);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x - 38, y - 4);
      ctx.lineTo(x + 38, y - 4);
      stroke(ctx, 10);
      break;
    }
    case "happy":
      ctx.beginPath();
      ctx.arc(x, y + 14, 30, Math.PI * 1.1, Math.PI * 1.9);
      stroke(ctx, 12);
      break;
    case "happyShut":
      ctx.beginPath();
      ctx.arc(x, y + 6, 28, Math.PI * 1.15, Math.PI * 1.85);
      stroke(ctx, 10);
      break;
    case "shut":
      ctx.beginPath();
      ctx.arc(x, y - 16, 30, Math.PI * 0.18, Math.PI * 0.82);
      stroke(ctx, 10);
      break;
    case "shutSad":
      ctx.beginPath();
      ctx.moveTo(x - 30, y + 4 - side * 6);
      ctx.quadraticCurveTo(x, y + 16, x + 30, y + 4 + side * 6);
      stroke(ctx, 11);
      break;
    case "spiral": {
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.2) {
        const r = 3 + a * 2.1;
        const px = x + Math.cos(a * side) * r;
        const py = y + Math.sin(a * side) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      stroke(ctx, 7);
      break;
    }
    case "hearts":
      heart(ctx, x, y, 30);
      ctx.fillStyle = "#e8344e";
      ctx.fill();
      stroke(ctx, 6);
      break;
  }
}

function brow(ctx, kind, x, side) {
  const y = BROW_Y;
  ctx.beginPath();
  switch (kind) {
    case "flat":
      ctx.moveTo(x - 30, y + 4);
      ctx.lineTo(x + 30, y + 4);
      break;
    case "up":
      ctx.arc(x, y + 34, 38, Math.PI * 1.3, Math.PI * 1.7);
      break;
    case "raised":
      ctx.arc(x, y + 22, 40, Math.PI * 1.25, Math.PI * 1.75);
      break;
    case "sad":
      ctx.moveTo(x - 30 * side, y + 10);
      ctx.lineTo(x + 30 * side, y - 12);
      break;
    case "angry":
      ctx.moveTo(x - 32 * side, y + 22);
      ctx.lineTo(x + 30 * side, y - 4);
      break;
    case "oneUp":
      if (side === 1) ctx.arc(x, y + 24, 40, Math.PI * 1.25, Math.PI * 1.75);
      else {
        ctx.moveTo(x - 30, y + 14);
        ctx.lineTo(x + 30, y + 14);
      }
      break;
    default:
      return;
  }
  stroke(ctx, 13);
}

/** The mouth. `open` is 0 (closed, the expression's own mouth), 1 or 2 (talking). */
function mouth(ctx, kind, open, cheerful) {
  const x = 256;
  const y = MOUTH_Y;
  if (open > 0) {
    const w = cheerful ? 46 + open * 8 : 22 + open * 6;
    const h = 10 + open * 13;
    ctx.beginPath();
    if (cheerful) {
      ctx.moveTo(x - w, y - 8);
      ctx.lineTo(x + w, y - 8);
      ctx.quadraticCurveTo(x + w * 0.9, y + h * 1.6, x, y + h * 1.5);
      ctx.quadraticCurveTo(x - w * 0.9, y + h * 1.6, x - w, y - 8);
    } else ctx.ellipse(x, y + 6, w, h, 0, 0, Math.PI * 2);
    ctx.fillStyle = MOUTH;
    ctx.fill();
    stroke(ctx, 8);
    if (open === 2) {
      ellipse(ctx, x, y + h * (cheerful ? 1.05 : 0.9), w * 0.45, h * 0.35);
      ctx.fillStyle = TONGUE;
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  switch (kind) {
    case "smile":
      ctx.arc(x, y - 30, 52, Math.PI * 0.2, Math.PI * 0.8);
      stroke(ctx, 11);
      return;
    case "smileSmall":
      ctx.arc(x, y - 22, 36, Math.PI * 0.25, Math.PI * 0.75);
      stroke(ctx, 10);
      return;
    case "frown":
      ctx.arc(x, y + 34, 40, Math.PI * 1.22, Math.PI * 1.78);
      stroke(ctx, 11);
      return;
    case "flat":
      ctx.moveTo(x - 30, y);
      ctx.lineTo(x + 30, y);
      stroke(ctx, 10);
      return;
    case "smirk":
      ctx.moveTo(x - 34, y + 4);
      ctx.quadraticCurveTo(x + 10, y + 10, x + 40, y - 12);
      stroke(ctx, 10);
      return;
    case "wavy":
      ctx.moveTo(x - 44, y);
      for (let i = 1; i <= 8; i++) ctx.lineTo(x - 44 + i * 11, y + (i % 2 ? -8 : 8));
      stroke(ctx, 8);
      return;
    case "o":
      ellipse(ctx, x, y + 6, 22, 28);
      ctx.fillStyle = MOUTH;
      ctx.fill();
      stroke(ctx, 8);
      return;
    case "smallO":
      ellipse(ctx, x, y + 4, 11, 13);
      ctx.fillStyle = MOUTH;
      ctx.fill();
      stroke(ctx, 7);
      return;
    case "grin":
    case "laugh": {
      const w = kind === "laugh" ? 64 : 56;
      const h = kind === "laugh" ? 64 : 48;
      ctx.moveTo(x - w, y - 12);
      ctx.lineTo(x + w, y - 12);
      ctx.quadraticCurveTo(x + w * 0.95, y + h, x, y + h);
      ctx.quadraticCurveTo(x - w * 0.95, y + h, x - w, y - 12);
      ctx.closePath();
      ctx.fillStyle = MOUTH;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - w, y - 14, w * 2, 18);
      ellipse(ctx, x, y + h * 0.95, w * 0.5, h * 0.4);
      ctx.fillStyle = TONGUE;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x - w, y - 12);
      ctx.lineTo(x + w, y - 12);
      ctx.quadraticCurveTo(x + w * 0.95, y + h, x, y + h);
      ctx.quadraticCurveTo(x - w * 0.95, y + h, x - w, y - 12);
      stroke(ctx, 8);
      return;
    }
    case "wail": {
      ctx.moveTo(x - 44, y + 34);
      ctx.quadraticCurveTo(x, y - 30, x + 44, y + 34);
      ctx.closePath();
      ctx.fillStyle = MOUTH;
      ctx.fill();
      stroke(ctx, 8);
      return;
    }
    case "clench":
    case "shout": {
      const h = kind === "shout" ? 46 : 24;
      ctx.roundRect(x - 46, y - h / 2, 92, h, 10);
      ctx.fillStyle = kind === "shout" ? MOUTH : "#ffffff";
      ctx.fill();
      stroke(ctx, 8);
      ctx.beginPath();
      if (kind === "clench") {
        for (let i = -2; i <= 2; i++) {
          ctx.moveTo(x + i * 18, y - h / 2);
          ctx.lineTo(x + i * 18, y + h / 2);
        }
        ctx.moveTo(x - 46, y);
        ctx.lineTo(x + 46, y);
        stroke(ctx, 4);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 40, y - h / 2 + 4, 80, 10);
        ctx.fillRect(x - 40, y + h / 2 - 14, 80, 10);
      }
      return;
    }
  }
}

function extras(ctx, spec, features) {
  if (features.freckles) {
    ctx.fillStyle = "rgba(150, 80, 50, 0.55)";
    for (const [fx, fy] of [
      [-96, 300],
      [-80, 312],
      [-104, 318],
      [96, 300],
      [80, 312],
      [104, 318],
    ]) {
      ellipse(ctx, 256 + fx, fy, 5, 5);
      ctx.fill();
    }
  }
  if (spec.blush) {
    ctx.fillStyle = "rgba(255, 105, 130, 0.5)";
    ellipse(ctx, 256 - 100, 300, 30, 16);
    ctx.fill();
    ellipse(ctx, 256 + 100, 300, 30, 16);
    ctx.fill();
  }
  if (spec.tears) {
    ctx.fillStyle = TEAR;
    for (const side of [-1, 1]) {
      const x = 256 + side * EYE_DX;
      ctx.beginPath();
      ctx.moveTo(x - 12, EYE_Y + 18);
      ctx.lineTo(x + 12, EYE_Y + 18);
      ctx.lineTo(x + 16, 470);
      ctx.lineTo(x - 16, 470);
      ctx.closePath();
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  if (spec.sweat) {
    ctx.beginPath();
    ctx.moveTo(352, 108);
    ctx.quadraticCurveTo(380, 150, 366, 166);
    ctx.quadraticCurveTo(346, 176, 340, 150);
    ctx.closePath();
    ctx.fillStyle = TEAR;
    ctx.fill();
    stroke(ctx, 4, "#2a6f9a");
  }
  if (features.glasses) {
    for (const side of [-1, 1]) {
      ellipse(ctx, 256 + side * EYE_DX, EYE_Y, 50, 50);
      stroke(ctx, 9, "#2b2420");
    }
    ctx.beginPath();
    ctx.moveTo(256 - EYE_DX + 50, EYE_Y - 6);
    ctx.quadraticCurveTo(256, EYE_Y - 20, 256 + EYE_DX - 50, EYE_Y - 6);
    stroke(ctx, 8, "#2b2420");
  }
  if (
    features.lashes &&
    !["shut", "shutSad", "happy", "happyShut", "spiral", "hearts"].includes(spec.eyes)
  ) {
    for (const side of [-1, 1]) {
      const x = 256 + side * EYE_DX + side * 26;
      ctx.beginPath();
      ctx.moveTo(x, EYE_Y - 32);
      ctx.lineTo(x + side * 16, EYE_Y - 46);
      ctx.moveTo(x + side * 8, EYE_Y - 20);
      ctx.lineTo(x + side * 26, EYE_Y - 30);
      stroke(ctx, 7);
    }
  }
}

/** A fluffy beard around the mouth (the mouth is drawn over it). */
function beard(ctx, color) {
  ctx.beginPath();
  ctx.moveTo(96, 300);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const x = 256 + Math.cos(a) * 168;
    const y = 300 - Math.sin(a) * 210;
    ctx.arc(x, y, 30, a - 1.2, a + 1.2);
  }
  ctx.lineTo(416, 300);
  // The opening around the mouth.
  ctx.quadraticCurveTo(256, 268, 96, 300);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
  // Mustache.
  ctx.beginPath();
  ctx.ellipse(214, MOUTH_Y - 34, 46, 20, 0.15, 0, Math.PI * 2);
  ctx.ellipse(298, MOUTH_Y - 34, 46, 20, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

const cache = new Map();

/**
 * The face texture for a character's features, an expression and a moment: `blink` closes open eyes, `talk`
 * (0, 1, 2) opens the mouth. Returns `{ texture, red }` (red: tint the head, for "furious").
 */
export function faceTexture(features, expression, { blink = false, talk = 0 } = {}) {
  const spec = EXPRESSIONS[expression] ?? EXPRESSIONS.neutral;
  const closable = ["open", "up", "down", "wide", "red", "narrow", "lidded"].includes(spec.eyes);
  const eyes = blink && closable ? "shut" : spec.eyes;
  const key = `${features.glasses ? "g" : ""}${features.freckles ? "f" : ""}${features.lashes ? "l" : ""}${features.beard ?? ""}${features.dark ? "d" : ""}|${expression}|${eyes}|${talk}`;
  let texture = cache.get(key);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const look = spec.eyes === "up" ? [0.3, -1] : spec.eyes === "down" ? [0, 0.8] : [0, 0];
    // Features are drawn big (like the clips): scaled around the face center, a little less sideways
    // because the strip is wider than tall.
    halo = Boolean(features.dark);
    ctx.translate(256, 250);
    ctx.scale(1.3 / 1.15, 1.3);
    ctx.translate(-256, -250);
    extras(ctx, spec, { ...features, glasses: false });
    for (const side of [-1, 1]) eye(ctx, eyes, 256 + side * EYE_DX, EYE_Y, side, look);
    for (const side of [-1, 1]) brow(ctx, spec.brows, 256 + side * EYE_DX, side);
    if (features.beard) beard(ctx, features.beard);
    mouth(ctx, spec.mouth, talk, CHEERFUL.has(expression));
    if (features.glasses) extras(ctx, {}, { glasses: true });
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    cache.set(key, texture);
  }
  return { texture, red: Boolean(spec.red) };
}
