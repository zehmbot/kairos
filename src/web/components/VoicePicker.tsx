import { useEffect, useId, useRef, useState } from "react";
import type { FilmVoice, VoiceInfo } from "../../shared/types.ts";
import { useVoiceLibrary, useVoiceStatus } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";

/** Choose a fish.audio voice: recently used ones first, then a search of the library or your own voices. */
export function VoicePicker({
  open,
  speaker,
  onPick,
  onClose,
}: {
  open: boolean;
  speaker: string;
  onPick: (voice: FilmVoice) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const searchId = useId();
  const status = useVoiceStatus();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const library = useVoiceLibrary(query, mine, open && Boolean(status.data?.key));
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    if (!open) {
      audioRef.current?.pause();
      setPlaying(null);
    }
  }, [open]);

  // Search a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);

  const play = (voice: VoiceInfo) => {
    audioRef.current?.pause();
    if (playing === voice.id || !voice.sample) {
      setPlaying(null);
      return;
    }
    const audio = new Audio(voice.sample);
    audio.onended = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
    audioRef.current = audio;
    setPlaying(voice.id);
  };

  const recent = status.data?.recent ?? [];

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-dialog-wide px-box"
      aria-labelledby={headingId}
      onClose={onClose}
    >
      <div className="form">
        <h2 id={headingId} className="dialog-title">
          A voice for {speaker}
        </h2>
        {!status.data?.key ? (
          <p>Add your fish.audio key first, in Settings → Voice.</p>
        ) : (
          <>
            {recent.length > 0 && (
              <div className="stack">
                <span className="field-label">Used lately</span>
                <div className="voice-recent">
                  {recent.map((voice) => (
                    <PixelButton
                      key={voice.id}
                      variant="ghost"
                      data-size="small"
                      onClick={() => onPick(voice)}
                    >
                      {voice.name}
                    </PixelButton>
                  ))}
                </div>
              </div>
            )}
            <div className="voice-search">
              <label htmlFor={searchId} className="field-label">
                Search voices
              </label>
              <input
                id={searchId}
                className="px-input"
                value={text}
                placeholder="narrator, calm, kid, grandpa…"
                onChange={(event) => setText(event.target.value)}
              />
              <div className="tool-group">
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  aria-pressed={!mine}
                  onClick={() => setMine(false)}
                >
                  Library
                </PixelButton>
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  aria-pressed={mine}
                  onClick={() => setMine(true)}
                >
                  My voices
                </PixelButton>
              </div>
            </div>
            {library.isPending && <p>Looking for voices…</p>}
            {library.isError && <p className="field-error">{library.error.message}</p>}
            {library.data?.length === 0 && (
              <p className="hint">
                {mine ? "You have no voices of your own on fish.audio yet." : "No voices found."}
              </p>
            )}
            <ul className="voice-list">
              {library.data?.map((voice) => (
                <li key={voice.id} className="voice-row px-box">
                  <div className="voice-text">
                    <span className="voice-name">{voice.name}</span>
                    <span className="hint">
                      {[voice.author && `by ${voice.author}`, voice.languages.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {voice.description && (
                      <span className="voice-description">{voice.description}</span>
                    )}
                  </div>
                  <div className="note-actions">
                    {voice.sample && (
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon={playing === voice.id ? "pause" : "play"}
                        aria-label={`${playing === voice.id ? "Stop" : "Play"} the sample of ${voice.name}`}
                        onClick={() => play(voice)}
                      />
                    )}
                    <PixelButton
                      data-size="small"
                      onClick={() => onPick({ id: voice.id, name: voice.name })}
                    >
                      Use
                    </PixelButton>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Close
          </PixelButton>
        </div>
      </div>
    </dialog>
  );
}
