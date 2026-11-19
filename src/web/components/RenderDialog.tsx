import { useEffect, useId, useRef, useState } from "react";
import type { RenderQuality } from "../../shared/types.ts";
import { useExportInfo, useStartRender } from "../api.ts";
import { Notice } from "./Notice.tsx";
import { PixelButton } from "./PixelButton.tsx";

const QUALITIES: { id: RenderQuality; label: string; sub: string }[] = [
  { id: "high", label: "High", sub: "Looks just like the film" },
  { id: "small", label: "Smaller file", sub: "A little softer, about half the size" },
];

interface RenderDialogProps {
  open: boolean;
  onClose: () => void;
  filmId: string;
  title: string;
}

/** Choose the quality (and the graphics card), then put the film in the render queue. */
export function RenderDialog({ open, onClose, filmId, title }: RenderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const name = useId();
  const info = useExportInfo();
  const start = useStartRender(filmId);
  const [quality, setQuality] = useState<RenderQuality>("high");
  const [gpu, setGpu] = useState(true);
  const { reset } = start;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset]);

  const card = info.data?.encoders.find((encoder) => encoder.gpu);
  const ready = Boolean(info.data?.ffmpeg && info.data.encoders.length > 0);

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
          start.mutate({ quality, gpu }, { onSuccess: onClose });
        }}
      >
        <h2 id={headingId} className="dialog-title">
          Render {title}
        </h2>
        <p className="hint">
          Kairos draws every frame and saves an MP4 video in the film's renders folder. You can keep
          working while it renders.
        </p>

        {info.isPending ? (
          <p>Checking the video tools...</p>
        ) : !ready ? (
          <Notice title="ffmpeg is missing">
            Kairos uses ffmpeg to make videos. Install it (on Windows: winget install Gyan.FFmpeg),
            then restart Kairos.
          </Notice>
        ) : (
          <>
            <fieldset className="choice-picker">
              <legend className="field-label">Quality</legend>
              <div className="choice-cards render-qualities">
                {QUALITIES.map((entry) => (
                  <label key={entry.id} className="choice-card">
                    <input
                      type="radio"
                      name={name}
                      checked={quality === entry.id}
                      onChange={() => setQuality(entry.id)}
                      className="visually-hidden"
                    />
                    <span className="choice-label">{entry.label}</span>
                    <span className="choice-sub">{entry.sub}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {card ? (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={gpu}
                  onChange={(event) => setGpu(event.target.checked)}
                />
                <span>
                  Use the graphics card ({card.name}). Much faster. Turn it off for the very best
                  quality with the CPU.
                </span>
              </label>
            ) : (
              <p className="hint">No graphics card encoder found: the CPU encodes the video.</p>
            )}
          </>
        )}

        {start.error && <p className="field-error">{start.error.message}</p>}
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancel
          </PixelButton>
          <PixelButton type="submit" icon="render" disabled={!ready || start.isPending}>
            {start.isPending ? "Starting..." : "Start render"}
          </PixelButton>
        </div>
      </form>
    </dialog>
  );
}
