import { useEffect, useId, useState } from "react";
import { type ScriptLineStatus, scriptLineStatus } from "../../shared/script.ts";
import {
  type FilmVoices,
  NARRATION_LANGUAGES,
  type ScriptLine,
  type VoiceLine,
  type WriteNarration,
  type WriterState,
} from "../../shared/types.ts";
import {
  useMakeScript,
  useSaveScript,
  useScript,
  useStartWriter,
  useStopWriter,
  useWriter,
} from "../api.ts";
import { speakerName } from "./CastList.tsx";
import { PixelButton } from "./PixelButton.tsx";

const STYLES = ["Storyteller", "Funny", "Calm documentary", "Hype", "Spooky"];
const OTHER = "Other";

const STAGE_WORDS: Record<NonNullable<WriterState["stage"]>, string> = {
  starting: "Starting Claude Code",
  watching: "Watching the film",
  writing: "Writing the lines",
  casting: "Choosing voices",
  voicing: "Making the voices",
};

const STATUS_WORDS: Record<ScriptLineStatus, string> = {
  made: "Made",
  changed: "Changed",
  new: "Not made",
  "no-voice": "No voice",
};

type Draft = Pick<ScriptLine, "speaker" | "text" | "start" | "line"> & { id?: string; key: string };

let nextKey = 0;
const keyed = (line: Omit<Draft, "key">): Draft => ({ ...line, key: `d${nextKey++}` });

interface NarrationWriterProps {
  filmId: string;
  voices: FilmVoices;
  /** The voice lines made so far (to tell what is made). */
  lines: readonly VoiceLine[];
  hasKey: boolean;
  /** The player's time now: added lines start there. */
  now: () => number;
  onSeek: (t: number) => void;
}

/** "Write the narration": Claude writes the script in the background; you edit it and make the voices. */
export function NarrationWriter({
  filmId,
  voices,
  lines,
  hasKey,
  now,
  onSeek,
}: NarrationWriterProps) {
  const writer = useWriter(filmId);
  const start = useStartWriter(filmId);
  const stop = useStopWriter(filmId);
  const script = useScript(filmId);
  const save = useSaveScript(filmId);
  const make = useMakeScript(filmId);
  const [style, setStyle] = useState(STYLES[0] ?? "Storyteller");
  const [ownStyle, setOwnStyle] = useState("");
  const [speakers, setSpeakers] = useState<WriteNarration["speakers"]>("narrator");
  const [language, setLanguage] = useState("en");
  const [note, setNote] = useState("");
  const [makeNow, setMakeNow] = useState(true);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const ids = { style: useId(), who: useId(), language: useId(), note: useId() };

  const state = writer.data;
  const running = state?.state === "running";
  const saved = script.data ?? null;

  // A new script (written by Claude, or saved): start editing from it again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a newly saved script resets the draft.
  useEffect(() => setDraft(null), [saved?.updatedAt]);

  const rows: Draft[] =
    draft ?? [...(saved?.lines ?? [])].sort((a, b) => a.start - b.start).map((line) => keyed(line));
  const dirty = draft !== null;
  const speakerList = [
    ...new Set([...Object.keys(voices), ...rows.map((row) => row.speaker), "narrator"]),
  ];
  const statusOf = (row: Draft): ScriptLineStatus =>
    scriptLineStatus({ ...row, id: row.id ?? row.key }, lines, voices);
  const toMake = rows.filter((row) => statusOf(row) !== "made").length;

  const change = (key: string, patch: Partial<Draft>) =>
    setDraft(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const write = () =>
    start.mutate({
      style: style === OTHER ? ownStyle.trim() || "storyteller" : style.toLowerCase(),
      speakers,
      language,
      note: note.trim(),
      make: makeNow,
    });

  const saveDraft = async () => {
    if (!draft) return;
    await save.mutateAsync({
      lines: draft
        .filter((row) => row.text.trim())
        .map(({ key: _key, ...row }) => ({
          ...row,
          text: row.text.trim(),
          start: Math.max(0, row.start),
        })),
    });
    setDraft(null);
  };

  const makeVoices = async () => {
    if (dirty) await saveDraft();
    make.mutate();
  };

  return (
    <div className="stack">
      <span className="field-label">Narration</span>

      {running ? (
        <div className="writer-progress px-box" aria-live="polite">
          <span className="writer-stage">
            {state.stage ? STAGE_WORDS[state.stage] : "Working"}
            <span className="writer-dots" />
          </span>
          {state.detail && <span className="hint">{state.detail}</span>}
          <PixelButton
            variant="ghost"
            data-size="small"
            data-tone="danger"
            onClick={() => stop.mutate()}
          >
            Stop
          </PixelButton>
        </div>
      ) : (
        <form
          className="stack writer-form"
          onSubmit={(event) => {
            event.preventDefault();
            write();
          }}
        >
          <p className="hint">
            Claude Code watches the film and writes what the voices say, fitted to each moment. It
            runs in the background (about a minute, on your Claude plan) and never changes the film.
          </p>
          <div className="writer-grid">
            <label htmlFor={ids.style} className="field-label">
              Style
            </label>
            <select
              id={ids.style}
              className="px-input"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
            >
              {[...STYLES, OTHER].map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
            <label htmlFor={ids.who} className="field-label">
              Who speaks
            </label>
            <select
              id={ids.who}
              className="px-input"
              value={speakers}
              onChange={(event) => setSpeakers(event.target.value as WriteNarration["speakers"])}
            >
              <option value="narrator">The narrator only</option>
              <option value="both">Narrator and characters</option>
              <option value="characters">Characters only</option>
            </select>
            <label htmlFor={ids.language} className="field-label">
              Language
            </label>
            <select
              id={ids.language}
              className="px-input"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {NARRATION_LANGUAGES.map(([code, words]) => (
                <option key={code} value={code}>
                  {words}
                </option>
              ))}
            </select>
          </div>
          {style === OTHER && (
            <input
              className="px-input"
              value={ownStyle}
              maxLength={200}
              placeholder="How should it sound?"
              aria-label="Your own style"
              onChange={(event) => setOwnStyle(event.target.value)}
            />
          )}
          <label htmlFor={ids.note} className="visually-hidden">
            A note for Claude
          </label>
          <input
            id={ids.note}
            className="px-input"
            value={note}
            maxLength={500}
            placeholder="A note for Claude (optional): end with a question…"
            onChange={(event) => setNote(event.target.value)}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={makeNow}
              onChange={(event) => setMakeNow(event.target.checked)}
            />
            <span>Make the voices right away (uses fish.audio credits)</span>
          </label>
          {makeNow && !hasKey && (
            <p className="hint">
              Without a fish.audio key, the script and the cast are made, and the voices wait for
              your key.
            </p>
          )}
          <div className="note-actions">
            <PixelButton type="submit" icon="pen" disabled={start.isPending}>
              {saved ? "Write it again" : "Write the narration"}
            </PixelButton>
          </div>
          {start.error && <p className="field-error">{start.error.message}</p>}
        </form>
      )}

      {state && !running && state.state !== "idle" && state.message && (
        <div className={`writer-result ${state.state === "done" ? "" : "writer-result-problem"}`}>
          <p>{state.message}</p>
          {state.warnings.length > 0 && (
            <ul className="writer-warnings">
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="stack">
          <span className="field-label">
            Script ({rows.length} line{rows.length === 1 ? "" : "s"})
            {saved?.writtenBy === "claude" ? " · written by Claude" : ""}
          </span>
          {saved?.note && <p className="hint">{saved.note}</p>}
          <ul className="script-lines">
            {rows.map((row) => {
              const status = statusOf(row);
              return (
                <li key={row.key} className="script-line px-box">
                  <div className="script-line-head">
                    <input
                      className="px-input script-time"
                      type="number"
                      min={0}
                      step={0.1}
                      value={row.start}
                      aria-label="Starts at (seconds)"
                      onChange={(event) =>
                        change(row.key, { start: Number(event.target.value) || 0 })
                      }
                    />
                    <span className="hint">s</span>
                    <select
                      className="px-input script-speaker"
                      value={row.speaker}
                      aria-label="Who says it"
                      onChange={(event) => change(row.key, { speaker: event.target.value })}
                    >
                      {speakerList.map((speaker) => (
                        <option key={speaker} value={speaker}>
                          {speakerName(speaker)}
                        </option>
                      ))}
                    </select>
                    <PixelButton
                      variant="ghost"
                      data-size="small"
                      icon="toStart"
                      aria-label="Go to this line"
                      onClick={() => onSeek(row.start)}
                    />
                    <PixelButton
                      variant="ghost"
                      data-size="small"
                      data-tone="danger"
                      icon="trash"
                      aria-label="Delete this line"
                      onClick={() => setDraft(rows.filter((entry) => entry.key !== row.key))}
                    />
                  </div>
                  <textarea
                    className="px-input px-textarea script-text"
                    rows={2}
                    maxLength={2000}
                    value={row.text}
                    aria-label="The words"
                    onChange={(event) => change(row.key, { text: event.target.value })}
                  />
                  <span className="script-status" data-status={status}>
                    {STATUS_WORDS[status]}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="note-actions">
            <PixelButton
              variant="ghost"
              data-size="small"
              icon="plus"
              onClick={() =>
                setDraft([
                  ...rows,
                  keyed({
                    speaker: speakerList[0] ?? "narrator",
                    text: "",
                    start: Math.round(now() * 10) / 10,
                  }),
                ])
              }
            >
              Add line
            </PixelButton>
            {dirty && (
              <>
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  disabled={save.isPending}
                  onClick={() => void saveDraft()}
                >
                  Save
                </PixelButton>
                <PixelButton variant="ghost" data-size="small" onClick={() => setDraft(null)}>
                  Undo changes
                </PixelButton>
              </>
            )}
          </div>
          <div className="note-actions">
            <PixelButton
              icon="sound"
              disabled={!hasKey || running || make.isPending || (toMake === 0 && !dirty)}
              onClick={() => void makeVoices()}
            >
              {make.isPending
                ? "Making the voices…"
                : toMake === 0 && !dirty
                  ? "All voices made"
                  : `Make the voices (${toMake})`}
            </PixelButton>
            {!hasKey && <span className="hint">Add your fish.audio key in Settings → Voice.</span>}
          </div>
          {make.data && !make.isPending && (
            <div className="writer-result">
              <p>
                Made {make.data.made} voice{make.data.made === 1 ? "" : "s"}
                {make.data.reused ? `, reused ${make.data.reused}` : ""}.
              </p>
              {make.data.warnings.length > 0 && (
                <ul className="writer-warnings">
                  {make.data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(save.error ?? make.error ?? script.error) && (
            <p className="field-error">{(save.error ?? make.error ?? script.error)?.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
