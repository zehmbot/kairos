/**
 * Sound waveforms for the timeline: each file is read once in the browser (Web Audio) into peaks, 100 per
 * second, and kept for the page's life.
 */
import { useEffect, useState } from "react";

/** Loudest sample in each 1/100 s, from 0 to 1, plus the file's length. */
export interface Peaks {
  perSecond: number;
  values: Float32Array;
  duration: number;
}

const PER_SECOND = 100;
const cache = new Map<string, Promise<Peaks>>();
let context: AudioContext | null = null;

/** The loudest sample of each bucket, over all channels. */
export function peaksOf(
  channels: readonly Float32Array[],
  sampleRate: number,
  perSecond = PER_SECOND,
): Float32Array {
  const length = channels[0]?.length ?? 0;
  const size = Math.max(1, Math.round(sampleRate / perSecond));
  const values = new Float32Array(Math.ceil(length / size));
  for (const data of channels) {
    for (let i = 0; i < length; i++) {
      const v = Math.abs(data[i] ?? 0);
      const bucket = Math.floor(i / size);
      if (v > (values[bucket] ?? 0)) values[bucket] = v;
    }
  }
  return values;
}

/** Reads a sound file into peaks (once per address). */
export function loadPeaks(url: string): Promise<Peaks> {
  let pending = cache.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Can't read the sound (${response.status}).`);
      context ??= new AudioContext();
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i),
      );
      return {
        perSecond: PER_SECOND,
        values: peaksOf(channels, buffer.sampleRate),
        duration: buffer.duration,
      };
    })();
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

/** The peaks of a sound file, or null while it is read (or when it can't be). */
export function usePeaks(url: string): Peaks | null {
  const [peaks, setPeaks] = useState<{ url: string; peaks: Peaks } | null>(null);
  useEffect(() => {
    let current = true;
    loadPeaks(url)
      .then((result) => {
        if (current) setPeaks({ url, peaks: result });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [url]);
  return peaks?.url === url ? peaks.peaks : null;
}

/**
 * Draws the part of a waveform from `from` for `length` seconds into `canvas`, as pixel bars: 2 px wide,
 * 1 px apart, heights in 2 px steps, centered. The color is the canvas's CSS `color`.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Peaks,
  from: number,
  length: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getComputedStyle(canvas).color;
  const step = 3;
  const secondsPerPx = length / width;
  for (let x = 0; x < width; x += step) {
    const a = Math.floor((from + x * secondsPerPx) * peaks.perSecond);
    const b = Math.max(a + 1, Math.floor((from + (x + step) * secondsPerPx) * peaks.perSecond));
    let peak = 0;
    for (let i = a; i < b && i < peaks.values.length; i++)
      peak = Math.max(peak, peaks.values[i] ?? 0);
    const bar = Math.max(2, Math.round((peak * (height - 4)) / 2) * 2);
    ctx.fillRect(x, Math.round((height - bar) / 2), 2, bar);
  }
}
