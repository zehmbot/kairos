import { useEffect, useId, useRef, useState } from "react";
import { exportSize, SHAPE_USES, SHORTS_MAX_SECONDS, shapeOf } from "../../shared/export.ts";
import { FILM_SHAPES, type FilmShape, type RenderQuality } from "../../shared/types.ts";
import { useExportInfo, useStartRender } from "../api.ts";
import { formatLength } from "../player/time.ts";
import { Notice } from "./Notice.tsx";
import { PixelButton } from "./PixelButton.tsx";

const QUALITIES: { id: RenderQuality; label: string; sub: string }[] = [
  { id: "high", label: "High", sub: "Looks just like the film" },
  { id: "small", label: "Smaller file", sub: "A little softer, about half the size" },
];

const FITS: { id: "bars" | "crop"; label: string; sub: string }[] = [
  { id: "bars", label: "Bars", sub: "The whole picture, with bars around it" },
  { id: "crop", label: "Crop", sub: "Fills the frame, the middle kept" },
];

const SHAPES = Object.keys(FILM_SHAPES) as FilmShape[];

/** The little picture of a shape in its card (the same as New film's). */
const SHAPE_BOX = 64;

interface RenderDialogProps {
  open: boolean;
  onClose: () => void;
  filmId: string;
  title: string;
  /** The film's size and length. */
  size: { width: number; height: number };
  duration: number;
  /** The film reframes itself for another shape (else it gets bars or a crop). */
  reshape: boolean;
  /** The shape you're looking at it in (null: its own): chosen to start with. */
  shown: FilmShape | null;
  /** The film has words to show as subtitles (its own captions, or voices with word timings). */
  words: boolean;
  /** The film draws its own captions (and can leave them out of the picture). */
  captions: boolean;
}

/** Choose where the video goes (its shape), the quality and the graphics card, then put it in the render queue. */
export function RenderDialog({
  open,
  onClose,
  filmId,
  title,
  size,
  duration,
  reshape,
  shown,
  words,
  captions,
}: RenderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const name = useId();
  const info = useExportInfo();
  const start = useStartRender(filmId);
  const own = shapeOf(size);
  const [shape, setShape] = useState<FilmShape | null>(shown ?? own);
  const [fit, setFit] = useState<"bars" | "crop">("bars");
  const [quality, setQuality] = useState<RenderQuality>("high");
  const [gpu, setGpu] = useState(true);
  const [subtitles, setSubtitles] = useState(words);
  const [inPicture, setInPicture] = useState(true);
  const { reset } = start;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reset();
      setShape(shown ?? own);
      setSubtitles(words);
      setInPicture(true);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset, shown, own, words]);

  const card = info.data?.encoders.find((encoder) => encoder.gpu);
  const ready = Boolean(info.data?.ffmpeg && info.data.encoders.length > 0);
  const out = exportSize(size, shape);
  const elsewhere = shape !== null && shape !== own;
  // A film of a shape of its own (like 4:5) can also go out as it is.
  const choices: (FilmShape | null)[] = own === null ? [null, ...SHAPES] : SHAPES;

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
          start.mutate(
            {
              quality,
              gpu,
              shape: shape ?? undefined,
              fit,
              subtitles: words && subtitles,
              captions: !captions || inPicture,
            },
            { onSuccess: onClose },
          );
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
              <legend className="field-label">Made for</legend>
              <div className={`choice-cards${choices.length === 4 ? " render-shapes-4" : ""}`}>
                {choices.map((entry) => {
                  const box = entry ? FILM_SHAPES[entry] : size;
                  const scale = SHAPE_BOX / Math.max(box.width, box.height);
                  return (
                    <label key={entry ?? "own"} className="choice-card">
                      <input
                        type="radio"
                        name={`${name}-shape`}
                        checked={shape === entry}
                        onChange={() => setShape(entry)}
                        className="visually-hidden"
                      />
                      <span className="shape-box">
                        <span
                          className="shape-preview"
                          style={{
                            width: Math.round(box.width * scale),
                            height: Math.round(box.height * scale),
                          }}
                        />
                      </span>
                      <span className="choice-label">
                        {entry ? SHAPE_USES[entry].label : "As it is"}
                      </span>
                      <span className="choice-sub">
                        {entry ? FILM_SHAPES[entry].ratio : `${size.width} × ${size.height}`}
                        {entry !== null && entry === own && " · your film's shape"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {elsewhere &&
              (reshape ? (
                <p className="hint">
                  The film frames every shot again for this shape: nothing is cut off. It comes out
                  at {out.width} × {out.height}.
                </p>
              ) : (
                <fieldset className="choice-picker">
                  <legend className="field-label">
                    This film can't reframe itself. Fit it in with
                  </legend>
                  <div className="choice-cards render-qualities">
                    {FITS.map((entry) => (
                      <label key={entry.id} className="choice-card">
                        <input
                          type="radio"
                          name={`${name}-fit`}
                          checked={fit === entry.id}
                          onChange={() => setFit(entry.id)}
                          className="visually-hidden"
                        />
                        <span className="choice-label">{entry.label}</span>
                        <span className="choice-sub">{entry.sub}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            {shape === "tall" && duration > SHORTS_MAX_SECONDS && (
              <p className="hint">
                Shorts and Reels take up to {formatLength(SHORTS_MAX_SECONDS)}: this film lasts{" "}
                {formatLength(duration)}.
              </p>
            )}

            <fieldset className="choice-picker">
              <legend className="field-label">Words</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={words && subtitles}
                  disabled={!words}
                  onChange={(event) => setSubtitles(event.target.checked)}
                />
                <span>
                  {words
                    ? "A subtitles file (.srt) next to the video, from the words it says. YouTube and TikTok take it as captions viewers can turn on."
                    : "A subtitles file needs words: this film has no voice with word timings yet."}
                </span>
              </label>
              {captions && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={inPicture}
                    onChange={(event) => setInPicture(event.target.checked)}
                  />
                  <span>
                    Captions in the picture. Off: a clean picture, for when the platform shows the
                    subtitles instead.
                  </span>
                </label>
              )}
            </fieldset>

            <fieldset className="choice-picker">
              <legend className="field-label">Quality</legend>
              <div className="choice-cards render-qualities">
                {QUALITIES.map((entry) => (
                  <label key={entry.id} className="choice-card">
                    <input
                      type="radio"
                      name={`${name}-quality`}
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
                  Use the graphics card ({card.name}). Fast, and films get their richest look. Off:
                  the processor draws and encodes the video, slower, with a lighter look.
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
