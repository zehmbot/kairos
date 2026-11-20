import { useEffect, useId, useRef, useState } from "react";
import {
  type FilmVoice,
  type FilmVoices,
  VOICE_TYPES,
  type VoiceType,
} from "../../shared/types.ts";
import { useAnotherVoice, useCast, useSetFilmVoices } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { VoicePicker } from "./VoicePicker.tsx";

export const TYPE_WORDS: Record<VoiceType, string> = {
  narrator: "Narrator",
  woman: "Woman",
  man: "Man",
  girl: "Girl",
  boy: "Boy",
  "old-woman": "Old woman",
  "old-man": "Old man",
};

export const speakerName = (speaker: string) =>
  speaker.charAt(0).toUpperCase() + speaker.slice(1).replaceAll("-", " ");

/** Plays one sample at a time. */
function useSample() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = (key: string, url: string) => {
    audio.current?.pause();
    if (playing === key) {
      setPlaying(null);
      return;
    }
    const next = new Audio(url);
    next.onended = () => setPlaying(null);
    void next.play().catch(() => setPlaying(null));
    audio.current = next;
    setPlaying(key);
  };
  return { playing, toggle };
}

/** Who speaks in the film: each speaker's type and voice, another random voice, or one you choose. */
export function CastList({ filmId, voices }: { filmId: string; voices: FilmVoices }) {
  const cast = useCast(filmId);
  const another = useAnotherVoice(filmId);
  const setVoices = useSetFilmVoices(filmId);
  const sample = useSample();
  const [picking, setPicking] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<VoiceType>("woman");
  const typeId = useId();
  const speakers = Object.keys(voices);

  const add = () => {
    const speaker = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    if (!/^[a-z]/.test(speaker)) return;
    cast.mutate([{ speaker, type }], { onSuccess: () => setName("") });
  };

  const problem =
    cast.data?.problems[0] ?? (cast.error ?? another.error ?? setVoices.error)?.message;

  return (
    <div className="stack">
      <span className="field-label">Who speaks</span>
      {speakers.length === 0 && (
        <p className="hint">
          No one yet. Write the narration below and Kairos casts the voices, or add a speaker.
        </p>
      )}
      <ul className="voice-cast">
        {speakers.map((speaker) => {
          const voice = voices[speaker] as FilmVoice;
          return (
            <li key={speaker} className="voice-cast-row">
              <span className="voice-speaker">{speakerName(speaker)}</span>
              {voice.type && !(speaker === "narrator" && voice.type === "narrator") && (
                <span className="voice-type">{TYPE_WORDS[voice.type]}</span>
              )}
              <span className="voice-cast-name">{voice.name}</span>
              <div className="note-actions">
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  icon={sample.playing === speaker ? "pause" : "play"}
                  aria-label={`Listen to ${voice.name}`}
                  disabled={!voice.sample}
                  onClick={() => voice.sample && sample.toggle(speaker, voice.sample)}
                />
                {voice.type && (
                  <PixelButton
                    variant="ghost"
                    data-size="small"
                    disabled={another.isPending}
                    title={`Another ${TYPE_WORDS[voice.type].toLowerCase()} voice, picked at random`}
                    onClick={() => another.mutate(speaker)}
                  >
                    {another.isPending && another.variables === speaker
                      ? "Picking…"
                      : "Another one"}
                  </PixelButton>
                )}
                <PixelButton variant="ghost" data-size="small" onClick={() => setPicking(speaker)}>
                  Change
                </PixelButton>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="voice-add-speaker"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="px-input"
          value={name}
          maxLength={32}
          placeholder="Add a speaker (ruby, grandpa…)"
          aria-label="Speaker's name"
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor={typeId} className="visually-hidden">
          Who they are
        </label>
        <select
          id={typeId}
          className="px-input voice-type-select"
          value={type}
          onChange={(event) => setType(event.target.value as VoiceType)}
        >
          {VOICE_TYPES.map((entry) => (
            <option key={entry} value={entry}>
              {TYPE_WORDS[entry]}
            </option>
          ))}
        </select>
        <PixelButton
          type="submit"
          variant="ghost"
          data-size="small"
          icon="plus"
          disabled={!name.trim() || cast.isPending}
        >
          {cast.isPending ? "Casting…" : "Add"}
        </PixelButton>
      </form>
      {problem && <p className="field-error">{problem}</p>}
      <VoicePicker
        open={picking !== null}
        speaker={speakerName(picking ?? "narrator")}
        onClose={() => setPicking(null)}
        onPick={(voice) => {
          if (!picking) return;
          // Your choice: it keeps the speaker's type, and isn't marked as picked by Kairos.
          setVoices.mutate({ ...voices, [picking]: { ...voices[picking], ...voice, auto: false } });
          setPicking(null);
        }}
      />
    </div>
  );
}
