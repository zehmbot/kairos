import { needsVoice, type ScriptLineStatus, scriptLineStatus } from "../shared/script.ts";
import type { AudioTrack, ScriptLine } from "../shared/types.ts";
import { useFilmVoices, useLines, useScript } from "./api.ts";

export interface VoiceSummary {
  /** The script's lines, each with where it stands. */
  lines: { line: ScriptLine; status: ScriptLineStatus }[];
  /** Lines that need fish.audio: their words, speaker, voice or speed changed, or never made. */
  toVoice: number;
  /** Lines made but not on the timeline (Update puts them back, for free). */
  off: number;
  /** Lines whose speaker has no voice. */
  noVoice: number;
  /** Voice files on the timeline that are out of date (marked on their clips). */
  staleFiles: Set<string>;
}

/** Where a film's lines stand: for the Voice tab, its count, and the out-of-date marks on the timeline. */
export function useVoiceSummary(filmId: string, tracks: readonly AudioTrack[]): VoiceSummary {
  const script = useScript(filmId);
  const made = useLines(filmId).data ?? [];
  const voices = useFilmVoices(filmId).data ?? {};
  const lines = (script.data?.lines ?? []).map((line) => ({
    line,
    status: scriptLineStatus(line, made, voices, tracks),
  }));
  const staleFiles = new Set(
    lines.flatMap(({ line, status }) =>
      status === "changed" ? made.filter((entry) => entry.id === line.line).map((e) => e.file) : [],
    ),
  );
  return {
    lines,
    toVoice: lines.filter(({ status }) => needsVoice(status)).length,
    off: lines.filter(({ status }) => status === "off").length,
    noVoice: lines.filter(({ status }) => status === "no-voice").length,
    staleFiles,
  };
}
