import { useState } from "react";
import type { Note, NoteStatus } from "../../shared/types.ts";
import { noteImageUrl, useDeleteNote, useUpdateNote } from "../api.ts";
import { noteTimeLabel } from "../player/marks.ts";
import { Notice } from "./Notice.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

interface NotesPanelProps {
  filmId: string;
  notes: Note[] | undefined;
  loading: boolean;
  error: Error | null;
  /** The note last opened, highlighted in the list. */
  focusedId: string | null;
  onOpen: (note: Note) => void;
  showMarks: boolean;
  onShowMarks: (show: boolean) => void;
}

/** Notes newer than this may still be waiting for their picture. */
const PICTURE_WAIT_MS = 30_000;

export function NotesPanel(props: NotesPanelProps) {
  const { filmId, notes = [], loading, error, focusedId, onOpen, showMarks, onShowMarks } = props;
  const [tab, setTab] = useState<NoteStatus>("open");
  const shown = notes
    .filter((note) => note.status === tab)
    .sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt));
  const count = (status: NoteStatus) => notes.filter((note) => note.status === status).length;

  return (
    <PixelPanel
      title="Notes"
      actions={
        <PixelButton
          variant="ghost"
          aria-pressed={showMarks}
          title="Show the marks of open notes on the video"
          onClick={() => onShowMarks(!showMarks)}
        >
          {showMarks ? "Marks shown" : "Marks hidden"}
        </PixelButton>
      }
    >
      <div className="stack">
        <fieldset className="tool-group">
          <legend className="visually-hidden">Which notes</legend>
          {(["open", "fixed"] as const).map((status) => (
            <PixelButton
              key={status}
              variant="ghost"
              aria-pressed={tab === status}
              onClick={() => setTab(status)}
            >
              {status === "open" ? "Open" : "Fixed"} ({count(status)})
            </PixelButton>
          ))}
        </fieldset>

        {loading ? (
          <p>Loading notes...</p>
        ) : error ? (
          <Notice title="Kairos can't read the notes">
            <p className="notice-code">{error.message}</p>
          </Notice>
        ) : shown.length === 0 ? (
          <p className="hint">
            {tab === "open"
              ? "No open notes. Draw on the video and write what should change."
              : "No fixed notes yet."}
          </p>
        ) : (
          <ul className="note-list">
            {shown.map((note) => (
              <NoteRow
                key={note.id}
                filmId={filmId}
                note={note}
                focused={note.id === focusedId}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </div>
    </PixelPanel>
  );
}

interface NoteRowProps {
  filmId: string;
  note: Note;
  focused: boolean;
  onOpen: (note: Note) => void;
}

function NoteRow({ filmId, note, focused, onOpen }: NoteRowProps) {
  const update = useUpdateNote(filmId);
  const remove = useDeleteNote(filmId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = noteTimeLabel(note);
  const waiting = Date.now() - Date.parse(note.createdAt) < PICTURE_WAIT_MS;
  const error = update.error ?? remove.error;

  return (
    <li className="note-row px-box" data-focused={focused ? "true" : undefined}>
      <button
        type="button"
        className="note-open"
        aria-label={`Go to ${label}`}
        onClick={() => onOpen(note)}
      >
        <span className="note-thumb">
          {note.image ? (
            <img src={noteImageUrl(filmId, note)} alt="" />
          ) : (
            <span className="note-thumb-empty">{waiting ? "Taking picture..." : "No picture"}</span>
          )}
        </span>
      </button>

      <div className="note-body">
        <button type="button" className="note-time" onClick={() => onOpen(note)}>
          {label}
        </button>

        {editing ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(
                { noteId: note.id, change: { text } },
                { onSuccess: () => setEditing(false) },
              );
            }}
          >
            <textarea
              className="px-input px-textarea"
              aria-label="Note text"
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="note-actions">
              <PixelButton
                type="submit"
                data-size="small"
                disabled={!text.trim() || update.isPending}
              >
                Save
              </PixelButton>
              <PixelButton
                variant="ghost"
                data-size="small"
                onClick={() => {
                  setText(note.text);
                  setEditing(false);
                }}
              >
                Cancel
              </PixelButton>
            </div>
          </form>
        ) : (
          <p className="note-text">{note.text}</p>
        )}

        {!editing && (
          <div className="note-actions">
            {confirmDelete ? (
              <>
                <span className="note-confirm">Delete this note?</span>
                <PixelButton
                  data-size="small"
                  icon="trash"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(note.id)}
                >
                  Delete
                </PixelButton>
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </PixelButton>
              </>
            ) : (
              <>
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  icon={note.status === "open" ? "check" : "undo"}
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      noteId: note.id,
                      change: { status: note.status === "open" ? "fixed" : "open" },
                    })
                  }
                >
                  {note.status === "open" ? "Mark fixed" : "Reopen"}
                </PixelButton>
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  icon="pen"
                  aria-label="Edit"
                  title="Edit the text"
                  onClick={() => {
                    setText(note.text);
                    setEditing(true);
                  }}
                />
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  icon="trash"
                  aria-label="Delete"
                  title="Delete this note"
                  onClick={() => setConfirmDelete(true)}
                />
              </>
            )}
          </div>
        )}
        {error && <p className="field-error">{error.message}</p>}
      </div>
    </li>
  );
}
