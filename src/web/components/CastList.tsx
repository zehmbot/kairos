import { useId, useState } from "react";
import {
  type FilmVoice,
  type FilmVoices,
  VOICE_TYPES,
  type VoiceType,
} from "../../shared/types.ts";
import { useAnotherVoice, useCast, useSetFilmVoices } from "../api.ts";
import { useSample } from "../useSample.ts";
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

interface CastListProps {
  filmId: string;
  voices: FilmVoices;
  /** A speaker's voice was changed (another one, or one you chose): what it was before. */
  onChanged: (speaker: string, before: FilmVoice) => void;
}

/** Who speaks in the film: each speaker's type and voice, another random voice, or one you choose. */
export function CastList({ filmId, voices, onChanged }: CastListProps) {
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
      {speakers.length === 0 && (
        <p className="hint">
          No one yet. Write the narration with Claude and Kairos casts the voices, or add a speaker.
        </p>
      )}
      <ul className="voice-cast">
        {speakers.map((speaker) => {
          const voice = voices[speaker] as FilmVoice;
          return (
            <li key={speaker} className="voice-cast-row">
              <div className="voice-cast-who">
                <span className="voice-cast-label">
                  <span className="voice-speaker">{speakerName(speaker)}</span>
                  {voice.type && !(speaker === "narrator" && voice.type === "narrator") && (
                    <span className="voice-type">{TYPE_WORDS[voice.type]}</span>
                  )}
                </span>
                <span className="voice-cast-name">{voice.name}</span>
              </div>
              <div className="icon-row">
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  icon={sample.playing === speaker ? "pause" : "play"}
                  tip={sample.playing === speaker ? "Stop" : "Listen"}
                  aria-label={`Listen to ${voice.name}`}
                  disabled={!voice.sample}
                  onClick={() => voice.sample && sample.toggle(speaker, voice.sample)}
                />
                {voice.type && (
                  <PixelButton
                    variant="ghost"
                    data-size="small"
                    icon="dice"
                    tip={
                      another.isPending && another.variables === speaker
                        ? "Picking…"
                        : "Another voice"
                    }
                    aria-label={`Another ${TYPE_WORDS[voice.type].toLowerCase()} voice for ${speakerName(speaker)}`}
                    disabled={another.isPending}
                    onClick={() =>
                      another.mutate(speaker, { onSuccess: () => onChanged(speaker, voice) })
                    }
                  />
                )}
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  icon="search"
                  tip="Choose a voice"
                  aria-label={`Choose a voice for ${speakerName(speaker)}`}
                  onClick={() => setPicking(speaker)}
                />
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
          placeholder="Name"
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
          tip={cast.isPending ? "Casting…" : "Add speaker"}
          disabled={!name.trim() || cast.isPending}
        />
      </form>
      {problem && <p className="field-error">{problem}</p>}
      <VoicePicker
        open={picking !== null}
        speaker={speakerName(picking ?? "narrator")}
        onClose={() => setPicking(null)}
        onPick={(voice) => {
          const before = picking ? voices[picking] : undefined;
          if (!picking || !before) return;
          const speaker = picking;
          // Your choice: it keeps the speaker's type, and isn't marked as picked by Kairos.
          setVoices.mutate(
            { ...voices, [speaker]: { ...before, ...voice, auto: false } },
            { onSuccess: () => before.id !== voice.id && onChanged(speaker, before) },
          );
          setPicking(null);
        }}
      />
    </div>
  );
}
