import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FILM_SHAPES, type FilmShape } from "../../shared/types.ts";
import { useCreateFilm } from "../api.ts";
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
  const create = useCreateFilm();
  const navigate = useNavigate();
  const { reset } = create;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTitle("");
      setShape("wide");
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset]);

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
          create.mutate(
            { title, shape },
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
        <fieldset className="shape-picker">
          <legend className="field-label">Shape</legend>
          <div className="shape-options">
            {SHAPES.map(([key, info]) => {
              const fit = SHAPE_BOX / Math.max(info.width, info.height);
              return (
                <label key={key} className="shape-option">
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
                  <span className="shape-label">{info.label}</span>
                  <span className="shape-ratio">{info.ratio}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancel
          </PixelButton>
          <PixelButton type="submit" icon="plus" disabled={create.isPending || !title.trim()}>
            Create film
          </PixelButton>
        </div>
      </form>
    </dialog>
  );
}
