import { useEffect, useId, useRef } from "react";
import { useChangeFilm } from "../api.ts";
import { FrameRatePicker, useFrameRate } from "./FrameRatePicker.tsx";
import { PixelButton } from "./PixelButton.tsx";

interface FrameRateDialogProps {
  open: boolean;
  onClose: () => void;
  filmId: string;
  /** The film's frame rate now. */
  fps: number;
}

/** Changes a film's frame rate (`fps` in its kairos.json). */
export function FrameRateDialog({ open, onClose, filmId, fps }: FrameRateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const rate = useFrameRate(fps);
  const change = useChangeFilm(filmId);
  const { reset } = change;
  const resetRate = rate.reset;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      resetRate(fps);
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, fps, reset, resetRate]);

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-box"
      aria-labelledby={headingId}
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (rate.fps === null) return;
          if (rate.fps === fps) {
            onClose();
            return;
          }
          change.mutate({ fps: rate.fps }, { onSuccess: onClose });
        }}
      >
        <h2 id={headingId} className="dialog-title">
          Change frame rate
        </h2>
        <FrameRatePicker state={rate} />
        <p className="hint">
          Notes stay at the same moments. The preview starts again from the beginning.
        </p>
        {change.error && <p className="field-error">{change.error.message}</p>}
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancel
          </PixelButton>
          <PixelButton type="submit" disabled={change.isPending || rate.fps === null}>
            {change.isPending ? "Saving..." : "Save"}
          </PixelButton>
        </div>
      </form>
    </dialog>
  );
}
