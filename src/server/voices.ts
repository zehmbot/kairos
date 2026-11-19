/**
 * A film's spoken lines: sound files in `voice/`, each with its word timings next to it (`<name>.words.json`),
 * listed in `voice/lines.json`. A line asked for again (same words, voice, speed and model) is reused, so it is
 * never paid twice. Word timings for any other sound (a recording) are saved the same way.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  type FilmVoice,
  type VoiceLine,
  VoiceLineSchema,
  type Word,
  WordSchema,
} from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { oneAtATime } from "./uploads.ts";
import { resolveInside } from "./workspace.ts";

export const VOICE_FOLDER = "voice";
const LINES_FILE = join(VOICE_FOLDER, "lines.json");

const LinesFileSchema = z.object({
  version: z.literal(1),
  lines: z.array(VoiceLineSchema),
  /** Each speaker's next file number. Numbers are never used twice, so a new take always gets a new file
   * name and the app never mistakes it for the old one. */
  next: z.record(z.string(), z.number().int().min(1)).default({}),
});
type LinesFile = z.infer<typeof LinesFileSchema>;

/** The word timings saved next to a sound file. */
export const WordsFileSchema = z.object({
  version: z.literal(1),
  text: z.string(),
  duration: z.number(),
  words: z.array(WordSchema),
  /** How the timings were found: with the speech (fish.audio TTS) or from the recording (ASR). */
  source: z.enum(["speech", "transcript"]),
});
export type WordsFile = z.infer<typeof WordsFileSchema>;

/** `voice/narrator-1.mp3` → `voice/narrator-1.words.json` */
export const wordsFileOf = (file: string) => `${file.replace(/\.[^./]+$/, "")}.words.json`;

/** lines.json is broken. The message is shown as-is. */
export class LinesFileError extends Error {}

export async function readLines(filmDir: string): Promise<VoiceLine[]> {
  return (await readLinesFile(filmDir)).lines;
}

async function readLinesFile(filmDir: string): Promise<LinesFile> {
  let text: string;
  try {
    text = await readFile(join(filmDir, LINES_FILE), "utf8");
  } catch {
    return { version: 1, lines: [], next: {} };
  }
  try {
    return LinesFileSchema.parse(JSON.parse(text));
  } catch {
    throw new LinesFileError("voice/lines.json is broken, so Kairos won't change it.");
  }
}

function changeLines<T>(
  filmDir: string,
  change: (lines: VoiceLine[], next: Record<string, number>) => Promise<T> | T,
): Promise<T> {
  return oneAtATime(`${filmDir}|lines`, async () => {
    const file = await readLinesFile(filmDir);
    const result = await change(file.lines, file.next);
    await mkdir(join(filmDir, VOICE_FOLDER), { recursive: true });
    await writeFileAtomic(join(filmDir, LINES_FILE), `${JSON.stringify(file, null, 2)}\n`);
    return result;
  });
}

const fingerprint = (text: string, voiceId: string, speed: number, model: string) =>
  createHash("sha256")
    .update(JSON.stringify([text, voiceId, speed, model]))
    .digest("hex")
    .slice(0, 16);

export async function writeWords(
  filmDir: string,
  file: string,
  words: Omit<WordsFile, "version">,
): Promise<void> {
  const path = resolveInside(filmDir, wordsFileOf(file));
  if (!path) throw new Error("bad path");
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify({ version: 1, ...words }, null, 2)}\n`);
}

export async function readWords(filmDir: string, file: string): Promise<WordsFile | null> {
  const path = resolveInside(filmDir, wordsFileOf(file));
  if (!path) return null;
  try {
    return WordsFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** What making speech needs: a function that turns one text into sound and words (fish.audio, or a fake). */
export type Speak = (text: string) => Promise<{ audio: Buffer; words: Word[]; duration: number }>;

/**
 * Makes lines for a speaker, one after the other (fish.audio limits parallel requests). Lines asked for before
 * (same words, voice, speed and model, file still there) are reused. Returns the lines in order.
 */
export function makeLines(
  filmDir: string,
  input: {
    speaker: string;
    voice: FilmVoice;
    texts: readonly string[];
    speed: number;
    model: string;
  },
  speak: Speak,
): Promise<VoiceLine[]> {
  return changeLines(filmDir, async (lines, next) => {
    const made: VoiceLine[] = [];
    for (const text of input.texts) {
      const id = fingerprint(text, input.voice.id, input.speed, input.model);
      const known = lines.find((line) => line.id === id);
      if (known && (await exists(join(filmDir, known.file)))) {
        made.push(known);
        continue;
      }
      const spoken = await speak(text);
      const numbers = lines
        .filter((line) => line.speaker === input.speaker)
        .map((line) => Number(/-(\d+)\.[^./]+$/.exec(line.file)?.[1] ?? 0));
      let n = Math.max(next[input.speaker] ?? 1, ...numbers.map((number) => number + 1));
      const taken = async (name: string) =>
        lines.some((line) => line.file === name) || (await exists(join(filmDir, name)));
      while (await taken(`${VOICE_FOLDER}/${input.speaker}-${n}.mp3`)) n++;
      next[input.speaker] = n + 1;
      const file = `${VOICE_FOLDER}/${input.speaker}-${n}.mp3`;
      await mkdir(join(filmDir, VOICE_FOLDER), { recursive: true });
      await writeFile(join(filmDir, file), spoken.audio);
      const duration = spoken.duration || spoken.words.at(-1)?.end || 0;
      await writeWords(filmDir, file, { text, duration, words: spoken.words, source: "speech" });
      const line: VoiceLine = {
        id,
        speaker: input.speaker,
        voiceId: input.voice.id,
        voiceName: input.voice.name,
        text,
        speed: input.speed,
        model: input.model,
        file,
        duration,
        words: spoken.words,
        createdAt: new Date().toISOString(),
      };
      const index = lines.findIndex((entry) => entry.id === id);
      if (index >= 0) lines.splice(index, 1, line);
      else lines.push(line);
      made.push(line);
    }
    return made;
  });
}

/** Deletes a line, its sound and its words. Returns the line (null when there was none). */
export function deleteLine(filmDir: string, id: string): Promise<VoiceLine | null> {
  return changeLines(filmDir, async (lines) => {
    const index = lines.findIndex((line) => line.id === id);
    if (index < 0) return null;
    const [line] = lines.splice(index, 1);
    if (!line) return null;
    for (const path of [line.file, wordsFileOf(line.file)]) {
      const full = resolveInside(filmDir, path);
      if (full) await rm(full, { force: true });
    }
    return line;
  });
}
