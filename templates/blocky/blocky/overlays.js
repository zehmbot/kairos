// Extras drawn on the 2D layer: floating icons by a character's head, big see-through text, labels.
import { CAPTION_FONT } from "./captions.js";
import { clamp, easeOut, wobble } from "./util.js";

export const ICON_NAMES = ["music", "heart", "?", "!", "zzz", "sparkle", "sweat", "anger", "idea"];

const pop = (k) => {
  const x = clamp(k);
  // Overshoots a little, then settles: a cartoon "pop".
  return x < 1 ? easeOut(x) * (1 + 0.25 * Math.sin(x * Math.PI)) : 1;
};

export function outlined(ctx, fill, width) {
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = "#101018";
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function heartPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.5, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.closePath();
}

/** A music note drawn with shapes (fonts may not have ♪): one note, or two joined by a beam. */
export function musicNote(ctx, s, double, fill = "#ffd61f") {
  const heads = double ? [-s * 0.45, s * 0.35] : [0];
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const x of heads) {
    ctx.ellipse(x, s * 0.45, s * 0.3, s * 0.22, -0.4, 0, Math.PI * 2);
    ctx.rect(x + s * 0.2, -s * 0.6, s * 0.12, s * 1.05);
  }
  if (double) ctx.rect(heads[0] + s * 0.2, -s * 0.62, heads[1] - heads[0] + s * 0.12, s * 0.2);
  else {
    ctx.moveTo(s * 0.32, -s * 0.6);
    ctx.quadraticCurveTo(s * 0.75, -s * 0.35, s * 0.55, s * 0.05);
    ctx.quadraticCurveTo(s * 0.6, -s * 0.3, s * 0.32, -s * 0.38);
  }
  ctx.lineWidth = s * 0.16;
  ctx.strokeStyle = "#101018";
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function glyph(ctx, text, s, fill) {
  ctx.font = `800 ${s * 1.6}px ${CAPTION_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = s * 0.28;
  ctx.strokeStyle = "#101018";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
}

/** Draws one icon centered at 0,0 with size `s` (pixels). `u` is seconds since it appeared. */
function drawIcon(ctx, name, s, u) {
  switch (name) {
    case "heart":
      heartPath(ctx, s);
      outlined(ctx, "#ff4d6d", s * 0.14);
      break;
    case "?":
      glyph(ctx, "?", s, "#ffd61f");
      break;
    case "!":
      glyph(ctx, "!", s, "#ff5a3c");
      break;
    case "zzz":
      for (let i = 0; i < 3; i++) {
        ctx.save();
        const k = (u * 0.8 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.translate(i * s * 0.5, -k * s * 1.6);
        glyph(ctx, "z", s * (0.55 + i * 0.15), "#bfe3ff");
        ctx.restore();
      }
      break;
    case "music":
      for (let i = 0; i < 3; i++) {
        ctx.save();
        const k = (u * 0.55 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.translate((i - 1) * s * 0.7 + Math.sin(k * 6 + i) * s * 0.2, -k * s * 1.8);
        musicNote(ctx, s * 0.7, i % 2 === 1);
        ctx.restore();
      }
      break;
    case "sparkle":
      for (let i = 0; i < 4; i++) {
        ctx.save();
        const a = i * 1.7 + u * 0.8;
        ctx.translate(Math.cos(a) * s * 0.9, Math.sin(a * 1.3) * s * 0.7);
        const twinkle = 0.5 + 0.5 * Math.sin(u * 6 + i * 2);
        ctx.scale(twinkle, twinkle);
        ctx.beginPath();
        for (let p = 0; p < 8; p++) {
          const r = p % 2 ? s * 0.12 : s * 0.42;
          const b = (p * Math.PI) / 4;
          ctx.lineTo(Math.cos(b) * r, Math.sin(b) * r);
        }
        ctx.closePath();
        ctx.fillStyle = "#fff6b0";
        ctx.fill();
        ctx.restore();
      }
      break;
    case "sweat":
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6);
      ctx.quadraticCurveTo(s * 0.5, 0, 0, s * 0.45);
      ctx.quadraticCurveTo(-s * 0.5, 0, 0, -s * 0.6);
      outlined(ctx, "#6cc6ff", s * 0.12);
      break;
    case "anger":
      ctx.lineCap = "round";
      ctx.strokeStyle = "#e8243a";
      ctx.lineWidth = s * 0.2;
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(s * 0.12, -s * 0.45);
        ctx.quadraticCurveTo(s * 0.18, -s * 0.18, s * 0.45, -s * 0.12);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case "idea":
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.45, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineTo(s * 0.18, s * 0.45);
      ctx.lineTo(-s * 0.18, s * 0.45);
      ctx.closePath();
      outlined(ctx, "#ffe95c", s * 0.12);
      ctx.fillStyle = "#9aa0ae";
      ctx.fillRect(-s * 0.2, s * 0.45, s * 0.4, s * 0.22);
      break;
  }
}

/**
 * Draws the shot's extras at time `u` (seconds into the shot).
 * headAt(id) gives a character's head on screen: { x, y, r } (r: head size in pixels), or null.
 */
export function drawOverlays(ctx, shot, u, W, H, headAt, focusId) {
  const unit = Math.min(W, H);

  // Big see-through words, upper part of the frame.
  if (shot.big) {
    const k = easeOut(clamp(u / 0.25));
    ctx.save();
    ctx.globalAlpha = 0.72 * k;
    ctx.font = `800 ${unit * 0.11}px ${CAPTION_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(W / 2, H * 0.27);
    ctx.scale(0.9 + 0.1 * k + u * 0.01, 0.9 + 0.1 * k + u * 0.01);
    ctx.shadowColor = "rgba(160,120,255,0.8)";
    ctx.shadowBlur = unit * 0.03;
    ctx.fillStyle = "#e9e2ff";
    ctx.fillText(shot.big, 0, 0);
    ctx.restore();
  }

  // Labels over heads (green, like game name tags).
  for (const [id, text] of Object.entries(shot.labels ?? {})) {
    const head = headAt(id);
    if (!head) continue;
    ctx.save();
    ctx.font = `800 ${clamp(head.r * 0.55, unit * 0.025, unit * 0.06)}px ${CAPTION_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.lineWidth = unit * 0.008;
    ctx.strokeStyle = "#0b2a12";
    const y = head.y - head.r * 1.25;
    ctx.strokeText(text, head.x, y);
    ctx.fillStyle = "#5cff7a";
    ctx.fillText(text, head.x, y);
    ctx.restore();
  }

  // Icons by a character's head (the focus when not said).
  const icons = (shot.icons ?? []).map((icon) => (typeof icon === "string" ? { icon } : icon));
  icons.forEach((entry, i) => {
    const head = headAt(entry.on ?? focusId);
    const s = head ? clamp(head.r * 0.5, unit * 0.03, unit * 0.09) : unit * 0.06;
    const side = i % 2 ? -1 : 1;
    // By the head, but always inside the frame and above the captions.
    const x = clamp(
      head ? head.x + side * head.r * (1.15 + 0.2 * i) : W * (0.7 - i * 0.12),
      s * 1.4,
      W - s * 1.4,
    );
    const y = clamp(head ? head.y - head.r * (0.9 + 0.25 * i) : H * 0.22, s * 1.6, H * 0.52);
    const appear = entry.delay ?? i * 0.12;
    const k = pop((u - appear) / 0.2);
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y + wobble(u * 2, i) * s * 0.12);
    ctx.scale(k, k);
    drawIcon(ctx, entry.icon, s, u - appear);
    ctx.restore();
  });
}
