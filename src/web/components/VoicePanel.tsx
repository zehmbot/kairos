import { useId, useState } from "react";
import { Link } from "react-router";
import type { AudioTrack, VoiceLine } from "../../shared/types.ts";
import { useDeleteLine, useFilmVoices, useLines, useMakeLines, useVoiceStatus } from "../api.ts";
import { formatLength } from "../player/time.ts";
import { CastList, speakerName } from "./CastList.tsx";
import { NarrationWriter } from "./NarrationWriter.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

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

/** The film's voices: who speaks, the narration Claude writes, and every line made so far. */
export function VoicePanel({ filmId, tracks, duration, now, onSeek, fileUrl }: VoicePanelProps) {
  const status = useVoiceStatus();
  const voices = useFilmVoices(filmId);
  const lines = useLines(filmId);
  const make = useMakeLines(filmId);
  const remove = useDeleteLine(filmId);
  const [speaker, setSpeaker] = useState("narrator");
  const [words, setWords] = useState("");
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null);
  const textId = useId();
  const speedId = useId();

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
      <div className="stack voice-panel">
        {!hasKey && status.isSuccess && (
          <p className="hint">
            To make voices, add your fish.audio key in <Link to="/settings">Settings → Voice</Link>.
          </p>
        )}

        <CastList filmId={filmId} voices={cast} />

        <NarrationWriter
          filmId={filmId}
          voices={cast}
          lines={lines.data ?? []}
          hasKey={hasKey}
          now={now}
          onSeek={onSeek}
        />

        {speakers.length > 0 && (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (words.trim() && cast[chosen]) generate();
            }}
          >
            <span className="field-label">Say a line yourself</span>
            {speakers.length > 1 && (
              <select
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
              rows={2}
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
                variant="ghost"
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
        )}

        {lines.data && lines.data.length > 0 && (
          <div className="stack">
            <span className="field-label">Voice lines ({lines.data.length})</span>
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
        {(lines.error ?? remove.error) && (
          <p className="field-error">{(lines.error ?? remove.error)?.message}</p>
        )}
      </div>
    </PixelPanel>
  );
}
