/**
 * A film's script: what the voices say and when (`voice/script.json`), planned before the voices are made.
 * Making it turns each line into a voice line (reused when nothing changed, so never paid twice) and places it
 * on the voice lane:
 * - "timed" films (the default): at its time, after the line before when they would overlap;
 * - "packed" films (kairos.json `narration`): back to back in script order, each clip trimmed to its words, so the
 *   narration never stops. The starts in the script only give the order.
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
  LINE_ID_PATTERN,
  type Script,
  type ScriptInput,
  type ScriptLine,
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
const round3 = (t: number) => Math.round(t * 1000) / 1000;

/** Packed narration: silence kept before a line's first word and after its last, and the gaps between lines. */
export const PACKED = { lead: 0.04, tail: 0.08, gap: 0.12, sentenceGap: 0.28, first: 0.1 };

/** Where a packed line's clip starts in its file and how long it plays: its words, and a breath around them. */
export function trimToWords(
  words: readonly Word[],
  duration: number,
): { from: number; length: number } {
  const first = words[0];
  const last = words.at(-1);
  if (!first || !last) return { from: 0, length: duration };
  const from = round3(Math.max(0, first.start - PACKED.lead));
  const end = Math.min(duration, last.end + PACKED.tail);
  return { from, length: round3(Math.max(0.05, end - from)) };
}

/** The pause after a line: longer when it ends a sentence. */
export const gapAfter = (text: string) =>
  /[.!?…]["')\]]*\s*$/.test(text.trim()) ? PACKED.sentenceGap : PACKED.gap;
const newId = () => randomBytes(5).toString("hex");

export async function readScript(filmDir: string): Promise<Script | null> {
  let text: string;
  try {
    text = await readFile(join(filmDir, SCRIPT_FILE), "utf8");
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(text);
    // Scripts from before each line had its author: the lines are by whoever wrote the script.
    if (Array.isArray(raw?.lines)) {
      for (const line of raw.lines) line.by ??= raw.writtenBy === "claude" ? "claude" : "you";
    }
    return ScriptSchema.parse(raw);
  } catch {
    throw new ScriptFileError("voice/script.json is broken, so Kairos won't change it.");
  }
}

async function writeScript(filmDir: string, script: Script): Promise<void> {
  await mkdir(join(filmDir, VOICE_FOLDER), { recursive: true });
  await writeFileAtomic(join(filmDir, SCRIPT_FILE), `${JSON.stringify(script, null, 2)}\n`);
}

const lock = (filmDir: string) => `${filmDir}|script`;

/**
 * Replaces the script's lines (and style, language, note when given). Lines without an id get one, and lines
 * without an author are written by `writtenBy`.
 */
export function saveScript(
  filmDir: string,
  input: ScriptInput,
  writtenBy: Script["writtenBy"],
): Promise<Script> {
  return oneAtATime(lock(filmDir), async () => {
    const before = await readScript(filmDir);
    // Ids are keys (a Blocky shot names its line by id): a missing or repeated one gets a new id.
    const ids = new Set<string>();
    const idOf = (id: string | undefined) => {
      const free = id && LINE_ID_PATTERN.test(id) && !ids.has(id) ? id : newId();
      ids.add(free);
      return free;
    };
    const script = ScriptSchema.parse({
      version: 1,
      style: input.style ?? before?.style ?? "",
      language: input.language ?? before?.language ?? "en",
      note: input.note ?? before?.note ?? "",
      writtenBy,
      made: before?.made ?? [],
      lines: input.lines.map((line) => ({
        ...line,
        id: idOf(line.id),
        by: line.by ?? writtenBy,
        start: round(line.start),
      })),
      updatedAt: new Date().toISOString(),
    });
    await writeScript(filmDir, script);
    return script;
  });
}

/** Script lines for voice lines already made and placed (`by` wrote them). */
const linesFor = (placed: readonly { line: VoiceLine; start: number }[], by: ScriptLine["by"]) =>
  placed.map(({ line, start }) => ({
    id: newId(),
    speaker: line.speaker,
    text: line.text,
    start: round(start),
    line: line.id,
    by,
    speed: line.speed,
  }));

/** The script with more lines that are already made (they join `made`). */
async function withMade(
  filmDir: string,
  script: Script | null,
  placed: readonly { line: VoiceLine; start: number }[],
  by: ScriptLine["by"],
): Promise<Script> {
  // A line the script already has (the same words reused) isn't added twice.
  const has = new Set(script?.lines.map((line) => line.line));
  const fresh = placed.filter((entry) => !has.has(entry.line.id));
  const next = ScriptSchema.parse({
    version: 1,
    ...(script ?? {}),
    made: [...new Set([...(script?.made ?? []), ...fresh.map((entry) => entry.line.id)])],
    lines: [...(script?.lines ?? []), ...linesFor(fresh, by)],
    updatedAt: new Date().toISOString(),
  });
  await writeScript(filmDir, next);
  return next;
}

/**
 * Lines made outside the script (before there was one list) that are on the timeline join it, so the Voice tab
 * has one list. Returns the script (null when there is none and nothing to add).
 */
export function adoptLooseLines(filmDir: string): Promise<Script | null> {
  return oneAtATime(lock(filmDir), () => adopt(filmDir));
}

async function adopt(filmDir: string): Promise<Script | null> {
  const script = await readScript(filmDir);
  const spoken = await readLines(filmDir);
  const audio = (await readFilmConfig(filmDir))?.config?.audio ?? [];
  // Lines the script made (or knows) aren't loose: a line you deleted stays deleted.
  const used = new Set([
    ...(script?.lines.map((line) => line.line) ?? []),
    ...(script?.made ?? []),
  ]);
  const loose = spoken.flatMap((line) => {
    if (used.has(line.id)) return [];
    const track = audio.find((entry) => entry.file === line.file);
    return track ? [{ line, start: track.start }] : [];
  });
  return loose.length > 0 ? withMade(filmDir, script, loose, "you") : script;
}

/** Lines just made and placed one at a time (kairos_say) go into the script too. */
export function addToScript(
  filmDir: string,
  placed: readonly { line: VoiceLine; start: number }[],
  by: ScriptLine["by"],
): Promise<Script> {
  return oneAtATime(lock(filmDir), async () =>
    withMade(filmDir, await readScript(filmDir), placed, by),
  );
}

/**
 * The timeline changed: a voice clip moved there moves its script line too (so making the script again doesn't
 * move it back), and a voice clip taken out takes its line out. Its files stay until the next making, so when the
 * timeline's Undo brings the clip back, its line comes back too. Returns true when the script changed.
 */
export function syncScriptWithTimeline(
  filmDir: string,
  before: readonly AudioTrack[],
  after: readonly AudioTrack[],
): Promise<boolean> {
  return oneAtATime(lock(filmDir), async () => {
    const script = await readScript(filmDir).catch(() => null);
    if (!script) return false;
    const spoken = await readLines(filmDir);
    let changed = false;
    const lines = script.lines.flatMap((line) => {
      const file = spoken.find((entry) => entry.id === line.line)?.file;
      if (!file) return [line];
      const track = after.find((entry) => entry.file === file);
      if (!track) {
        const removed = before.some((entry) => entry.file === file);
        if (removed) changed = true;
        return removed ? [] : [line];
      }
      if (Math.abs(track.start - line.start) < 0.005) return [line];
      changed = true;
      return [{ ...line, start: round(track.start) }];
    });
    // Clips back on the timeline (Undo) of lines the script made: their lines come back.
    const used = new Set(lines.map((line) => line.line));
    const back = spoken.flatMap((line) => {
      if (used.has(line.id) || !script.made.includes(line.id)) return [];
      if (before.some((entry) => entry.file === line.file)) return [];
      const track = after.find((entry) => entry.file === line.file);
      return track ? [{ line, start: track.start }] : [];
    });
    if (back.length > 0) changed = true;
    if (changed) {
      await writeScript(filmDir, {
        ...script,
        lines: [...lines, ...linesFor(back, "you")],
        updatedAt: new Date().toISOString(),
      });
    }
    return changed;
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
  /**
   * Makes a voice with fish.audio. Left out: nothing is spoken (no credits) and the lines only move to their
   * times. Lines that changed keep the take they had, and files stay (so a deleted line can come back).
   */
  speak?: (
    text: string,
    voice: FilmVoice,
    speed: number,
  ) => Promise<{ audio: Buffer; words: Word[]; duration: number }>;
  /** Speak only these lines (script line ids); the others keep the take they had. */
  only?: readonly string[];
  /** A new take of the lines spoken, even when nothing changed. */
  fresh?: boolean;
}

/**
 * Makes the voices of the script and puts them on the timeline at their times. Clips of lines the script no
 * longer has leave the timeline (and their files go). When fish.audio stops halfway (no credit...), what was made
 * is still placed and saved, then the problem is thrown.
 */
export function makeScript(filmDir: string, options: MakeScriptOptions): Promise<MadeScript> {
  return oneAtATime(lock(filmDir), async () => {
    const script = await adopt(filmDir);
    const { speak } = options;
    if (!script) throw new ScriptFileError("This film has no script yet: write one first.");
    if (script.lines.length === 0 && speak) {
      throw new ScriptFileError("This film has no lines yet: write some first.");
    }
    const earlier = await readLines(filmDir);
    const known = new Set(earlier.map((line) => line.id));
    const order = [...script.lines].sort((a, b) => a.start - b.start);
    const only = options.only ? new Set(options.only) : null;
    const spoken = new Map<string, VoiceLine>();
    const warnings: string[] = [];
    let made = 0;
    let reused = 0;
    let failure: unknown = null;

    const say = speak ?? (() => Promise.reject(new ScriptFileError("Nothing is spoken here.")));
    for (const line of speak ? order.filter((entry) => !only || only.has(entry.id)) : []) {
      const voice = options.voices[line.speaker];
      if (!voice) {
        warnings.push(
          `${line.speaker} has no voice yet, so "${firstWords(line.text)}" wasn't made.`,
        );
        continue;
      }
      try {
        // A new take: the old one goes first (the same words would reuse it).
        if (options.fresh && line.line) {
          await deleteLine(filmDir, line.line);
          known.delete(line.line);
        }
        const [result] = await makeLines(
          filmDir,
          {
            speaker: line.speaker,
            voice,
            texts: [line.text],
            speed: line.speed,
            model: options.model,
          },
          (text) => say(text, voice, line.speed),
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
    // Every file a line had, now or before this making (a new take has a new file).
    const filesOf = (id: string | undefined) =>
      [...allLines, ...earlier].filter((line) => line.id === id).map((line) => line.file);
    // Lines not made this time (fish.audio stopped, or no voice) keep the take they had.
    for (const line of order) {
      if (spoken.has(line.id) || !line.line) continue;
      const old = allLines.find((entry) => entry.id === line.line);
      if (old) spoken.set(line.id, old);
    }
    const scriptFiles = new Set([
      ...script.lines.flatMap((line) => filesOf(line.line)),
      ...script.made.flatMap((id) => filesOf(id)),
      ...[...spoken.values()].map((line) => line.file),
    ]);
    const audio: AudioTrack[] = (config?.audio ?? []).filter(
      (track) => !scriptFiles.has(track.file),
    );
    const lane = voiceLane(audio);
    const packed = config?.narration === "packed";
    const placed: (MadeScript["placed"][number] & { from: number })[] = [];
    let end = 0;
    let previous: ScriptLine | null = null;
    for (const line of order) {
      const result = spoken.get(line.id);
      if (!result) continue;
      let start = round(line.start);
      let from = 0;
      let length = result.duration;
      if (packed) {
        // Back to back: trimmed to its words, right after the line before.
        ({ from, length } = trimToWords(result.words, result.duration));
        start = previous ? round3(end + gapAfter(previous.text)) : PACKED.first;
      } else if (start < end - 0.01) {
        const later = round(end + 0.1);
        warnings.push(
          `"${firstWords(line.text)}" starts at ${later} s instead of ${start} s, so it doesn't talk over the line before.`,
        );
        start = later;
      }
      end = start + length;
      previous = line;
      placed.push({
        id: line.id,
        speaker: line.speaker,
        file: result.file,
        start,
        duration: length,
        from,
        // Words in the clip as it plays (seconds from its start on the film).
        words: result.words
          .filter((word) => word.start >= from - 0.01 && word.start < from + length)
          .map((word) => ({
            ...word,
            start: round3(word.start - from),
            end: round3(Math.min(word.end, from + length) - from),
          })),
      });
    }
    const tracks = placed.map((at) =>
      AudioTrackSchema.parse({
        file: at.file,
        start: at.start,
        lane,
        ...(packed && at.from > 0 ? { from: at.from } : {}),
        ...(packed ? { length: at.duration } : {}),
      }),
    );
    if (config) await changeFilm(filmDir, { audio: [...audio, ...tracks] });
    if (config && speak && end > config.duration + 0.05) {
      warnings.push(
        `The voices end at ${round(end)} s, after the end of the film (${config.duration} s). Make the film longer.`,
      );
    }

    // Lines the script made before and no longer uses: their files go.
    const used = new Set([...spoken.values()].map((line) => line.id));
    const next: Script = {
      ...script,
      // Only moving: what was made before stays known, so its files go at the next real making.
      made: speak ? [...used] : [...new Set([...script.made, ...used])],
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
    for (const id of speak ? before : []) {
      if (id && !used.has(id) && !stillUsed.has(id)) await deleteLine(filmDir, id);
    }
    await writeScript(filmDir, next);
    if (failure) throw failure;
    return { script: next, made, reused, placed, warnings };
  });
}
