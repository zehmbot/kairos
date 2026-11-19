import { useEffect, useId, useRef, useState } from "react";
import { useDeleteFilm } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";

interface DeleteFilmDialogProps {
  /** The film to delete; the window is open while this is set. */
  film: { id: string; title: string } | null;
  onClose: () => void;
  /** After the film went (to the trash or for good). */
  onDeleted?: () => void;
}

/** Delete a film: to the trash (it can be restored), or for good after a second "are you sure". */
export function DeleteFilmDialog({ film, onClose, onDeleted }: DeleteFilmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const remove = useDeleteFilm();
  const [forever, setForever] = useState(false);
  const { reset } = remove;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (film && !dialog.open) {
      setForever(false);
      reset();
      dialog.showModal();
    } else if (!film && dialog.open) {
      dialog.close();
    }
  }, [film, reset]);

  const run = (deleteForGood: boolean) => {
    if (!film) return;
    remove.mutate(
      { id: film.id, forever: deleteForGood },
      {
        onSuccess: () => {
          onClose();
          onDeleted?.();
        },
      },
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-box"
      aria-labelledby={headingId}
      onClose={onClose}
    >
      {film && (
        <div className="form">
          <h2 id={headingId} className="dialog-title">
            Delete "{film.title}"?
          </h2>
          {forever ? (
            <p className="delete-warning">
              This can't be undone: the film's files, notes and videos are deleted for good.
            </p>
          ) : (
            <p>
              The film goes to the trash with its files, notes and videos. You can restore it from
              the trash on the Films page.
            </p>
          )}
          {remove.error && <p className="field-error">{remove.error.message}</p>}
          <div className="form-actions">
            {forever ? (
              <>
                <PixelButton variant="ghost" onClick={() => setForever(false)}>
                  Back
                </PixelButton>
                <PixelButton
                  icon="trash"
                  data-tone="danger"
                  disabled={remove.isPending}
                  onClick={() => run(true)}
                >
                  Delete for good
                </PixelButton>
              </>
            ) : (
              <>
                <PixelButton variant="ghost" onClick={onClose}>
                  Cancel
                </PixelButton>
                <PixelButton variant="ghost" data-tone="danger" onClick={() => setForever(true)}>
                  Delete for good...
                </PixelButton>
                <PixelButton icon="trash" disabled={remove.isPending} onClick={() => run(false)}>
                  {remove.isPending ? "Moving..." : "Move to trash"}
                </PixelButton>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
