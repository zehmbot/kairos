import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { acceptFor } from "../../shared/media.ts";
import type { AudioTrack } from "../../shared/types.ts";
import { queryKeys, useAddSoundFromAsset, useSaveAudio } from "../api.ts";
import { formatLength } from "../player/time.ts";
import { AssetPicker } from "./AssetPicker.tsx";
import { FileButton, UploadStatus, useUploads } from "./DropZone.tsx";
import { InfoTip } from "./InfoTip.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

const SOUNDS = acceptFor(["sound"]);
const fileName = (file: string) => file.split("/").pop() ?? file;

/** Music and the sounds you added: not a voice line (the Voice tab) or an effect sound (the Effects lane). */
export const isOwnSound = (track: AudioTrack) => !track.sfx && !track.file.startsWith("voice/");

/** How long each sound file lasts (read by the browser), by URL. */
function useDurations(urls: readonly string[]): Record<string, number> {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const key = urls.join("|");
  useEffect(() => {
    const players = key
      .split("|")
      .filter(Boolean)
      .map((url) => {
        const audio = new Audio();
        audio.preload = "metadata";
        audio.onloadedmetadata = () =>
          setDurations((current) => ({ ...current, [url]: audio.duration }));
        audio.src = url;
        return audio;
      });
    return () => {
      for (const audio of players) audio.src = "";
    };
  }, [key]);
  return durations;
}

interface SoundPanelProps {
  filmId: string;
  tracks: readonly AudioTrack[];
  /** The film's length, for the bars. */
  duration: number;
  /** Address of a file in the film folder (served by the film server). */
  fileUrl: (file: string) => string;
  /** The player's current time: new sounds start there. */
  now: () => number;
  /** A clip clicked on the timeline: its sound comes into view and lights up. */
  focus?: { file: string; n: number } | null;
  /** Shows the Voice tab. */
  onShowVoice: () => void;
}

/**
 * The film's music and the sounds you added, with their start and volume; add from the computer or the asset
 * library. Voice lines (Voice tab) and effect sounds (Effects lane) are only counted: they're tuned where they live.
 */
export function SoundPanel({
  filmId,
  tracks,
  duration,
  fileUrl,
  now,
  focus,
  onShowVoice,
}: SoundPanelProps) {
  const queryClient = useQueryClient();
  const save = useSaveAudio(filmId);
  const fromAsset = useAddSoundFromAsset(filmId);
  const uploads = useUploads(() =>
    queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId) }),
  );
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<AudioTrack[]>([...tracks]);
  const baseId = useId();
  const [flash, setFlash] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  // A clip clicked on the timeline: its sound comes into view and lights up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new click (n) moves the list.
  useEffect(() => {
    if (!focus) return;
    const key = `${focus.file}#1`;
    rows.current.get(key)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlash(key);
    const id = window.setTimeout(() => setFlash(null), 2000);
    return () => window.clearTimeout(id);
  }, [focus?.n]);

  // Follow the film when it changes elsewhere (Claude, another window).
  const saved = JSON.stringify(tracks);
  useEffect(() => {
    setDraft(JSON.parse(saved));
  }, [saved]);

  const durations = useDurations(draft.filter(isOwnSound).map((track) => fileUrl(track.file)));
  const seen: Record<string, number> = {};
  const own = draft.filter(isOwnSound).length;
  const effects = draft.filter((track) => track.sfx).length;
  const voices = draft.filter((track) => !track.sfx && track.file.startsWith("voice/")).length;

  const commit = (next: AudioTrack[]) => {
    setDraft(next);
    if (JSON.stringify(next) !== saved) save.mutate(next);
  };
  const change = (index: number, patch: Partial<AudioTrack>) =>
    draft.map((track, i) => (i === index ? { ...track, ...patch } : track));

  const add = (files: File[]) =>
    uploads.send(
      files,
      (file) =>
        `/api/films/${encodeURIComponent(filmId)}/sounds?name=${encodeURIComponent(file.name)}&start=${now().toFixed(2)}`,
    );

  return (
    <PixelPanel title="Sound">
      {/* The film page takes files dropped here as sounds (see FilmPage). */}
      <div data-drop="sound">
        <div className="stack">
          {own === 0 ? (
            <p className="hint">
              No music or sounds yet. Add some: they play with the preview and go into the video.
            </p>
          ) : (
            <ul className="sound-list">
              {draft.map((track, index) => {
                // A key that stays the same while the start or volume changes: the file and which copy it is.
                seen[track.file] = (seen[track.file] ?? 0) + 1;
                const key = `${track.file}#${seen[track.file]}`;
                if (!isOwnSound(track)) return null;
                const length = durations[fileUrl(track.file)];
                const left = Math.min(100, (track.start / duration) * 100);
                // Music that loops plays to the end of the film.
                const width = track.loop
                  ? 100 - left
                  : length
                    ? Math.max(1, Math.min(100 - left, (length / duration) * 100))
                    : 0;
                const startId = `${baseId}-start-${index}`;
                const volumeId = `${baseId}-volume-${index}`;
                return (
                  <li
                    key={key}
                    ref={(element) => {
                      if (element) rows.current.set(key, element);
                      else rows.current.delete(key);
                    }}
                    className="sound-row px-box"
                    data-flash={flash === key ? "" : undefined}
                  >
                    <div className="sound-head">
                      <span className="sound-name">{fileName(track.file)}</span>
                      <span className="hint">{length ? formatLength(length) : ""}</span>
                    </div>
                    <div className="sound-bar" title="Where it plays in the film">
                      <span
                        className="sound-bar-fill"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </div>
                    <div className="sound-controls">
                      <label htmlFor={startId} className="field-label">
                        Starts at
                      </label>
                      <input
                        id={startId}
                        className="px-input sound-start"
                        type="number"
                        min={0}
                        step={0.1}
                        value={track.start}
                        onChange={(event) =>
                          setDraft(
                            change(index, { start: Math.max(0, Number(event.target.value) || 0) }),
                          )
                        }
                        onBlur={() => commit(draft)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commit(draft);
                        }}
                      />
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon="target"
                        tip="Start at the playhead"
                        onClick={() =>
                          commit(change(index, { start: Math.round(now() * 100) / 100 }))
                        }
                      />
                    </div>
                    <div className="check-line sound-music">
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={Boolean(track.loop && track.duck)}
                          onChange={(event) =>
                            commit(
                              change(index, {
                                loop: event.target.checked || undefined,
                                duck: event.target.checked || undefined,
                              }),
                            )
                          }
                        />
                        <span>Music under the voice</span>
                      </label>
                      <InfoTip text="It loops to the end, and gets quieter while voices talk." />
                    </div>
                    <div className="sound-controls">
                      <label htmlFor={volumeId} className="field-label">
                        Volume
                      </label>
                      <input
                        id={volumeId}
                        className="sound-volume"
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={track.volume}
                        onChange={(event) =>
                          setDraft(change(index, { volume: Number(event.target.value) }))
                        }
                        onPointerUp={() => commit(draft)}
                        onKeyUp={() => commit(draft)}
                      />
                      <span className="sound-volume-value">{Math.round(track.volume * 100)}%</span>
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        data-tone="danger"
                        icon="trash"
                        aria-label={`Remove ${fileName(track.file)}`}
                        tip="Remove"
                        onClick={() => commit(draft.filter((_, i) => i !== index))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="note-actions">
            <FileButton accept={SOUNDS} onFiles={add} disabled={uploads.busy}>
              Add sound
            </FileButton>
            <PixelButton variant="ghost" icon="folder" onClick={() => setPicking(true)}>
              From your assets
            </PixelButton>
          </div>
          <UploadStatus
            status={uploads.status}
            error={uploads.error ?? save.error?.message ?? null}
          />
          <p className="hint">New sounds start at the player's current time.</p>
          {(effects > 0 || voices > 0) && (
            <p className="hint">
              Also on the timeline:{" "}
              {effects > 0 && `${effects} effect sound${effects === 1 ? "" : "s"} (Effects lane)`}
              {effects > 0 && voices > 0 && " and "}
              {voices > 0 && (
                <>
                  {voices} voice line{voices === 1 ? "" : "s"} (
                  <button type="button" className="link-button" onClick={onShowVoice}>
                    Voice tab
                  </button>
                  )
                </>
              )}
              .
            </p>
          )}
        </div>
      </div>
      <AssetPicker
        open={picking}
        kinds={["sound"]}
        title="Add a sound from your assets"
        busy={fromAsset.isPending}
        onClose={() => setPicking(false)}
        onPick={(asset) =>
          fromAsset.mutate(
            { asset: asset.id, start: now() },
            { onSuccess: () => setPicking(false) },
          )
        }
      />
    </PixelPanel>
  );
}
