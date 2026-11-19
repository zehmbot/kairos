import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { acceptFor } from "../../shared/media.ts";
import type { Reference } from "../../shared/types.ts";
import {
  queryKeys,
  referenceSheetUrl,
  useAddReferenceFromAsset,
  useDeleteReference,
  useReferenceNote,
  useReferences,
} from "../api.ts";
import { formatLength } from "../player/time.ts";
import { AssetPicker } from "./AssetPicker.tsx";
import { FileButton, UploadStatus, useUploads } from "./DropZone.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

const ACCEPT = acceptFor(["video", "image"]).replace(",.svg", "");
const fileName = (file: string) => file.split("/").pop() ?? file;

/** "2:17 · 35 shots · a new shot every 2.4 s" */
function summary(reference: Reference): string {
  if (reference.status === "processing") return "Getting frames…";
  if (reference.status === "failed") return reference.problem ?? "Kairos couldn't read it.";
  const info = reference.info;
  if (!info) return "Picture";
  const shots = info.shots.length;
  return `${formatLength(info.duration)} · ${shots} ${shots === 1 ? "shot" : "shots"} · a new shot every ${info.medianShot.toFixed(1)} s`;
}

/** Videos and pictures for Claude to look at ("make it look like this"), each with a note. */
export function ReferencesPanel({ filmId }: { filmId: string }) {
  const queryClient = useQueryClient();
  const references = useReferences(filmId);
  const fromAsset = useAddReferenceFromAsset(filmId);
  const uploads = useUploads(() =>
    queryClient.invalidateQueries({ queryKey: queryKeys.references(filmId) }),
  );
  const [picking, setPicking] = useState(false);

  const add = (files: File[]) =>
    uploads.send(
      files,
      (file) =>
        `/api/films/${encodeURIComponent(filmId)}/references?name=${encodeURIComponent(file.name)}`,
    );
  const items = references.data ?? [];

  return (
    <PixelPanel title="References">
      {/* The film page takes files dropped here as references (see FilmPage). */}
      <div data-drop="reference">
        <div className="stack">
          {references.isError && <p className="field-error">{references.error.message}</p>}
          {items.length === 0 ? (
            <p className="hint">
              Add videos or pictures you like. Kairos picks out their shots and pace, and Claude
              looks at them while building your film.
            </p>
          ) : (
            <ul className="ref-list">
              {items.map((reference) => (
                <ReferenceRow key={reference.id} filmId={filmId} reference={reference} />
              ))}
            </ul>
          )}
          <div className="note-actions">
            <FileButton accept={ACCEPT} onFiles={add} disabled={uploads.busy}>
              Add reference
            </FileButton>
            <PixelButton variant="ghost" icon="folder" onClick={() => setPicking(true)}>
              From your assets
            </PixelButton>
          </div>
          <UploadStatus
            status={uploads.status}
            error={uploads.error ?? fromAsset.error?.message ?? null}
          />
          {items.length > 0 && (
            <p className="hint">
              Then ask Claude: "Look at my references and make the film in that style."
            </p>
          )}
        </div>
      </div>
      <AssetPicker
        open={picking}
        kinds={["video", "image"]}
        title="Add a reference from your assets"
        busy={fromAsset.isPending}
        onClose={() => setPicking(false)}
        onPick={(asset) => fromAsset.mutate(asset.id, { onSuccess: () => setPicking(false) })}
      />
    </PixelPanel>
  );
}

function ReferenceRow({ filmId, reference }: { filmId: string; reference: Reference }) {
  const noteId = useId();
  const saveNote = useReferenceNote(filmId);
  const remove = useDeleteReference(filmId);
  const [note, setNote] = useState(reference.note);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setNote(reference.note);
  }, [reference.note]);

  // Save the note a moment after typing stops.
  useEffect(() => {
    if (note === reference.note) return;
    const timer = setTimeout(() => saveNote.mutate({ ref: reference.id, note }), 600);
    return () => clearTimeout(timer);
  }, [note, reference.note, reference.id, saveNote.mutate]);

  const sheet =
    reference.sheets > 0
      ? referenceSheetUrl(filmId, reference.id, 1, reference.addedAt + reference.status)
      : null;

  return (
    <li className="ref-row px-box" data-status={reference.status}>
      <div className="ref-head">
        {sheet ? (
          <a
            className="ref-thumb"
            href={sheet}
            target="_blank"
            rel="noreferrer"
            title="Open the frame sheet"
          >
            <img src={sheet} alt={`Frames from ${fileName(reference.file)}`} />
          </a>
        ) : (
          <span className="ref-thumb">
            <PixelIcon name={reference.status === "failed" ? "warning" : "film"} size={32} />
          </span>
        )}
        <div className="ref-text">
          <span className="ref-name">{fileName(reference.file)}</span>
          <span className={reference.status === "failed" ? "field-error" : "hint"}>
            {summary(reference)}
          </span>
          {reference.sheets > 1 && (
            <span className="ref-sheets">
              {Array.from({ length: reference.sheets }, (_, i) => i + 1).map((n) => (
                <a
                  key={n}
                  href={referenceSheetUrl(
                    filmId,
                    reference.id,
                    n,
                    reference.addedAt + reference.status,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Sheet {n}
                </a>
              ))}
            </span>
          )}
        </div>
      </div>
      <label htmlFor={noteId} className="field-label">
        What should Claude take from it?
      </label>
      <textarea
        id={noteId}
        className="px-input px-textarea"
        rows={2}
        maxLength={1000}
        value={note}
        placeholder="The camera moves, the captions, the colors…"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="note-actions">
        {confirm ? (
          <>
            <span className="note-confirm">Remove this reference?</span>
            <PixelButton
              data-size="small"
              data-tone="danger"
              icon="trash"
              disabled={remove.isPending}
              onClick={() => remove.mutate(reference.id)}
            >
              Remove
            </PixelButton>
            <PixelButton variant="ghost" data-size="small" onClick={() => setConfirm(false)}>
              Keep
            </PixelButton>
          </>
        ) : (
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="trash"
            onClick={() => setConfirm(true)}
          >
            Remove
          </PixelButton>
        )}
      </div>
      {(saveNote.error ?? remove.error) && (
        <p className="field-error">{(saveNote.error ?? remove.error)?.message}</p>
      )}
    </li>
  );
}
