import { useEffect, useId, useRef, useState } from "react";
import { useSaveTemplate } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { TextField } from "./TextField.tsx";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  filmId: string;
  title: string;
}

/** Saves a film as one of the user's templates, to start new films from it. */
export function SaveTemplateDialog({ open, onClose, filmId, title }: SaveTemplateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const save = useSaveTemplate(filmId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const { reset } = save;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName(title);
      setDescription("");
      setSaved(null);
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset, title]);

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-box"
      aria-labelledby={headingId}
      onClose={onClose}
    >
      {saved ? (
        <div className="form">
          <h2 id={headingId} className="dialog-title">
            Template saved
          </h2>
          <p>"{saved}" is now in New film, under Yours.</p>
          <div className="form-actions">
            <PixelButton onClick={onClose}>Done</PixelButton>
          </div>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              { name, description },
              { onSuccess: (template) => setSaved(template.name) },
            );
          }}
        >
          <h2 id={headingId} className="dialog-title">
            Save as template
          </h2>
          <p className="hint">
            New films can start from this one: its files, size, frame rate and length (and its
            brief's questions, when it has one). Notes and videos stay with this film.
          </p>
          <TextField
            label="Template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoComplete="off"
          />
          <div className="field">
            <label htmlFor={descriptionId} className="field-label">
              Description
            </label>
            <textarea
              id={descriptionId}
              className="px-input px-textarea"
              rows={3}
              maxLength={300}
              value={description}
              placeholder="What this template makes, in a few words."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {save.error && <p className="field-error">{save.error.message}</p>}
          <div className="form-actions">
            <PixelButton variant="ghost" onClick={onClose}>
              Cancel
            </PixelButton>
            <PixelButton type="submit" icon="plus" disabled={save.isPending || !name.trim()}>
              {save.isPending ? "Saving..." : "Save template"}
            </PixelButton>
          </div>
        </form>
      )}
    </dialog>
  );
}
