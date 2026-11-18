import { useCallback, useId, useRef, useState } from "react";
import { MAX_FPS, MIN_FPS } from "../../shared/types.ts";
import { FRAME_RATES, isPresetRate, parseFrameRate } from "../frameRate.ts";
import { TextField } from "./TextField.tsx";

/** State of a frame rate choice: one of the presets, or a rate typed in "Other". */
export function useFrameRate(initial: number) {
  const [choice, setChoice] = useState<number | "other">(() =>
    isPresetRate(initial) ? initial : "other",
  );
  const [otherText, setOtherText] = useState(() => (isPresetRate(initial) ? "" : String(initial)));

  const reset = useCallback((fps: number) => {
    setChoice(isPresetRate(fps) ? fps : "other");
    setOtherText(isPresetRate(fps) ? "" : String(fps));
  }, []);

  const typed = choice === "other" ? parseFrameRate(otherText) : null;
  /** The chosen rate, or `null` while "Other" holds nothing usable. */
  const fps = choice === "other" ? (typed?.ok ? typed.fps : null) : choice;
  /** Shown once something was typed. */
  const error = typed && !typed.ok && otherText.trim() !== "" ? typed.error : null;

  return { choice, setChoice, otherText, setOtherText, fps, error, reset };
}

export type FrameRateState = ReturnType<typeof useFrameRate>;

/** Frame rate cards: 24, 30, 60 or Other (any rate in the allowed range). */
export function FrameRatePicker({ state }: { state: FrameRateState }) {
  const name = useId();
  const otherRef = useRef<HTMLInputElement>(null);
  const { choice, setChoice } = state;

  return (
    <fieldset className="choice-picker">
      <legend className="field-label">Frame rate</legend>
      <div className="choice-cards rate-cards">
        {FRAME_RATES.map((rate) => (
          <label key={rate.fps} className="choice-card">
            <input
              type="radio"
              name={name}
              checked={choice === rate.fps}
              onChange={() => setChoice(rate.fps)}
              className="visually-hidden"
            />
            <span className="rate-value">{rate.fps}</span>
            <span className="choice-label">{rate.label}</span>
          </label>
        ))}
        <label className="choice-card">
          <input
            type="radio"
            name={name}
            checked={choice === "other"}
            onChange={() => {
              setChoice("other");
              requestAnimationFrame(() => otherRef.current?.focus());
            }}
            className="visually-hidden"
          />
          <span className="rate-value">...</span>
          <span className="choice-label">Other</span>
        </label>
      </div>
      {choice === "other" && (
        <TextField
          ref={otherRef}
          label="Frames per second"
          type="number"
          inputMode="decimal"
          min={MIN_FPS}
          max={MAX_FPS}
          step="any"
          placeholder="48"
          value={state.otherText}
          onChange={(event) => state.setOtherText(event.target.value)}
          hint={`Any rate from ${MIN_FPS} to ${MAX_FPS}.`}
          error={state.error}
        />
      )}
      <p className="field-hint rate-hint">
        Frames per second. Higher rates look smoother, but take longer to render.
      </p>
    </fieldset>
  );
}
