/**
 * ffmpeg: turns rendered frames into video. Finds the ffmpeg already on the computer, checks which H.264
 * encoders really work (a listed GPU encoder may have no GPU behind it), and builds the command lines.
 * The command builders are pure functions, so they can be tested without running anything.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import type { ExportInfo, RenderEncoder, RenderQuality } from "../shared/types.ts";

/** Hardware encoders, in the order Kairos prefers them, then the CPU one. */
export const ENCODERS: readonly { id: RenderEncoder; name: string; gpu: boolean }[] = [
  { id: "h264_nvenc", name: "NVIDIA graphics card", gpu: true },
  { id: "h264_amf", name: "AMD graphics card", gpu: true },
  { id: "h264_qsv", name: "Intel graphics", gpu: true },
  { id: "libx264", name: "CPU (x264)", gpu: false },
];

/** Where ffmpeg may be: `KAIROS_FFMPEG`, then each PATH folder. */
export function ffmpegCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const path = platform === "win32" ? win32 : posix;
  const name = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const dirs = (env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  const list = dirs.map((dir) => path.join(dir, name));
  return env.KAIROS_FFMPEG ? [env.KAIROS_FFMPEG, ...list] : list;
}

export function findFfmpeg(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): string | null {
  return ffmpegCandidates(platform, env).find((path) => exists(path)) ?? null;
}

/** ffprobe sits next to ffmpeg in every normal install. */
export function ffprobeNextTo(ffmpeg: string): string {
  return ffmpeg.replace(
    /ffmpeg(\.exe)?$/i,
    (_match, exe: string | undefined) => `ffprobe${exe ?? ""}`,
  );
}

/** Encoder settings for a quality. "high" looks the same as the film; "small" trades a little for size. */
export function encoderArgs(encoder: RenderEncoder, quality: RenderQuality): string[] {
  const high = quality === "high";
  switch (encoder) {
    case "h264_nvenc":
      return [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p6",
        "-tune",
        "hq",
        "-rc",
        "vbr",
        "-cq",
        high ? "19" : "25",
        "-b:v",
        "0",
      ];
    case "h264_amf":
      return [
        "-c:v",
        "h264_amf",
        "-quality",
        "quality",
        "-rc",
        "cqp",
        "-qp_i",
        high ? "18" : "24",
        "-qp_p",
        high ? "20" : "26",
      ];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-preset", "slower", "-global_quality", high ? "20" : "26"];
    case "libx264":
      return ["-c:v", "libx264", "-preset", high ? "slow" : "medium", "-crf", high ? "16" : "22"];
  }
}

export interface ChunkEncoding {
  encoder: RenderEncoder;
  quality: RenderQuality;
  fps: number;
  width: number;
  height: number;
  /** The chunk file to write (MP4, video only). */
  output: string;
}

/**
 * ffmpeg reading PNG frames on stdin and writing one video chunk. Every chunk uses the same settings and
 * starts on a keyframe, so the chunks can be joined later without encoding again.
 */
export function chunkArgs(chunk: ChunkEncoding): string[] {
  // H.264 in yuv420p needs even sizes: pad odd ones by a pixel. BT.709 keeps colors as the page drew them.
  const filters = [
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "scale=out_color_matrix=bt709:out_range=tv",
    "format=yuv420p",
  ];
  const gop = Math.max(1, Math.round(chunk.fps * 2));
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(chunk.fps),
    "-c:v",
    "png",
    "-i",
    "-",
    "-vf",
    filters.join(","),
    ...encoderArgs(chunk.encoder, chunk.quality),
    "-g",
    String(gop),
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-an",
    "-f",
    "mp4",
    chunk.output,
  ];
}

/** A sound file to mix into the video, placed on the film's timeline. */
export interface SoundTrack {
  path: string;
  /** Seconds from the start of the film. */
  start: number;
  /** 1 = as it is, 0 to 2. */
  volume: number;
}

/**
 * The audio filter that places each track (input 1, 2, ...) at its start and volume, mixes them without
 * turning them down (`normalize=0`) and pads with silence, so the sound is never shorter than the film.
 */
export function mixFilter(tracks: readonly SoundTrack[]): string {
  const parts = tracks.map((track, i) => {
    const delay = Math.round(track.start * 1000);
    const steps = [
      "aresample=48000",
      ...(delay > 0 ? [`adelay=delays=${delay}:all=1`] : []),
      `volume=${track.volume}`,
    ];
    return `[${i + 1}:a]${steps.join(",")}[a${i}]`;
  });
  const labels = tracks.map((_, i) => `[a${i}]`).join("");
  const mix =
    tracks.length === 1
      ? `${labels}apad[aout]`
      : `${labels}amix=inputs=${tracks.length}:normalize=0:dropout_transition=0,apad[aout]`;
  return [...parts, mix].join(";");
}

/**
 * Joins the chunks listed in `listFile` (ffmpeg concat format) into the final video, without encoding
 * the picture again. With sound, the tracks are mixed in (AAC) and cut at the film's `duration`.
 */
export function joinArgs(
  listFile: string,
  output: string,
  sound?: { tracks: readonly SoundTrack[]; duration: number },
): string[] {
  const head = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
  ];
  const tail = ["-movflags", "+faststart", "-f", "mp4", output];
  if (!sound || sound.tracks.length === 0) return [...head, "-c", "copy", ...tail];
  return [
    ...head,
    ...sound.tracks.flatMap((track) => ["-i", track.path]),
    "-filter_complex",
    mixFilter(sound.tracks),
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(sound.duration),
    ...tail,
  ];
}

/** One line of an ffmpeg concat list. */
export const concatLine = (file: string) =>
  `file '${file.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(file: string, args: string[], timeout = 20_000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      const code = (error as (Error & { code?: unknown }) | null)?.code;
      resolve({ code: error ? (typeof code === "number" ? code : -1) : 0, stdout, stderr });
    });
  });
}

/** Runs ffmpeg to the end. Rejects with ffmpeg's own last words when it fails. */
export function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg failed: ${stderr.trim() || `exit ${code}`}`)),
    );
  });
}

/** Does `encoder` really work here? Encodes one tiny black frame to nowhere. */
async function works(ffmpeg: string, encoder: RenderEncoder): Promise<boolean> {
  const result = await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=256x256:d=0.1",
    "-frames:v",
    "1",
    ...encoderArgs(encoder, "high"),
    "-pix_fmt",
    "yuv420p",
    "-f",
    "null",
    "-",
  ]);
  return result.code === 0;
}

/** Finds ffmpeg and the encoders that work. Takes a few seconds: call it once and keep the answer. */
export async function probeExport(ffmpeg: string | null = findFfmpeg()): Promise<ExportInfo> {
  if (!ffmpeg) return { ffmpeg: null, encoders: [] };
  const version = await run(ffmpeg, ["-hide_banner", "-version"]);
  if (version.code !== 0) return { ffmpeg: null, encoders: [] };
  const name = version.stdout.match(/ffmpeg version (\S+)/)?.[1] ?? "unknown";
  const results = await Promise.all(
    ENCODERS.map(async (entry) => ((await works(ffmpeg, entry.id)) ? entry : null)),
  );
  return {
    ffmpeg: { path: ffmpeg, version: name },
    encoders: results.filter((entry) => entry !== null),
  };
}
