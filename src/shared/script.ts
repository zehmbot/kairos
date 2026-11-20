import type { AudioTrack, FilmVoices, ScriptLine, VoiceLine } from "./types.ts";

/**
 * Where a script line stands:
 * - `made`: its voice is made and still matches;
 * - `changed`: the words, speaker, voice or speed changed since it was made;
 * - `new`: it was never made;
 * - `no-voice`: its speaker has no voice yet;
 * - `off`: it is made, but its clip isn't on the timeline (only told when `tracks` are given).
 */
export type ScriptLineStatus = "made" | "changed" | "new" | "no-voice" | "off";

export function scriptLineStatus(
  line: Pick<ScriptLine, "speaker" | "text" | "line"> & { speed?: number },
  made: readonly VoiceLine[],
  voices: FilmVoices,
  tracks?: readonly AudioTrack[],
): ScriptLineStatus {
  const voice = voices[line.speaker];
  if (!voice) return "no-voice";
  if (!line.line) return "new";
  const spoken = made.find((entry) => entry.id === line.line);
  if (!spoken) return "new";
  const same =
    spoken.text === line.text &&
    spoken.speaker === line.speaker &&
    spoken.voiceId === voice.id &&
    Math.abs(spoken.speed - (line.speed ?? 1)) < 0.001;
  if (!same) return "changed";
  if (tracks && !tracks.some((track) => track.file === spoken.file)) return "off";
  return "made";
}

/** Statuses that need fish.audio (credits) to fix. */
export const needsVoice = (status: ScriptLineStatus) => status === "changed" || status === "new";

/** The first words of a line, for messages. */
export const firstWords = (text: string, count = 6): string => {
  const words = text.trim().split(/\s+/);
  return words.length > count ? `${words.slice(0, count).join(" ")}…` : text.trim();
};
