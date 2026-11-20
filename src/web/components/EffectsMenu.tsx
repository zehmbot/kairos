import { useEffect, useRef, useState } from "react";
import { soundUrl, useSounds } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";

/**
 * "+ Effect": Kairos' own sound effects, each with a listen button; picking one adds it to the Effects lane at
 * the playhead.
 */
export function EffectsMenu({ onPick }: { onPick: (sound: string) => void }) {
  const sounds = useSounds();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const playing = useRef<HTMLAudioElement | null>(null);

  // Closes on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const listen = (name: string) => {
    playing.current?.pause();
    const audio = new Audio(soundUrl(name));
    playing.current = audio;
    void audio.play().catch(() => undefined);
  };

  return (
    <div className="effects-menu" ref={boxRef}>
      <PixelButton
        variant="ghost"
        data-size="small"
        aria-expanded={open}
        tip="Add a sound effect at the playhead"
        onClick={() => setOpen((value) => !value)}
      >
        + Effect
      </PixelButton>
      {open && (
        <ul className="effects-menu-list px-box">
          {(sounds.data ?? []).map((sound) => (
            <li key={sound.name}>
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="play"
                tip="Listen"
                onClick={() => listen(sound.name)}
              />
              <button
                type="button"
                className="effects-menu-pick"
                onClick={() => {
                  onPick(sound.name);
                  setOpen(false);
                }}
              >
                {sound.label}
              </button>
            </li>
          ))}
          {sounds.isError && <li className="field-error">{sounds.error.message}</li>}
        </ul>
      )}
    </div>
  );
}
