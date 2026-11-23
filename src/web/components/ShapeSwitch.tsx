import type { MouseEvent } from "react";
import { SHAPE_USES } from "../../shared/export.ts";
import type { FilmShape } from "../../shared/types.ts";
import type { IconName } from "../icons/icons.ts";
import { PixelButton } from "./PixelButton.tsx";

const SHAPES: { shape: FilmShape; icon: IconName }[] = [
  { shape: "wide", icon: "shapeWide" },
  { shape: "tall", icon: "shapeTall" },
  { shape: "square", icon: "shapeSquare" },
];

/** Keeps focus off the buttons, so the arrow keys keep moving through frames. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

interface ShapeSwitchProps {
  /** The shape showing: null for the film's own. */
  shown: FilmShape | null;
  /** The film's own shape (null: a shape of its own, like 4:5). */
  own: FilmShape | null;
  /** The film's own size, for a film of a shape of its own. */
  size: { width: number; height: number };
  /** null: back to the film's own shape. */
  onShow: (shape: FilmShape | null) => void;
}

/** Shows a film that reframes itself in another shape (wide, tall, square), above the video. */
export function ShapeSwitch({ shown, own, size, onShow }: ShapeSwitchProps) {
  const current = shown ?? own;
  return (
    <fieldset className="tool-group">
      <legend className="visually-hidden">Show the film as</legend>
      {own === null && (
        <PixelButton
          variant="ghost"
          icon="film"
          aria-label={`Show it in its own shape (${size.width} × ${size.height})`}
          tip={`Its own shape (${size.width} × ${size.height})`}
          aria-pressed={shown === null}
          onMouseDown={keepFocus}
          onClick={() => onShow(null)}
        />
      )}
      {SHAPES.map((entry) => {
        const use = SHAPE_USES[entry.shape];
        const name = `${use.short} (${use.label})${entry.shape === own ? ", your film's shape" : ""}`;
        return (
          <PixelButton
            key={entry.shape}
            variant="ghost"
            icon={entry.icon}
            aria-label={`Show it ${name}`}
            tip={name}
            aria-pressed={current === entry.shape}
            onMouseDown={keepFocus}
            onClick={() => onShow(entry.shape === own ? null : entry.shape)}
          />
        );
      })}
    </fieldset>
  );
}
