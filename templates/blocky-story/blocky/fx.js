// Effects that make a shot feel alive: particles (music notes, sparkles, hearts, tears, dust, confetti, magic),
// words in the scene (labels that count, floating names, big words), camera punches (zoom on a word, shake,
// flash) and bouncy motion (pop in, jump, dash). A shot lists them in `fx`; each one can land on a word (`at`)
// and brings a sound, which Kairos puts on the timeline's Effects lane. Pure functions of t.

import { CAPTION_FONT } from "./captions.js";
import { glyph, heartPath, musicNote, outlined } from "./overlays.js";
import { effectTime, plainWord } from "./timing.js";
import { clamp, easeOut, hash, lerp, rng } from "./util.js";

/**
 * Every effect: how long it lasts ("shot" = to the end of the shot), its sound and how loud.
 * Who or what it is about is the value of its key: `{ notes: "gus" }`, `{ float: "Augustus" }`, `{ shake: true }`.
 */
export const FX = {
  // Particles, by someone (the shot's focus when the value is `true`).
  notes: { length: "shot", sound: "chime", volume: 0.35 },
  sparkles: { length: "shot", sound: "sparkle", volume: 0.4 },
  hearts: { length: "shot", sound: "heart", volume: 0.45 },
  tears: { length: "shot", sound: null },
  sweat: { length: "shot", sound: null },
  anger: { length: "shot", sound: "thud", volume: 0.35 },
  zzz: { length: "shot", sound: null },
  dust: { length: 0.9, sound: "puff", volume: 0.45 },
  magic: { length: 1.3, sound: "magic", volume: 0.6 },
  confetti: { length: 2.4, sound: "party", volume: 0.6 },
  // Words in the scene.
  label: { length: "shot", sound: "ding", volume: 0.45 },
  float: { length: 2.2, sound: "pop", volume: 0.5 },
  big: { length: "shot", sound: "boom", volume: 0.6 },
  // Camera.
  punch: { length: "shot", sound: "swish", volume: 0.55 },
  shake: { length: 0.55, sound: "thud", volume: 0.75 },
  flash: { length: 0.4, sound: "flash", volume: 0.5 },
  // Motion.
  bounce: { length: 0.55, sound: "pop", volume: 0.6 },
  jump: { length: 0.95, sound: "boing", volume: 0.55 },
  dash: { length: 0.45, sound: "whoosh", volume: 0.6 },
};
export const FX_NAMES = Object.keys(FX);
/** The sounds effects use (Kairos makes them). A whip brings a whoosh. */
export const FX_SOUNDS = [
  "whoosh",
  "swish",
  "pop",
  "boing",
  "ding",
  "count",
  "thud",
  "boom",
  "sparkle",
  "magic",
  "puff",
  "flash",
  "chime",
  "party",
  "heart",
];

/** Old shot keys still work: icons become particles. */
const ICON_FX = {
  music: "notes",
  heart: "hearts",
  sparkle: "sparkles",
  zzz: "zzz",
  sweat: "sweat",
  anger: "anger",
};

/** `"notes"` or `{ notes: "gus", at: "sang" }` -> `{ type, value, ...options }` (null when unknown). */
export function normalizeFx(item) {
  if (typeof item === "string") return FX[item] ? { type: item, value: true } : null;
  if (!item || typeof item !== "object") return null;
  const type = Object.keys(item).find((key) => FX[key]);
  if (!type) return null;
  const { [type]: value, ...options } = item;
  return { ...options, type, value };
}

/** The effects of a story, in time: `[{ key, type, entry, t0, t1, on, text, sound, volume, options }]`. */
export function planEffects(entries) {
  const events = [];
  const keys = new Map();
  const keyFor = (entry, type) => {
    const base = `${(hash(`${entry.shot.say ?? ""}|${entry.shot.place ?? ""}`) >>> 0).toString(36)}-${type}`;
    const n = keys.get(base) ?? 0;
    keys.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
  for (const entry of entries) {
    const { shot } = entry;
    const end = entry.start + entry.seconds;
    const who = shot.who ?? [];
    const focus = shot.focus && who.includes(shot.focus) ? shot.focus : who[0];
    const list = [
      ...(shot.fx ?? []).map(normalizeFx).filter(Boolean),
      ...(shot.icons ?? [])
        .map((icon) => (typeof icon === "string" ? { icon } : icon))
        .filter((icon) => ICON_FX[icon.icon])
        .map((icon) => ({ type: ICON_FX[icon.icon], value: icon.on ?? true, sound: null })),
    ];
    for (const fx of list) {
      const spec = FX[fx.type];
      const t0 = Math.max(entry.start, Math.min(end - 0.05, effectTime(entry, fx.at)));
      const length = spec.length === "shot" ? end - t0 : Number(fx.seconds) || spec.length;
      const on = typeof fx.value === "string" && who.includes(fx.value) ? fx.value : focus;
      const text =
        fx.type === "float" || fx.type === "big"
          ? String(fx.value === true ? (fx.text ?? "") : fx.value)
          : String(fx.text ?? "");
      const sound =
        fx.sound === false ? null : typeof fx.sound === "string" ? fx.sound : spec.sound;
      events.push({
        key: keyFor(entry, fx.type),
        type: fx.type,
        entry: entry.index,
        t0,
        t1: t0 + Math.max(0.2, length),
        on,
        text,
        sound: fx.type === "label" && fx.count ? "count" : sound,
        volume: Number(fx.volume) || spec.volume || 0.5,
        options: fx,
      });
    }
    if (shot.whip) {
      events.push({
        key: keyFor(entry, "whip"),
        type: "whip",
        entry: entry.index,
        t0: entry.start,
        t1: entry.start + 0.3,
        on: focus,
        text: "",
        sound: "whoosh",
        volume: 0.55,
        options: {},
      });
    }
  }
  return events;
}

/** The sounds Kairos puts on the Effects lane: `[{ key, sound, t, volume }]`. */
export function effectSounds(events) {
  return events
    .filter((event) => event.sound)
    .map((event) => ({
      key: event.key,
      sound: event.sound,
      t:
        Math.round(
          Math.max(0, event.t0 - (event.sound === "whoosh" || event.sound === "swish" ? 0.08 : 0)) *
            1000,
        ) / 1000,
      volume: event.volume,
    }));
}

const active = (events, entry, t) =>
  events.filter((e) => e.entry === entry && t >= e.t0 && t < e.t1);

/** A cartoon pop: overshoots, then settles. */
export const popIn = (k) => {
  const x = clamp(k);
  return x < 1 ? easeOut(x) * (1 + 0.3 * Math.sin(x * Math.PI)) : 1;
};

/**
 * How effects change a character now: `{ hidden, sx, sy, lift, slide }` (scales, a lift in figure heights and a
 * slide sideways in units, for a dash).
 */
export function actorState(events, entry, t, id) {
  const state = { hidden: false, sx: 1, sy: 1, lift: 0, slide: 0 };
  for (const e of events) {
    if (e.entry !== entry || e.on !== id) continue;
    const u = t - e.t0;
    if (e.type === "magic" && e.options.appear && u < 0.35) state.hidden = true;
    if (e.type === "magic" && e.options.vanish && u >= 0.35) state.hidden = true;
    if (e.type === "bounce") {
      if (u < 0) state.hidden = true;
      else if (u < 0.55) {
        const k = popIn(u / 0.45);
        state.sx *= k * (1 + 0.12 * Math.sin(u * 22) * (1 - u / 0.55));
        state.sy *= k * (1 - 0.12 * Math.sin(u * 22) * (1 - u / 0.55));
      }
    }
    if (e.type === "magic" && e.options.appear && u >= 0.35 && u < 0.8) {
      const k = popIn((u - 0.35) / 0.35);
      state.sx *= k;
      state.sy *= k;
    }
    if (e.type === "jump" && u >= 0 && u < 0.95) {
      // Crouch, fly up stretched, land squashed.
      if (u < 0.12) {
        state.sy *= 1 - 0.18 * Math.sin((u / 0.12) * Math.PI);
        state.sx *= 1 + 0.12 * Math.sin((u / 0.12) * Math.PI);
      } else if (u < 0.78) {
        const k = (u - 0.12) / 0.66;
        state.lift += 4 * k * (1 - k) * (Number(e.options.height) || 0.3);
        state.sy *= 1 + 0.12 * Math.cos(k * Math.PI);
        state.sx *= 1 - 0.07 * Math.cos(k * Math.PI);
      } else {
        const k = (u - 0.78) / 0.17;
        state.sy *= 1 - 0.2 * Math.sin(k * Math.PI);
        state.sx *= 1 + 0.14 * Math.sin(k * Math.PI);
      }
    }
    if (e.type === "dash" && u < 0.45) {
      const from = e.options.from === "right" ? 1 : -1;
      state.slide += from * 9 * (1 - easeOut(Math.max(0, u) / 0.4));
    }
  }
  return state;
}

/** How effects move the camera now: `{ zoom, shake, blur }` (zoom < 1 punches in). */
export function cameraState(events, entry, t) {
  let zoom = 1;
  let shake = 0;
  let blur = 0;
  for (const e of active(events, entry, t)) {
    const u = t - e.t0;
    if (e.type === "punch") zoom *= lerp(1, Number(e.options.amount) || 0.72, easeOut(u / 0.12));
    if (e.type === "shake") shake = Math.max(shake, (1 - u / 0.55) ** 2);
    if (e.type === "dash") blur = Math.max(blur, 0.7 * (1 - u / 0.4));
  }
  return { zoom, shake, blur: clamp(blur) };
}

// ---------- Drawing (the 2D layer) ----------

function star(ctx, s) {
  ctx.beginPath();
  for (let p = 0; p < 8; p++) {
    const r = p % 2 ? s * 0.16 : s * 0.5;
    const b = (p * Math.PI) / 4;
    ctx.lineTo(Math.cos(b) * r, Math.sin(b) * r);
  }
  ctx.closePath();
}

function drop(ctx, s, fill) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.6);
  ctx.quadraticCurveTo(s * 0.5, 0, 0, s * 0.45);
  ctx.quadraticCurveTo(-s * 0.5, 0, 0, -s * 0.6);
  outlined(ctx, fill, s * 0.12);
}

const COLORS = ["#ffd61f", "#ff5aa8", "#7ad8ff", "#8dff6a", "#c18bff", "#ff8a3c"];

/** The font size that keeps `text` within `maxWidth`. */
function fitted(ctx, text, size, maxWidth) {
  ctx.font = `800 ${size}px ${CAPTION_FONT}`;
  const width = ctx.measureText(text).width;
  return width > maxWidth ? (size * maxWidth) / width : size;
}

/** A word drawn big in the scene: white, see-through, with a soft colored glow. */
function sceneWord(ctx, text, x, y, size, alpha, glow = "rgba(170,120,255,0.85)") {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `800 ${size}px ${CAPTION_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = "#f3eeff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** "575 days" counting up: the number grows to its value, the rest stays. */
function counted(text, k) {
  return text.replace(/\d[\d,.]*/, (number) => {
    const value = Number(number.replace(/,/g, ""));
    if (!Number.isFinite(value)) return number;
    const now = Math.round(value * easeOut(k));
    return number.includes(",") ? now.toLocaleString("en-US") : String(now);
  });
}

/**
 * Draws the effects of the current shot. `view`: `{ W, H, headAt(id) -> {x,y,r}|null, ringAt(id, radius, n) ->
 * [[x,y]...]|null, focus }` (the focus is the shot's main character).
 */
export function drawEffects(ctx, events, entry, t, view) {
  const { W, H } = view;
  const unit = Math.min(W, H);
  for (const e of active(events, entry, t)) {
    const u = t - e.t0;
    const life = e.t1 - e.t0;
    const fade = clamp(Math.min(u / 0.15, (life - u) / 0.25));
    const head = e.on ? view.headAt(e.on) : null;
    const r = head ? clamp(head.r, unit * 0.025, unit * 0.2) : unit * 0.07;
    const hx = head?.x ?? W / 2;
    const hy = head?.y ?? H * 0.35;
    const random = rng(hash(e.key));
    ctx.save();
    switch (e.type) {
      case "notes": {
        for (let i = 0; i < 7; i++) {
          const phase = (u * 0.42 + i / 7) % 1;
          const angle = i * 2.4 + u * 1.7;
          const radius = r * (1.3 + phase * 1.4);
          ctx.save();
          ctx.globalAlpha = Math.sin(phase * Math.PI) * fade;
          ctx.translate(hx + Math.cos(angle) * radius, hy - r * 0.6 - phase * r * 2.6);
          ctx.rotate(Math.sin(angle) * 0.3);
          musicNote(ctx, r * 0.42, i % 3 === 0, i % 2 ? "#ffd61f" : "#ff8ad8");
          ctx.restore();
        }
        break;
      }
      case "sparkles": {
        for (let i = 0; i < 9; i++) {
          const a = random() * Math.PI * 2;
          const d = r * (1.1 + random() * 1.4);
          const speed = 3 + random() * 4;
          const twinkle = Math.max(0, Math.sin(u * speed + i * 2.1));
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(hx + Math.cos(a) * d, hy + Math.sin(a) * d * 0.8);
          ctx.scale(twinkle, twinkle);
          star(ctx, r * 0.7);
          ctx.fillStyle = i % 3 ? "#fff6b0" : "#ffffff";
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "hearts": {
        for (let i = 0; i < 5; i++) {
          const phase = (u * 0.5 + i / 5) % 1;
          ctx.save();
          ctx.globalAlpha = Math.sin(phase * Math.PI) * fade;
          ctx.translate(
            hx + (i - 2) * r * 0.55 + Math.sin(phase * 7 + i) * r * 0.2,
            hy - r * 0.8 - phase * r * 2.2,
          );
          heartPath(ctx, r * (0.28 + 0.06 * (i % 2)));
          outlined(ctx, "#ff4d6d", r * 0.05);
          ctx.restore();
        }
        break;
      }
      case "tears": {
        for (let side = -1; side <= 1; side += 2) {
          for (let i = 0; i < 3; i++) {
            const phase = (u * 1.4 + i / 3 + (side > 0 ? 0.5 : 0)) % 1;
            ctx.save();
            ctx.globalAlpha = (1 - phase) * fade;
            ctx.translate(
              hx + side * r * (0.42 + phase * 0.25),
              hy + r * 0.05 + phase * phase * r * 1.6,
            );
            drop(ctx, r * 0.16, "#6cc6ff");
            ctx.restore();
          }
        }
        break;
      }
      case "sweat": {
        const phase = (u * 0.7) % 1;
        ctx.globalAlpha = fade * (1 - phase * 0.5);
        ctx.translate(hx + r * 0.85, hy - r * 0.45 + phase * r * 0.6);
        drop(ctx, r * 0.38, "#8fd6ff");
        break;
      }
      case "anger": {
        const beat = 1 + 0.18 * Math.max(0, Math.sin(u * 9));
        ctx.globalAlpha = fade;
        ctx.translate(hx + r * 0.8, hy - r * 0.85);
        ctx.scale(beat, beat);
        ctx.lineCap = "round";
        ctx.strokeStyle = "#e8243a";
        ctx.lineWidth = r * 0.12;
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 2);
          ctx.beginPath();
          ctx.moveTo(r * 0.07, -r * 0.3);
          ctx.quadraticCurveTo(r * 0.11, -r * 0.11, r * 0.3, -r * 0.07);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case "zzz": {
        for (let i = 0; i < 3; i++) {
          const k = (u * 0.8 + i / 3) % 1;
          ctx.save();
          ctx.globalAlpha = Math.sin(k * Math.PI) * fade;
          ctx.translate(hx + r * (0.7 + i * 0.35), hy - r * 0.6 - k * r * 1.4);
          glyph(ctx, "z", r * (0.3 + i * 0.08), "#bfe3ff");
          ctx.restore();
        }
        break;
      }
      case "dust": {
        const ring = e.on ? view.ringAt(e.on, 0.9, 8) : null;
        if (!ring) break;
        ring.forEach(([x, y], i) => {
          const k = clamp(u / 0.8);
          const [cx, cy] = ring[(i + 4) % ring.length];
          const px = lerp((x + cx) / 2, x, 0.4 + k);
          const py = lerp((y + cy) / 2, y, 0.4 + k) - k * r * 0.4;
          ctx.globalAlpha = (1 - k) * 0.75;
          ctx.beginPath();
          ctx.arc(px, py, r * (0.18 + k * 0.35), 0, Math.PI * 2);
          ctx.fillStyle = "#e9e1d4";
          ctx.fill();
        });
        break;
      }
      case "magic": {
        const ring = e.on
          ? view.ringAt(e.on, 1.6 * clamp(u / 0.3) * (1 - clamp((u - 0.9) / 0.4)), 36)
          : null;
        if (ring) {
          ctx.globalAlpha = 0.9;
          ctx.shadowColor = "#b06bff";
          ctx.shadowBlur = r * 0.6;
          ctx.lineWidth = r * 0.14;
          ctx.strokeStyle = "#d9b8ff";
          ctx.beginPath();
          for (const [i, [x, y]] of ring.entries()) {
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // The burst, a moment in: rays and sparks.
        const b = (u - 0.3) / 0.6;
        if (b > 0 && b < 1) {
          const cy = hy + r * 1.6;
          ctx.globalAlpha = 1 - b;
          ctx.strokeStyle = "#f1e2ff";
          ctx.lineCap = "round";
          ctx.lineWidth = r * 0.08;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + random() * 0.3;
            const d0 = r * (0.6 + b * 2.4);
            const d1 = d0 + r * 0.9 * (1 - b);
            ctx.beginPath();
            ctx.moveTo(hx + Math.cos(a) * d0, cy + Math.sin(a) * d0);
            ctx.lineTo(hx + Math.cos(a) * d1, cy + Math.sin(a) * d1);
            ctx.stroke();
          }
          for (let i = 0; i < 10; i++) {
            ctx.save();
            const a = random() * Math.PI * 2;
            const d = r * (0.8 + b * (1.5 + random() * 2));
            ctx.translate(hx + Math.cos(a) * d, cy + Math.sin(a) * d - b * r);
            star(ctx, r * 0.35 * (1 - b * 0.6));
            ctx.fillStyle = i % 2 ? "#c79bff" : "#ffffff";
            ctx.fill();
            ctx.restore();
          }
        }
        break;
      }
      case "confetti": {
        for (let i = 0; i < 90; i++) {
          const x0 = random() * W;
          const speed = 0.35 + random() * 0.45;
          const sway = random() * Math.PI * 2;
          const y = -H * 0.1 + (u * speed + random() * 0.25) * H;
          if (y > H * 1.05) continue;
          ctx.save();
          ctx.globalAlpha = clamp((life - u) / 0.5);
          ctx.translate(x0 + Math.sin(u * 3 + sway) * unit * 0.03, y);
          ctx.rotate(u * (3 + random() * 6) + sway);
          ctx.scale(1, Math.abs(Math.cos(u * 5 + sway)));
          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.fillRect(-unit * 0.009, -unit * 0.005, unit * 0.018, unit * 0.01);
          ctx.restore();
        }
        break;
      }
      case "label": {
        if (!head) break;
        const k = popIn(u / 0.25);
        const text = e.options.count ? counted(e.text, clamp(u / 0.9)) : e.text;
        const size = clamp(r * 0.55, unit * 0.026, unit * 0.065);
        ctx.translate(hx, hy - r * 1.35);
        ctx.scale(k, k);
        ctx.font = `800 ${size}px ${CAPTION_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineJoin = "round";
        ctx.lineWidth = size * 0.2;
        ctx.strokeStyle = "#0b2a12";
        ctx.strokeText(text, 0, 0);
        ctx.fillStyle = e.options.color ?? "#5cff7a";
        ctx.fillText(text, 0, 0);
        break;
      }
      case "float": {
        const k = clamp(u / life);
        // Always whole in the frame: as big as fits, centered where it fits.
        const size = fitted(
          ctx,
          e.text,
          unit * (Number(e.options.size) || 0.085) * (0.9 + 0.2 * easeOut(k * 2)),
          W * 0.86,
        );
        ctx.font = `800 ${size}px ${CAPTION_FONT}`;
        const half = ctx.measureText(e.text).width / 2 + W * 0.04;
        const x = clamp(
          head ? hx + (random() - 0.5) * r * 2 : W * (0.3 + random() * 0.4),
          half,
          W - half,
        );
        const y = (head ? hy - r * 1.6 : H * 0.32) - k * unit * 0.22;
        sceneWord(ctx, e.text, x, y, size, 0.82 * Math.sin(Math.min(1, k * 1.2) * Math.PI) ** 0.6);
        break;
      }
      case "big": {
        const k = popIn(u / 0.22);
        const size = fitted(ctx, e.text, unit * 0.12, W * 0.84);
        ctx.translate(W / 2, H * 0.26);
        ctx.scale(k * (1 + u * 0.015), k * (1 + u * 0.015));
        sceneWord(ctx, e.text, 0, 0, size, 0.8 * fade);
        break;
      }
      case "flash": {
        ctx.globalAlpha = 0.85 * (1 - clamp(u / 0.4)) ** 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "dash": {
        if (!head) break;
        const k = clamp(u / 0.4);
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = "#ffffff";
        ctx.lineCap = "round";
        const from = e.options.from === "right" ? 1 : -1;
        for (let i = 0; i < 7; i++) {
          const y = hy + r * (i * 0.7 - 0.6) + (random() - 0.5) * r * 0.4;
          const length = r * (2.5 + random() * 3) * (1 - k);
          ctx.lineWidth = r * (0.05 + random() * 0.07);
          ctx.beginPath();
          ctx.moveTo(hx + from * r * 1.2, y);
          ctx.lineTo(hx + from * (r * 1.2 + length), y);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
  }
}

/** Is `word` (as said) one of the shot's effect words? For tests and the guides. */
export const isEffectWord = (entry, word) =>
  (entry.shot.fx ?? []).some(
    (fx) => fx && typeof fx === "object" && plainWord(fx.at) === plainWord(word),
  );
