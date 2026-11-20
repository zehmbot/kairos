/**
 * A film's script: what the voices say and when (`voice/script.json`), planned before the voices are made.
 * Making it turns each line into a voice line (reused when nothing changed, so never paid twice) and places it
 * at its time on the voice lane, after the line before when they would overlap.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { firstWords } from "../shared/script.ts";
import {
  type AudioTrack,
  AudioTrackSchema,
  type FilmVoice,
  type FilmVoices,
  type Script,
  type ScriptInput,
  ScriptSchema,
  type VoiceLine,
  type Word,
} from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { changeFilm, readFilmConfig } from "./films.ts";
import { oneAtATime } from "./uploads.ts";
import { deleteLine, makeLines, readLines, VOICE_FOLDER, voiceLane } from "./voices.ts";

export const SCRIPT_FILE = `${VOICE_FOLDER}/script.json`;

/** script.json is broken, or there is nothing to make. The message is shown as-is. */
export class ScriptFileError extends Error {}

const round = (t: number) => Math.round(t * 100) / 100;
const newId = () => randomBytes(5).toString("hex");

export async function readScript(filmDir: string): Promise<Script | null> {
  let text: string;
  try {
    text = await readFile(join(filmDir, SCRIPT_FILE), "utf8");
  } catch {
    return null;
  }
  try {
    return ScriptSchema.parse(JSON.parse(text));
  } catch {
    throw new ScriptFileError("voice/script.json is broken, so Kairos won't change it.");
  }
}

async function writeScript(filmDir: string, script: Script): Promise<void> {
  await mkdir(join(filmDir, VOICE_FOLDER), { recursive: true });
  await writeFileAtomic(join(filmDir, SCRIPT_FILE), `${JSON.stringify(script, null, 2)}\n`);
}

const lock = (filmDir: string) => `${filmDir}|script`;

/** Replaces the script's lines (and style, language, note when given). Lines without an id get one. */
export function saveScript(
  filmDir: string,
  input: ScriptInput,
  writtenBy: Script["writtenBy"],
): Promise<Script> {
  return oneAtATime(lock(filmDir), async () => {
    const before = await readScript(filmDir);
    const script = ScriptSchema.parse({
      version: 1,
      style: input.style ?? before?.style ?? "",
      language: input.language ?? before?.language ?? "en",
      note: input.note ?? before?.note ?? "",
      writtenBy,
      made: before?.made ?? [],
      lines: input.lines.map((line) => ({
        ...line,
        id: line.id ?? newId(),
        start: round(line.start),
      })),
      updatedAt: new Date().toISOString(),
    });
    await writeScript(filmDir, script);
    return script;
  });
}

export interface MadeScript {
  script: Script;
  /** Lines spoken now (paid) and lines reused. */
  made: number;
  reused: number;
  /** Each placed line: its file, where it starts on the film, its length and words. */
  placed: {
    id: string;
    speaker: string;
    file: string;
    start: number;
    duration: number;
    words: Word[];
  }[];
  warnings: string[];
}

export interface MakeScriptOptions {
  voices: FilmVoices;
  model: string;
  speak: (
    text: string,
    voice: FilmVoice,
  ) => Promise<{ audio: Buffer; words: Word[]; duration: number }>;
}

/**
 * Makes the voices of the script and puts them on the timeline at their times. Clips of lines the script no
 * longer has leave the timeline (and their files go). When fish.audio stops halfway (no credit...), what was made
 * is still placed and saved, then the problem is thrown.
 */
export function makeScript(filmDir: string, options: MakeScriptOptions): Promise<MadeScript> {
  return oneAtATime(lock(filmDir), async () => {
    const script = await readScript(filmDir);
    if (!script || script.lines.length === 0) {
      throw new ScriptFileError("This film has no script yet: write one first.");
    }
    const known = new Set((await readLines(filmDir)).map((line) => line.id));
    const order = [...script.lines].sort((a, b) => a.start - b.start);
    const spoken = new Map<string, VoiceLine>();
    const warnings: string[] = [];
    let made = 0;
    let reused = 0;
    let failure: unknown = null;

    for (const line of order) {
      const voice = options.voices[line.speaker];
      if (!voice) {
        warnings.push(
          `${line.speaker} has no voice yet, so "${firstWords(line.text)}" wasn't made.`,
        );
        continue;
      }
      try {
        const [result] = await makeLines(
          filmDir,
          { speaker: line.speaker, voice, texts: [line.text], speed: 1, model: options.model },
          (text) => options.speak(text, voice),
        );
        if (!result) continue;
        if (known.has(result.id)) reused++;
        else made++;
        known.add(result.id);
        spoken.set(line.id, result);
      } catch (error) {
        failure = error;
        break;
      }
    }

    // The timeline: old script clips out, the new ones in at their times, one after the other.
    const config = (await readFilmConfig(filmDir))?.config;
    const allLines = await readLines(filmDir);
    const fileOf = (id: string | undefined) => allLines.find((line) => line.id === id)?.file;
    // Lines not made this time (fish.audio stopped, or no voice) keep the take they had.
    for (const line of order) {
      if (spoken.has(line.id) || !line.line) continue;
      const old = allLines.find((entry) => entry.id === line.line);
      if (old) spoken.set(line.id, old);
    }
    const scriptFiles = new Set(
      [
        ...script.lines.map((line) => fileOf(line.line)),
        ...script.made.map((id) => fileOf(id)),
        ...[...spoken.values()].map((line) => line.file),
      ].filter((file): file is string => Boolean(file)),
    );
    const audio: AudioTrack[] = (config?.audio ?? []).filter(
      (track) => !scriptFiles.has(track.file),
    );
    const lane = voiceLane(audio);
    const placed: MadeScript["placed"] = [];
    let end = 0;
    for (const line of order) {
      const result = spoken.get(line.id);
      if (!result) continue;
      let start = round(line.start);
      if (start < end - 0.01) {
        const later = round(end + 0.1);
        warnings.push(
          `"${firstWords(line.text)}" starts at ${later} s instead of ${start} s, so it doesn't talk over the line before.`,
        );
        start = later;
      }
      end = start + result.duration;
      placed.push({
        id: line.id,
        speaker: line.speaker,
        file: result.file,
        start,
        duration: result.duration,
        words: result.words,
      });
    }
    const tracks = placed.map((at) =>
      AudioTrackSchema.parse({ file: at.file, start: at.start, lane }),
    );
    if (config) await changeFilm(filmDir, { audio: [...audio, ...tracks] });
    if (config && end > config.duration + 0.05) {
      warnings.push(
        `The voices end at ${round(end)} s, after the end of the film (${config.duration} s). Make the film longer.`,
      );
    }

    // Lines the script made before and no longer uses: their files go.
    const used = new Set([...spoken.values()].map((line) => line.id));
    const next: Script = {
      ...script,
      made: [...used],
      // A line moved later (so it doesn't talk over the one before) keeps its new start.
      lines: script.lines.map((line) => {
        const result = spoken.get(line.id);
        const at = placed.find((entry) => entry.id === line.id);
        return result ? { ...line, line: result.id, start: at?.start ?? line.start } : line;
      }),
    };
    // Made before, used no more (a line taken out or changed): its files go.
    const stillUsed = new Set(next.lines.map((line) => line.line).filter(Boolean));
    const before = new Set([...script.made, ...script.lines.map((line) => line.line)]);
    for (const id of before) {
      if (id && !used.has(id) && !stillUsed.has(id)) await deleteLine(filmDir, id);
    }
    await writeScript(filmDir, next);
    if (failure) throw failure;
    return { script: next, made, reused, placed, warnings };
  });
}
