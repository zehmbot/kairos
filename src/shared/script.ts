import type { FilmVoices, ScriptLine, VoiceLine } from "./types.ts";

/**
 * Where a script line stands: its voice is made (and still matches), it changed since (words, speaker or
 * voice), it was never made, or its speaker has no voice yet.
 */
export type ScriptLineStatus = "made" | "changed" | "new" | "no-voice";

export function scriptLineStatus(
  line: ScriptLine,
  made: readonly VoiceLine[],
  voices: FilmVoices,
): ScriptLineStatus {
  const voice = voices[line.speaker];
  if (!voice) return "no-voice";
  if (!line.line) return "new";
  const spoken = made.find((entry) => entry.id === line.line);
  if (!spoken) return "new";
  return spoken.text === line.text && spoken.speaker === line.speaker && spoken.voiceId === voice.id
    ? "made"
    : "changed";
}

/** The first words of a line, for messages. */
export const firstWords = (text: string, count = 6): string => {
  const words = text.trim().split(/\s+/);
  return words.length > count ? `${words.slice(0, count).join(" ")}…` : text.trim();
};
