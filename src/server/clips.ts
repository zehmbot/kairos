/**
 * Video clips in frame pictures (kairos_frame, note pictures, film cards): the frame each clip shows at a film
 * time, ready to be put over the film page before the picture is taken. The render draws clips with ffmpeg
 * instead (src/server/ffmpeg.ts); both use the layout in src/shared/clips.ts.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  clipBox,
  clipLength,
  clipOpacity,
  clipTime,
  drawOrder,
  isPicture,
} from "../shared/clips.ts";
import { contentTypeOf } from "../shared/media.ts";
import type { FilmConfig } from "../shared/types.ts";
import { probeMedia } from "./ffmpeg.ts";
import { resolveInside } from "./workspace.ts";

/** A clip's picture at one moment: a data: address, its box in film pixels, how it fits and how solid. */
export interface ClipImage {
  src: string;
  box: { left: number; top: number; width: number; height: number };
  fit: "fill" | "fit";
  opacity: number;
}

/** One frame of a video as PNG bytes (null when ffmpeg can't get it, past the end for example). */
function videoFrame(ffmpeg: string, file: string, time: number): Promise<Buffer | null> {
  const args = [
    ...["-hide_banner", "-loglevel", "error", "-ss", String(Math.max(0, time)), "-i", file],
    ...["-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
  ];
  return new Promise((resolve) =>
    execFile(
      ffmpeg,
      args,
      { encoding: "buffer", maxBuffer: 64 << 20, timeout: 20_000, windowsHide: true },
      (error, stdout) => resolve(error || stdout.length === 0 ? null : stdout),
    ),
  );
}

/** The clips showing at film time `t`, in drawing order (lower tracks first). */
export async function clipImagesAt(
  filmDir: string,
  config: Pick<FilmConfig, "video" | "width" | "height">,
  t: number,
  ffmpeg: string | null,
): Promise<ClipImage[]> {
  const images: ClipImage[] = [];
  for (const clip of drawOrder(config.video)) {
    const path = resolveInside(filmDir, clip.file);
    if (!path) continue;
    const picture = isPicture(clip.file);
    let length = clipLength(clip);
    if (length === null && ffmpeg) {
      length = clipLength(clip, (await probeMedia(ffmpeg, path)).duration ?? undefined);
    }
    const time = clipTime(clip, t, length);
    const opacity = clipOpacity(clip, t, length);
    if (time === null || opacity <= 0) continue;
    let bytes: Buffer | null = null;
    if (picture) bytes = await readFile(path).catch(() => null);
    else if (ffmpeg) bytes = await videoFrame(ffmpeg, path, time);
    if (!bytes) continue;
    const type = picture ? contentTypeOf(path) : "image/png";
    images.push({
      src: `data:${type};base64,${bytes.toString("base64")}`,
      box: clipBox(clip, config.width, config.height),
      fit: clip.fit,
      opacity,
    });
  }
  return images;
}
