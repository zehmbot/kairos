import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { DEFAULT_FPS, FILM_SHAPES, type FilmShape } from "../../shared/types.ts";
import { useCreateFilm } from "../api.ts";
import { FrameRatePicker, useFrameRate } from "./FrameRatePicker.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { TextField } from "./TextField.tsx";

const SHAPES = Object.entries(FILM_SHAPES) as [FilmShape, (typeof FILM_SHAPES)[FilmShape]][];
/** Size of the little shape pictures, in CSS pixels. */
const SHAPE_BOX = 64;

interface NewFilmDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewFilmDialog({ open, onClose }: NewFilmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [title, setTitle] = useState("");
  const [shape, setShape] = useState<FilmShape>("wide");
  const rate = useFrameRate(DEFAULT_FPS);
  const create = useCreateFilm();
  const navigate = useNavigate();
  const { reset } = create;
  const resetRate = rate.reset;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTitle("");
      setShape("wide");
      resetRate(DEFAULT_FPS);
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset, resetRate]);

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
          create.mutate(
            { title, shape, fps: rate.fps },
            {
              onSuccess: (film) => {
                onClose();
                navigate(`/films/${encodeURIComponent(film.id)}`);
              },
            },
          );
        }}
      >
        <h2 id={headingId} className="dialog-title">
          New film
        </h2>
        <TextField
          label="Name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="My first film"
          maxLength={80}
          autoComplete="off"
          error={create.error?.message}
        />
        <fieldset className="choice-picker">
          <legend className="field-label">Shape</legend>
          <div className="choice-cards">
            {SHAPES.map(([key, info]) => {
              const fit = SHAPE_BOX / Math.max(info.width, info.height);
              return (
                <label key={key} className="choice-card">
                  <input
                    type="radio"
                    name="shape"
                    value={key}
                    checked={shape === key}
                    onChange={() => setShape(key)}
                    className="visually-hidden"
                  />
                  <span className="shape-box">
                    <span
                      className="shape-preview"
                      style={{
                        width: Math.round(info.width * fit),
                        height: Math.round(info.height * fit),
                      }}
                    />
                  </span>
                  <span className="choice-label">{info.label}</span>
                  <span className="choice-sub">{info.ratio}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <FrameRatePicker state={rate} />
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancel
          </PixelButton>
          <PixelButton
            type="submit"
            icon="plus"
            disabled={create.isPending || !title.trim() || rate.fps === null}
          >
            Create film
          </PixelButton>
        </div>
      </form>
    </dialog>
  );
}
