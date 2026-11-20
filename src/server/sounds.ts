/**
 * Kairos' own sound effects, made from code: filtered noise sweeps, pitched blips and small bells. Nothing is
 * recorded or borrowed. The same name always gives the same file (seeded noise), 44.1 kHz mono 16-bit WAV.
 * Films get them in `audio/fx/` when an effect uses one, on the timeline's Effects lane.
 */
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.ts";

const RATE = 44100;
/** Where a film keeps its effect sounds. */
export const FX_FOLDER = "audio/fx";

export interface SoundInfo {
  name: string;
  /** Plain words for the menu. */
  label: string;
}

/** Every sound, in menu order. Keep in step with FX_SOUNDS in the Blocky Story engine (fx.js). */
export const SOUNDS: readonly SoundInfo[] = [
  { name: "whoosh", label: "Whoosh" },
  { name: "swish", label: "Quick swish" },
  { name: "pop", label: "Pop" },
  { name: "boing", label: "Boing" },
  { name: "ding", label: "Ding" },
  { name: "count", label: "Counting ticks" },
  { name: "thud", label: "Thud" },
  { name: "boom", label: "Boom" },
  { name: "sparkle", label: "Sparkle" },
  { name: "magic", label: "Magic" },
  { name: "puff", label: "Puff" },
  { name: "flash", label: "Flash" },
  { name: "chime", label: "Chime" },
  { name: "party", label: "Party" },
  { name: "heart", label: "Heart" },
];
export const SOUND_NAMES = SOUNDS.map((sound) => sound.name);

/** A seeded random generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A band-pass filter whose center can move (state variable filter). */
function bandPass() {
  let low = 0;
  let band = 0;
  return (input: number, center: number, q = 1.2) => {
    const f = 2 * Math.sin((Math.PI * Math.min(center, RATE / 6)) / RATE);
    const damp = 1 / q;
    low += f * band;
    const high = input - low - damp * band;
    band += f * high;
    return { low, band, high };
  };
}

/** Rises in `attack` seconds, then falls away with `decay` (exponential). */
const env = (t: number, attack: number, decay: number) =>
  t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** A tone whose pitch follows `pitch(t)`, as a sine (phase kept as the pitch moves). */
function tone(length: number, pitch: (t: number) => number, amp: (t: number) => number) {
  const out = new Float32Array(Math.round(length * RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * pitch(t)) / RATE;
    out[i] = Math.sin(phase) * amp(t);
  }
  return out;
}

/** Adds `b` into `a` at `at` seconds, times `gain`. */
function mixInto(a: Float32Array, b: Float32Array, at = 0, gain = 1): Float32Array {
  const offset = Math.round(at * RATE);
  for (let i = 0; i < b.length && offset + i < a.length; i++) {
    a[offset + i] = (a[offset + i] ?? 0) + (b[i] ?? 0) * gain;
  }
  return a;
}

/** A small bell: a few inharmonic partials that ring away. */
function bell(freq: number, length: number, decay: number) {
  const out = new Float32Array(Math.round(length * RATE));
  const partials: [number, number][] = [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.22],
    [8.93, 0.1],
  ];
  for (const [ratio, gain] of partials) {
    mixInto(
      out,
      tone(
        length,
        () => freq * ratio,
        (t) => gain * env(t, 0.002, decay / ratio ** 0.5),
      ),
    );
  }
  return out;
}

/** Noise through a moving band-pass: whooshes, puffs, rumbles. */
function noise(
  length: number,
  seed: number,
  center: (t: number) => number,
  amp: (t: number) => number,
  kind: "band" | "low" | "high" = "band",
  q = 1.2,
) {
  const random = seeded(seed);
  const filter = bandPass();
  const out = new Float32Array(Math.round(length * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const parts = filter(random() * 2 - 1, center(t), q);
    out[i] = parts[kind] * amp(t);
  }
  return out;
}

const SYNTH: Record<string, () => Float32Array> = {
  whoosh: () =>
    noise(
      0.6,
      11,
      (t) => 300 + 2600 * Math.sin(Math.min(1, t / 0.6) * Math.PI) ** 1.5,
      (t) => Math.sin(Math.min(1, t / 0.6) * Math.PI) ** 2,
      "band",
      0.9,
    ),
  swish: () =>
    noise(
      0.26,
      12,
      (t) => 900 + 4200 * (t / 0.26),
      (t) => Math.sin(Math.min(1, t / 0.26) * Math.PI) ** 1.5,
      "band",
      0.8,
    ),
  pop: () =>
    mixInto(
      tone(
        0.14,
        (t) => 260 + 900 * Math.exp(-t * 40),
        (t) => env(t, 0.002, 0.035),
      ),
      noise(
        0.02,
        13,
        () => 3000,
        (t) => env(t, 0.0005, 0.004),
        "high",
      ),
      0,
      0.4,
    ),
  boing: () =>
    tone(
      0.65,
      (t) =>
        260 + 170 * Math.sin(2 * Math.PI * 11 * t) * Math.exp(-t * 4.5) + 120 * Math.exp(-t * 6),
      (t) => env(t, 0.004, 0.22),
    ),
  ding: () => bell(1320, 1.1, 0.35),
  count: () => {
    const out = new Float32Array(Math.round(0.95 * RATE));
    for (let k = 0; k < 13; k++) {
      const at = k * 0.062;
      mixInto(
        out,
        tone(
          0.03,
          () => 1400 + k * 70,
          (t) => env(t, 0.001, 0.008),
        ),
        at,
        0.6,
      );
    }
    return mixInto(out, bell(1760, 0.15, 0.08), 0.8, 0.8);
  },
  thud: () =>
    mixInto(
      tone(
        0.4,
        (t) => 42 + 60 * Math.exp(-t * 25),
        (t) => env(t, 0.002, 0.09),
      ),
      noise(
        0.12,
        14,
        () => 260,
        (t) => env(t, 0.001, 0.025),
        "low",
      ),
      0,
      0.9,
    ),
  boom: () =>
    mixInto(
      tone(
        1.3,
        (t) => 30 + 45 * Math.exp(-t * 6),
        (t) => env(t, 0.004, 0.35),
      ),
      noise(
        1.3,
        15,
        () => 160,
        (t) => env(t, 0.01, 0.3),
        "low",
        0.7,
      ),
      0,
      1.4,
    ),
  sparkle: () => {
    const random = seeded(16);
    const out = new Float32Array(Math.round(0.95 * RATE));
    for (let k = 0; k < 9; k++) {
      mixInto(out, bell(2200 + random() * 3600, 0.3, 0.06), random() * 0.6, 0.35 + random() * 0.3);
    }
    return out;
  },
  magic: () => {
    const out = new Float32Array(Math.round(1.4 * RATE));
    // An arpeggio going up (C major pentatonic), soft bells, over a shimmer.
    [523, 659, 784, 1047, 1319, 1568].forEach((freq, k) => {
      mixInto(out, bell(freq, 0.7, 0.22), k * 0.07, 0.5);
    });
    return mixInto(
      out,
      noise(
        1.4,
        17,
        (t) => 5000 + 2000 * t,
        (t) => 0.35 * env(t, 0.25, 0.4),
        "high",
      ),
    );
  },
  puff: () =>
    noise(
      0.38,
      18,
      (t) => 700 - 300 * t,
      (t) => env(t, 0.03, 0.08),
      "low",
      0.8,
    ),
  flash: () =>
    mixInto(
      noise(
        0.42,
        19,
        () => 6000,
        (t) => env(t, 0.001, 0.05),
        "high",
      ),
      tone(
        0.42,
        (t) => 2600 + 5000 * t,
        (t) => 0.18 * env(t, 0.05, 0.12),
      ),
    ),
  chime: () => {
    const out = new Float32Array(Math.round(0.9 * RATE));
    [1319, 1568, 2093].forEach((freq, k) => {
      mixInto(out, bell(freq, 0.6, 0.18), k * 0.11, 0.55);
    });
    return out;
  },
  party: () => {
    const out = SYNTH.pop?.() ?? new Float32Array(0);
    const all = new Float32Array(Math.round(1.25 * RATE));
    mixInto(all, out, 0, 1);
    mixInto(
      all,
      tone(
        0.45,
        (t) => 700 + 1600 * (t / 0.45),
        (t) => 0.3 * env(t, 0.03, 0.2),
      ),
      0.05,
    );
    return mixInto(all, SYNTH.sparkle?.() ?? new Float32Array(0), 0.15, 0.8);
  },
  heart: () => {
    const out = new Float32Array(Math.round(0.5 * RATE));
    mixInto(
      out,
      tone(
        0.16,
        (t) => 520 + 200 * t,
        (t) => env(t, 0.004, 0.05),
      ),
      0,
    );
    return mixInto(
      out,
      tone(
        0.22,
        (t) => 690 + 300 * t,
        (t) => env(t, 0.004, 0.07),
      ),
      0.16,
    );
  },
};

/** A sound's samples, from -1 to 1: peaks at 0.8, fades out at the very end (no click). */
export function soundSamples(name: string): Float32Array {
  const make = SYNTH[name];
  if (!make) throw new Error(`There's no "${name}" sound.`);
  const samples = make();
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0 ? 0.8 / peak : 0;
  const fade = Math.min(samples.length, Math.round(0.012 * RATE));
  for (let i = 0; i < samples.length; i++) {
    const tail = samples.length - i;
    samples[i] = (samples[i] ?? 0) * scale * (tail < fade ? tail / fade : 1);
  }
  return samples;
}

/** A sound as a WAV file (44.1 kHz, mono, 16-bit). */
export function soundWav(name: string): Buffer {
  const samples = soundSamples(name);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** How long a sound lasts, in seconds. */
export const soundLength = (name: string) => soundSamples(name).length / RATE;

/** Puts the sound in the film (`audio/fx/<name>.wav`) when it isn't there yet. Returns its path in the film. */
export async function soundInFilm(filmDir: string, name: string): Promise<string> {
  if (!SYNTH[name]) throw new Error(`There's no "${name}" sound.`);
  const file = `${FX_FOLDER}/${name}.wav`;
  const target = join(filmDir, ...file.split("/"));
  if (!(await stat(target).catch(() => null))?.isFile()) {
    await mkdir(join(filmDir, ...FX_FOLDER.split("/")), { recursive: true });
    await writeFileAtomic(target, soundWav(name));
  }
  return file;
}
