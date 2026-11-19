import { useId, useState } from "react";
import { Link } from "react-router";
import type { AudioTrack, VoiceLine } from "../../shared/types.ts";
import {
  useDeleteLine,
  useFilmVoices,
  useLines,
  useMakeLines,
  useSetFilmVoices,
  useVoiceStatus,
} from "../api.ts";
import { formatLength } from "../player/time.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";
import { VoicePicker } from "./VoicePicker.tsx";

interface VoicePanelProps {
  filmId: string;
  /** The film's sound tracks (to find where a line is on the timeline). */
  tracks: readonly AudioTrack[];
  /** The film's length (a line that goes past it is cut). */
  duration: number;
  /** The player's time now: new lines start there. */
  now: () => number;
  onSeek: (t: number) => void;
  /** Address of a film file on the film server (to play a line). */
  fileUrl: (file: string) => string;
}

const speakerName = (speaker: string) => speaker.charAt(0).toUpperCase() + speaker.slice(1);

/** The film's voices: who speaks with which voice, new lines, and the lines made so far. */
export function VoicePanel({ filmId, tracks, duration, now, onSeek, fileUrl }: VoicePanelProps) {
  const status = useVoiceStatus();
  const voices = useFilmVoices(filmId);
  const setVoices = useSetFilmVoices(filmId);
  const lines = useLines(filmId);
  const make = useMakeLines(filmId);
  const remove = useDeleteLine(filmId);
  const [picking, setPicking] = useState<string | null>(null);
  const [newSpeaker, setNewSpeaker] = useState("");
  const [speaker, setSpeaker] = useState("narrator");
  const [words, setWords] = useState("");
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null);
  const textId = useId();
  const speedId = useId();
  const speakerId = useId();

  const cast = voices.data ?? {};
  const speakers = Object.keys(cast);
  const hasKey = Boolean(status.data?.key);
  const chosen = cast[speaker] ? speaker : (speakers[0] ?? "narrator");

  const generate = () =>
    make.mutate(
      { speaker: chosen, lines: [words.trim()], speed, start: Math.round(now() * 100) / 100 },
      { onSuccess: () => setWords("") },
    );

  const play = (line: VoiceLine) => {
    playing?.pause();
    const audio = new Audio(fileUrl(line.file));
    void audio.play().catch(() => {});
    setPlaying(audio);
  };

  const regenerate = (line: VoiceLine) => {
    const track = tracks.find((t) => t.file === line.file);
    remove.mutate(line.id, {
      onSuccess: () =>
        make.mutate({
          speaker: line.speaker,
          lines: [line.text],
          speed: line.speed,
          ...(track ? { start: track.start } : {}),
        }),
    });
  };

  return (
    <PixelPanel title="Voice">
      <div className="stack">
        {!hasKey && status.isSuccess && (
          <p className="hint">
            To make voices, add your fish.audio key in <Link to="/settings">Settings → Voice</Link>.
          </p>
        )}

        <div className="stack">
          <span className="field-label">Who speaks</span>
          {speakers.length === 0 && (
            <p className="hint">Choose a voice for the narrator to start.</p>
          )}
          <ul className="voice-cast">
            {(speakers.length ? speakers : ["narrator"]).map((name) => (
              <li key={name} className="voice-cast-row">
                <span className="voice-speaker">{speakerName(name)}</span>
                <span className="hint">{cast[name]?.name ?? "no voice yet"}</span>
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  disabled={!hasKey}
                  onClick={() => setPicking(name)}
                >
                  {cast[name] ? "Change" : "Choose voice"}
                </PixelButton>
              </li>
            ))}
          </ul>
          <form
            className="voice-add-speaker"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newSpeaker
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/^-+|-+$/g, "");
              if (/^[a-z]/.test(name)) {
                setPicking(name);
                setNewSpeaker("");
              }
            }}
          >
            <input
              className="px-input"
              value={newSpeaker}
              maxLength={32}
              placeholder="Another speaker (ruby, grandpa…)"
              aria-label="Another speaker's name"
              onChange={(event) => setNewSpeaker(event.target.value)}
            />
            <PixelButton
              type="submit"
              variant="ghost"
              data-size="small"
              icon="plus"
              disabled={!hasKey || !newSpeaker.trim()}
            >
              Add
            </PixelButton>
          </form>
        </div>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (words.trim() && cast[chosen]) generate();
          }}
        >
          <span className="field-label">New line</span>
          {speakers.length > 1 && (
            <select
              id={speakerId}
              className="px-input"
              aria-label="Who says it"
              value={chosen}
              onChange={(event) => setSpeaker(event.target.value)}
            >
              {speakers.map((name) => (
                <option key={name} value={name}>
                  {speakerName(name)} ({cast[name]?.name})
                </option>
              ))}
            </select>
          )}
          <label htmlFor={textId} className="visually-hidden">
            The words
          </label>
          <textarea
            id={textId}
            className="px-input px-textarea"
            rows={3}
            maxLength={2000}
            value={words}
            placeholder="What should they say?"
            onChange={(event) => setWords(event.target.value)}
          />
          <div className="voice-speed">
            <label htmlFor={speedId} className="field-label">
              Speed
            </label>
            <input
              id={speedId}
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
            <span className="sound-volume-value">{speed.toFixed(2)}×</span>
          </div>
          <div className="note-actions">
            <PixelButton
              type="submit"
              icon="sound"
              disabled={!hasKey || !cast[chosen] || !words.trim() || make.isPending}
            >
              {make.isPending ? "Making the voice…" : "Generate"}
            </PixelButton>
            <span className="hint">
              {words.trim().length} characters · lands on the timeline at the playhead
            </span>
          </div>
          {make.error && <p className="field-error">{make.error.message}</p>}
        </form>

        {lines.data && lines.data.length > 0 && (
          <div className="stack">
            <span className="field-label">Lines ({lines.data.length})</span>
            <ul className="voice-lines">
              {lines.data.map((line) => {
                const track = tracks.find((t) => t.file === line.file);
                return (
                  <li key={line.id} className="voice-line px-box">
                    <div className="voice-line-head">
                      <span className="voice-speaker">{speakerName(line.speaker)}</span>
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        data-tone="danger"
                        icon="trash"
                        aria-label="Delete this line"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(line.id)}
                      />
                    </div>
                    <span className="voice-line-text">{line.text}</span>
                    <span className="hint">
                      {formatLength(line.duration)} · {line.voiceName}
                      {track ? ` · at ${track.start.toFixed(1)} s` : " · not on the timeline"}
                      {track && track.start + line.duration > duration + 0.01 && (
                        <span className="voice-past-end">
                          {" "}
                          · goes past the end of the film ({formatLength(duration)}): make the film
                          longer
                        </span>
                      )}
                    </span>
                    <div className="note-actions">
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon="play"
                        aria-label="Play this line"
                        onClick={() => play(line)}
                      />
                      {track && (
                        <PixelButton
                          variant="ghost"
                          data-size="small"
                          onClick={() => onSeek(track.start)}
                        >
                          Go to it
                        </PixelButton>
                      )}
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        disabled={!hasKey || make.isPending || remove.isPending}
                        onClick={() => regenerate(line)}
                      >
                        Regenerate
                      </PixelButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {(lines.error ?? remove.error ?? setVoices.error) && (
          <p className="field-error">{(lines.error ?? remove.error ?? setVoices.error)?.message}</p>
        )}
      </div>
      <VoicePicker
        open={picking !== null}
        speaker={speakerName(picking ?? "narrator")}
        onClose={() => setPicking(null)}
        onPick={(voice) => {
          if (!picking) return;
          setVoices.mutate({ ...cast, [picking]: voice }, { onSuccess: () => setSpeaker(picking) });
          setPicking(null);
        }}
      />
    </PixelPanel>
  );
}
