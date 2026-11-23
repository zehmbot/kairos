import { useEffect, useRef, useState } from "react";
import { firstWords, type ScriptLineStatus, scriptLineStatus } from "../../shared/script.ts";
import type { AudioTrack, FilmVoices, ScriptLine, VoiceLine } from "../../shared/types.ts";
import { useMakeScript, useSaveScript, useScript } from "../api.ts";
import { formatLength } from "../player/time.ts";
import { useSample } from "../useSample.ts";
import { speakerName } from "./CastList.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

export const STATUS_WORDS: Record<ScriptLineStatus, string> = {
  made: "Made",
  changed: "Out of date",
  new: "Not made",
  "no-voice": "No voice",
  off: "Not on the timeline",
};

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5];
/** How long after the last key press edits are saved (ms), and how long Undo stays after a delete. */
const SAVE_AFTER = 700;
const UNDO_FOR = 8000;

type Row = Pick<ScriptLine, "speaker" | "text" | "start" | "line" | "by" | "speed"> & {
  id?: string;
  /** Stable key for React (the line's id once saved). */
  key: string;
};

let fresh = 0;

interface LinesListProps {
  filmId: string;
  voices: FilmVoices;
  /** The voice lines made so far (to tell what is made, and to play it). */
  lines: readonly VoiceLine[];
  tracks: readonly AudioTrack[];
  hasKey: boolean;
  /** The player's time now: added lines start there. */
  now: () => number;
  onSeek: (t: number) => void;
  /** Selects a clip on the timeline. */
  onShowClip: (file: string) => void;
  /** Address of a film file on the film server (to play a line). */
  fileUrl: (file: string) => string;
  /** A voice clip clicked on the timeline: its line comes into view and lights up. */
  focus: { file: string; n: number } | null;
}

/**
 * Every spoken line of the film in one list (the script): who says what and when, who wrote it, and whether its
 * voice is made. Edits save by themselves; free changes (time, delete) apply at once, the rest waits for Update.
 */
export function LinesList({
  filmId,
  voices,
  lines,
  tracks,
  hasKey,
  now,
  onSeek,
  onShowClip,
  fileUrl,
  focus,
}: LinesListProps) {
  const script = useScript(filmId);
  const save = useSaveScript(filmId);
  const take = useMakeScript(filmId);
  const sample = useSample();
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [undo, setUndo] = useState<{ rows: Row[]; words: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // The line whose time and speed are open.
  const [timing, setTiming] = useState<string | null>(null);
  const version = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<(() => void) | null>(null);
  const elements = useRef(new Map<string, HTMLLIElement>());
  const focusNew = useRef<string | null>(null);

  const saved = script.data ?? null;
  const rows: Row[] =
    draft ??
    [...(saved?.lines ?? [])]
      .sort((a, b) => a.start - b.start)
      .map((line) => ({ ...line, key: line.id }));
  const speakers = [...new Set([...Object.keys(voices), ...rows.map((row) => row.speaker)])];
  if (speakers.length === 0) speakers.push("narrator");
  const spokenOf = (row: Row) => lines.find((line) => line.id === row.line);
  const statusOf = (row: Row) => scriptLineStatus(row, lines, voices, tracks);

  /** Saves the rows (all of them: the script is replaced). Lines being typed again wait until they have words. */
  const flush = async (next: Row[], at: number) => {
    pending.current = null;
    if (next.some((row) => row.id && !row.text.trim())) return;
    try {
      await save.mutateAsync({
        lines: next
          .filter((row) => row.text.trim())
          .map(({ key: _key, ...row }) => ({
            ...row,
            text: row.text.trim(),
            start: Math.max(0, Math.round(row.start * 100) / 100),
          })),
      });
      // Show what was saved (a start may have moved), unless you kept typing.
      if (version.current === at && next.every((row) => row.text.trim())) setDraft(null);
    } catch {
      // save.error says what went wrong; the draft stays.
    }
  };

  const commit = (next: Row[], wait = SAVE_AFTER) => {
    setDraft(next);
    version.current += 1;
    const at = version.current;
    window.clearTimeout(timer.current);
    pending.current = () => void flush(next, at);
    timer.current = window.setTimeout(() => pending.current?.(), wait);
  };

  // Leaving the tab saves what is waiting.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      pending.current?.();
    },
    [],
  );

  const change = (key: string, patch: Partial<Row>, wait?: number) =>
    commit(
      rows.map((row) => {
        if (row.key !== key) return row;
        // Your words or speaker on a line Claude wrote: it is yours now (Write it again keeps it).
        const mine = patch.text !== undefined || patch.speaker !== undefined;
        return { ...row, ...patch, ...(mine ? { by: "you" as const } : {}) };
      }),
      wait,
    );

  const remove = (row: Row) => {
    setUndo({ rows, words: firstWords(row.text, 4) });
    commit(
      rows.filter((entry) => entry.key !== row.key),
      0,
    );
  };

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), UNDO_FOR);
    return () => window.clearTimeout(id);
  }, [undo]);

  const addLine = () => {
    const key = `new-${fresh++}`;
    focusNew.current = key;
    setDraft([
      ...rows,
      {
        key,
        speaker: speakers[0] ?? "narrator",
        text: "",
        start: Math.round(now() * 10) / 10,
        by: "you",
        speed: 1,
      },
    ]);
  };

  // A line added: type its words at once.
  useEffect(() => {
    const key = focusNew.current;
    if (!key) return;
    const element = elements.current.get(key);
    if (!element) return;
    focusNew.current = null;
    element.scrollIntoView({ block: "nearest" });
    element.querySelector("textarea")?.focus();
  });

  // A clip clicked on the timeline: its line comes into view and lights up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new click (n) moves the list.
  useEffect(() => {
    if (!focus) return;
    const row = rows.find((entry) => spokenOf(entry)?.file === focus.file);
    if (!row) return;
    elements.current.get(row.key)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlash(row.key);
    const id = window.setTimeout(() => setFlash(null), 2000);
    return () => window.clearTimeout(id);
  }, [focus?.n]);

  const goTo = (row: Row) => {
    onSeek(row.start);
    const file = spokenOf(row)?.file;
    if (file && tracks.some((track) => track.file === file)) onShowClip(file);
  };

  return (
    <PixelPanel
      title={`Lines (${rows.filter((row) => row.text.trim()).length})`}
      actions={
        <PixelButton
          variant="ghost"
          data-size="small"
          icon="plus"
          tip="Add a line"
          onClick={addLine}
        />
      }
    >
      <div className="stack">
        {rows.length === 0 && (
          <p className="hint">
            No lines yet. Write them with Claude below, or add one with + (it starts at the
            playhead).
          </p>
        )}
        {saved?.note && <p className="hint">{saved.note}</p>}
        {undo && (
          <div className="undo-toast" role="status">
            <p>Deleted "{undo.words}".</p>
            <PixelButton
              variant="ghost"
              data-size="small"
              icon="undo"
              onClick={() => {
                commit(undo.rows, 0);
                setUndo(null);
              }}
            >
              Undo
            </PixelButton>
          </div>
        )}
        {rows.length > 0 && (
          <ul className="script-lines">
            {rows.map((row) => {
              const status = statusOf(row);
              const spoken = spokenOf(row);
              const playable = spoken && status !== "new" && status !== "no-voice";
              return (
                <li
                  key={row.key}
                  ref={(element) => {
                    if (element) elements.current.set(row.key, element);
                    else elements.current.delete(row.key);
                  }}
                  className="script-line px-box"
                  data-flash={flash === row.key ? "" : undefined}
                >
                  <div className="script-line-head">
                    <select
                      className="script-speaker"
                      value={row.speaker}
                      aria-label="Who says it"
                      data-tip="Who says it"
                      onChange={(event) => change(row.key, { speaker: event.target.value }, 0)}
                    >
                      {speakers.map((speaker) => (
                        <option key={speaker} value={speaker}>
                          {speakerName(speaker)}
                        </option>
                      ))}
                    </select>
                    <span className="script-when">
                      at {formatLength(row.start)}
                      {row.speed !== 1 && ` · ${row.speed}×`}
                    </span>
                    <PixelButton
                      variant="ghost"
                      data-size="small"
                      icon="pen"
                      tip="Time and speed"
                      aria-expanded={timing === row.key}
                      onClick={() => setTiming((now) => (now === row.key ? null : row.key))}
                    />
                  </div>
                  {timing === row.key && (
                    <div className="script-timing">
                      <label className="field-label" htmlFor={`${row.key}-start`}>
                        Starts at
                      </label>
                      <span className="script-timing-field">
                        <input
                          id={`${row.key}-start`}
                          className="px-input script-time"
                          type="number"
                          min={0}
                          step={0.1}
                          value={row.start}
                          onChange={(event) =>
                            change(row.key, { start: Number(event.target.value) || 0 })
                          }
                        />
                        <span className="hint">s</span>
                      </span>
                      <label className="field-label" htmlFor={`${row.key}-speed`}>
                        Speed
                      </label>
                      <span className="script-timing-field">
                        <select
                          id={`${row.key}-speed`}
                          className="px-input script-speed"
                          value={row.speed}
                          onChange={(event) =>
                            change(row.key, { speed: Number(event.target.value) }, 0)
                          }
                        >
                          {[...new Set([...SPEEDS, row.speed])]
                            .sort((a, b) => a - b)
                            .map((speed) => (
                              <option key={speed} value={speed}>
                                {speed}×
                              </option>
                            ))}
                        </select>
                      </span>
                    </div>
                  )}
                  <textarea
                    className="px-input px-textarea script-text"
                    rows={2}
                    maxLength={2000}
                    value={row.text}
                    placeholder="What should they say?"
                    aria-label="The words"
                    onChange={(event) => change(row.key, { text: event.target.value })}
                  />
                  <div className="script-foot">
                    <span className="script-status" data-status={status}>
                      {STATUS_WORDS[status]}
                    </span>
                    {spoken && status !== "new" && (
                      <span className="hint">{formatLength(spoken.duration)}</span>
                    )}
                    <span className="script-by" data-by={row.by}>
                      {row.by === "claude" ? "Claude" : "You"}
                    </span>
                    <div className="icon-row">
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon={sample.playing === row.key ? "pause" : "play"}
                        tip={sample.playing === row.key ? "Stop" : "Play"}
                        disabled={!playable}
                        onClick={() => spoken && sample.toggle(row.key, fileUrl(spoken.file))}
                      />
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon="target"
                        tip="Go to"
                        onClick={() => goTo(row)}
                      />
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon="refresh"
                        tip={
                          take.isPending && take.variables?.lines?.[0] === row.id
                            ? "Making…"
                            : "New take"
                        }
                        aria-label="New take (uses credits)"
                        disabled={
                          !hasKey || !row.id || !playable || take.isPending || draft !== null
                        }
                        onClick={() => row.id && take.mutate({ lines: [row.id], fresh: true })}
                      />
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        data-tone="danger"
                        icon="trash"
                        tip="Delete"
                        onClick={() => remove(row)}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {(save.error ?? take.error ?? script.error) && (
          <p className="field-error">{(save.error ?? take.error ?? script.error)?.message}</p>
        )}
      </div>
    </PixelPanel>
  );
}
