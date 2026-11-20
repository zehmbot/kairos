import { useId, useState } from "react";
import { NARRATION_LANGUAGES, type WriteNarration, type WriterState } from "../../shared/types.ts";
import { useScript, useStartWriter, useStopWriter, useWriter } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

const STYLES = ["Storyteller", "Funny", "Calm documentary", "Hype", "Spooky"];
const OTHER = "Other";

const STAGE_WORDS: Record<NonNullable<WriterState["stage"]>, string> = {
  starting: "Starting Claude Code",
  watching: "Watching the film",
  writing: "Writing the lines",
  casting: "Choosing voices",
  voicing: "Making the voices",
};

/** A result: what happened, and the warnings under it. */
export function ResultBox({
  message,
  warnings,
  problem = false,
}: {
  message: string;
  warnings: readonly string[];
  problem?: boolean;
}) {
  return (
    <div className={`writer-result ${problem ? "writer-result-problem" : ""}`}>
      <p>{message}</p>
      {warnings.length > 0 && (
        <ul className="writer-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Write with Claude": Claude watches the film and writes the lines in the background. */
export function NarrationWriter({ filmId, hasKey }: { filmId: string; hasKey: boolean }) {
  const writer = useWriter(filmId);
  const start = useStartWriter(filmId);
  const stop = useStopWriter(filmId);
  const script = useScript(filmId);
  const [style, setStyle] = useState(STYLES[0] ?? "Storyteller");
  const [ownStyle, setOwnStyle] = useState("");
  const [speakers, setSpeakers] = useState<WriteNarration["speakers"]>("narrator");
  const [language, setLanguage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [makeNow, setMakeNow] = useState(true);
  const ids = { style: useId(), who: useId(), language: useId(), note: useId() };

  const state = writer.data;
  const running = state?.state === "running";
  const lines = script.data?.lines ?? [];
  const byClaude = lines.some((line) => line.by === "claude");
  const yours = lines.filter((line) => line.by === "you").length;
  const chosenLanguage = language ?? script.data?.language ?? "en";

  const write = () =>
    start.mutate({
      style: style === OTHER ? ownStyle.trim() || "storyteller" : style.toLowerCase(),
      speakers,
      language: chosenLanguage,
      note: note.trim(),
      make: makeNow,
    });

  return (
    <PixelPanel title="Write with Claude">
      <div className="stack">
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
              runs in the background (about a minute, on your Claude plan) and never changes the
              film.
              {yours > 0 && ` Your own lines (${yours}) stay: Claude writes around them.`}
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
                value={chosenLanguage}
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
                Without a fish.audio key, the lines and the cast are made, and the voices wait for
                your key.
              </p>
            )}
            <div className="note-actions">
              <PixelButton type="submit" icon="pen" disabled={start.isPending}>
                {byClaude ? "Write it again" : "Write the narration"}
              </PixelButton>
            </div>
            {start.error && <p className="field-error">{start.error.message}</p>}
          </form>
        )}

        {state && !running && state.state !== "idle" && state.message && (
          <ResultBox
            message={state.message}
            warnings={state.warnings}
            problem={state.state !== "done"}
          />
        )}
      </div>
    </PixelPanel>
  );
}
