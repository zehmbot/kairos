import { type MouseEvent, useEffect, useId, useState } from "react";
import { noteTimeLabel } from "../player/marks.ts";
import { isEmptyDraft, type NoteDraft, type NoteDraftActions } from "../player/useNoteDraft.ts";
import { MARK_TOOLS } from "./MarkTools.tsx";
import { PixelButton } from "./PixelButton.tsx";

/** Keeps focus off the buttons, so the arrow keys keep moving through frames. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

interface NoteFormProps {
  draft: NoteDraft;
  actions: NoteDraftActions;
  /** Time of the frame showing now, in seconds. */
  now: () => number;
  /** Stops the video (when the user starts writing). */
  onPause: () => void;
  /** Shows a frame (the note's own one). */
  onShowTime: (t: number) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}

/** Writing a note, always open next to the video: draw on the video, say what should change, save. */
export function NoteForm(props: NoteFormProps) {
  const { draft, actions, now, onPause, onShowTime, onSave, saving, error } = props;
  const textId = useId();
  const [rangeHint, setRangeHint] = useState<string | null>(null);
  const { clear, undo } = actions;
  const tool = MARK_TOOLS.find((entry) => entry.tool === draft.tool);
  const marks = draft.shapes.length;
  const empty = isEmptyDraft(draft);
  const ready = draft.text.trim() !== "" && (!draft.range || draft.until !== null);

  // Esc clears the note, Ctrl+Z takes back the last mark, Ctrl+Enter saves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inText = target?.closest("input, textarea, select, [contenteditable]") != null;
      const inForm = target?.closest(".note-form") != null;
      if (event.key === "Escape") {
        // In a text box, Esc only leaves the box, so a half-written note isn't lost by accident.
        if (target instanceof HTMLTextAreaElement) target.blur();
        else if (!inText) clear();
        else return;
        event.preventDefault();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (inText && !inForm) return;
        event.preventDefault();
        if (ready && !saving) onSave();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (inText) return;
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear, undo, onSave, ready, saving]);

  const endHere = () => {
    const at = now();
    if (draft.t === null || at <= draft.t) {
      setRangeHint("Move to a later frame first, then press End here.");
      return;
    }
    setRangeHint(null);
    actions.setUntil(at);
  };

  return (
    <div className="note-form">
      <p className="note-hint">
        {tool?.hint} {marks > 0 && `(${marks} mark${marks === 1 ? "" : "s"})`}
      </p>

      <div className="field">
        <label htmlFor={textId} className="field-label">
          What should change?
        </label>
        <textarea
          id={textId}
          className="px-input px-textarea"
          rows={3}
          maxLength={2000}
          value={draft.text}
          placeholder="Make the title bigger and move it up a little."
          onFocus={onPause}
          onChange={(event) => actions.setText(event.target.value, now())}
        />
      </div>

      <div className="note-when">
        <fieldset className="tool-group">
          <legend className="visually-hidden">When</legend>
          <PixelButton
            variant="ghost"
            data-size="small"
            aria-pressed={!draft.range}
            onMouseDown={keepFocus}
            onClick={() => {
              setRangeHint(null);
              actions.setRange(false, now());
            }}
          >
            This frame
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            aria-pressed={draft.range}
            onMouseDown={keepFocus}
            onClick={() => {
              onPause();
              actions.setRange(true, now());
            }}
          >
            Range
          </PixelButton>
        </fieldset>
        {draft.t !== null && (
          <button
            type="button"
            className="note-time"
            title="Show this frame"
            onMouseDown={keepFocus}
            onClick={() => onShowTime(draft.t ?? 0)}
          >
            {draft.range && draft.until === null
              ? `${noteTimeLabel({ t: draft.t, until: null })} to ?`
              : noteTimeLabel({ t: draft.t, until: draft.range ? draft.until : null })}
          </button>
        )}
        {draft.range && (
          <PixelButton variant="ghost" data-size="small" onMouseDown={keepFocus} onClick={endHere}>
            End here
          </PixelButton>
        )}
      </div>
      {draft.range && (rangeHint || draft.until === null) && (
        <p className="note-hint">
          {rangeHint ?? "Move to the last frame of the range, then press End here."}
        </p>
      )}

      {error && <p className="field-error">{error}</p>}
      <div className="form-actions">
        <PixelButton variant="ghost" disabled={empty} onMouseDown={keepFocus} onClick={clear}>
          Clear
        </PixelButton>
        <PixelButton
          icon="note"
          title="Save note (Ctrl+Enter)"
          disabled={saving || !ready}
          onClick={onSave}
        >
          {saving ? "Saving..." : "Save note"}
        </PixelButton>
      </div>
    </div>
  );
}
