import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { mediaKindOf } from "../../shared/media.ts";
import type { AudioTrack, Word } from "../../shared/types.ts";
import { drawWaveform, usePeaks } from "../player/waveform.ts";
import {
  clipLength,
  fitZoom,
  laneCount,
  MAX_PPS,
  moveClip,
  round,
  tickLabel,
  tickStep,
  trimEnd,
  trimStart,
  withLanes,
} from "../timeline.ts";
import { PixelButton } from "./PixelButton.tsx";

const RULER_H = 24;
const FILM_H = 36;
const LANE_H = 44;
const WAVE_H = 28;
/** Word labels show on clips from this zoom (pixels per second). */
const WORDS_PPS = 40;
/** A word shows its text when it has this much room (pixels). */
const WORD_ROOM = 26;
/** A clip whose file isn't read yet shows this long. */
const PLACEHOLDER = 1;

interface Scene {
  name: string;
  start: number;
  end?: number;
}

export interface TimelineProps {
  duration: number;
  /** The player's time now, in seconds. */
  time: number;
  scenes: readonly Scene[];
  notes: readonly { id: string; t: number; until: number | null }[];
  tracks: readonly AudioTrack[];
  /** Address the app can read a film sound file from (for waveforms). */
  soundUrl: (file: string) => string;
  onSeek: (t: number) => void;
  /** Saves the film's whole list of sound tracks. */
  onChange: (tracks: AudioTrack[]) => void;
  /** Sound files dropped on the timeline, at a time and a lane. */
  onAddSounds: (files: File[], start: number, lane: number) => void;
  /** Word timings of the sounds that have them, by file. */
  words?: Readonly<Record<string, { words: readonly Word[] }>>;
  /** Asks for the word timings of a sound (speech-to-text). */
  onGetWords?: (file: string) => void;
  /** The file whose words are being found, and the last problem. */
  wordsBusy?: string | null;
  wordsError?: string | null;
  /** A clip clicked (not dragged): its file (the page shows its line or sound in the side tab). */
  onClipClick?: (file: string) => void;
  /** Selects the clip of this file (from the Voice or Sound tab); `n` changes on every ask. */
  selectFile?: { file: string; n: number } | null;
  /** Files whose clips are out of date (a voice made before its words or voice changed). */
  stale?: ReadonlySet<string>;
}

type Drag =
  | { mode: "scrub" }
  | {
      mode: "move" | "start" | "end";
      index: number;
      x0: number;
      y0: number;
      orig: AudioTrack;
      length: number;
      moved: boolean;
      /** Where the clip is now (the screen may not have caught up yet). */
      live: AudioTrack;
    };

const fileName = (file: string) => file.split("/").pop() ?? file;

/** The film and its sound on a timeline: scenes, sound clips with waveforms, a playhead in step with the player. */
export function Timeline({
  duration,
  time,
  scenes,
  notes,
  tracks,
  soundUrl,
  onSeek,
  onChange,
  onAddSounds,
  words,
  onGetWords,
  wordsBusy,
  wordsError,
  onClipClick,
  selectFile,
  stale,
}: TimelineProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The list before the volume slider started moving (Undo goes back there).
  const sliderBefore = useRef<AudioTrack[] | null>(null);
  const [draft, setDraft] = useState<AudioTrack[]>(() => withLanes(tracks));
  const [history, setHistory] = useState<{ past: AudioTrack[][]; future: AudioTrack[][] }>({
    past: [],
    future: [],
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [fit, setFit] = useState(true);
  const [pps, setPps] = useState(20);
  const [durations, setDurations] = useState<Record<string, number>>({});

  // Follow the film when it changes elsewhere (Claude, the Sound tab), except in the middle of a drag.
  const saved = JSON.stringify(tracks);
  useEffect(() => {
    if (!drag.current) setDraft(withLanes(JSON.parse(saved)));
  }, [saved]);

  // "Fit" zoom follows the timeline's width.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !fit) return;
    const update = () => setPps(fitZoom(scroll.clientWidth - 8, duration));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [fit, duration]);

  // The film page fits the video above the timeline: it needs the timeline's height.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const review = section?.closest<HTMLElement>(".review");
    if (!section || !review) return;
    const update = () =>
      review.style.setProperty("--timeline-h", `${Math.round(section.offsetHeight)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(section);
    return () => {
      observer.disconnect();
      review.style.removeProperty("--timeline-h");
    };
  }, []);

  // A line or sound chosen in a side tab: its clip is selected and comes into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new ask (n) selects.
  useEffect(() => {
    if (!selectFile) return;
    const index = draft.findIndex((track) => track.file === selectFile.file);
    if (index < 0) return;
    setSelected(index);
    const track = draft[index];
    const scroll = scrollRef.current;
    if (track && scroll) {
      const x = track.start * pps;
      if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40) {
        scroll.scrollLeft = Math.max(0, x - 40);
      }
    }
  }, [selectFile?.n]);

  const lengthOf = useCallback(
    (track: AudioTrack) => clipLength(track, durations[track.file]) ?? PLACEHOLDER,
    [durations],
  );
  const lanes = laneCount(draft);
  const width = Math.max(duration * pps, 1);

  /** Saves a change, remembering the list before it (`before`) for Undo. */
  const commit = (next: AudioTrack[], before: AudioTrack[] = draft) => {
    setHistory((h) => ({ past: [...h.past.slice(-49), before], future: [] }));
    setDraft(next);
    onChange(next);
  };
  const undo = () => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [draft, ...history.future] });
    setDraft(previous);
    onChange(previous);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, draft], future: history.future.slice(1) });
    setDraft(next);
    onChange(next);
  };
  const remove = (index: number) => {
    setSelected(null);
    commit(draft.filter((_, i) => i !== index));
  };
  const change = (index: number, patch: Partial<AudioTrack>) =>
    draft.map((track, i) => (i === index ? { ...track, ...patch } : track));

  // Keys: Delete removes the selected clip, Ctrl+Z / Ctrl+Y undo and redo, Escape lets go.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, dialog, [contenteditable]")) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
        if (!history.past.length) return;
        event.preventDefault();
        undo();
      } else if (
        mod &&
        (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        if (!history.future.length) return;
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected !== null) {
        event.preventDefault();
        remove(selected);
      } else if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Pointer: positions ----------

  const timeAt = (clientX: number) => {
    const box = contentRef.current?.getBoundingClientRect();
    return box ? Math.min(duration, Math.max(0, (clientX - box.left) / pps)) : 0;
  };
  const laneAt = (clientY: number) => {
    const box = lanesRef.current?.getBoundingClientRect();
    return box ? Math.max(0, Math.min(lanes, Math.floor((clientY - box.top) / LANE_H))) : 0;
  };
  /** What a moving edge can snap to: the playhead, scenes, the film's ends and other clips. */
  const targets = (except: number) => [
    0,
    duration,
    time,
    ...scenes.flatMap((scene) => [scene.start, ...(scene.end !== undefined ? [scene.end] : [])]),
    ...draft.flatMap((track, i) =>
      i === except ? [] : [track.start, track.start + lengthOf(track)],
    ),
  ];

  const startScrub = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode: "scrub" };
    setSelected(null);
    onSeek(timeAt(event.clientX));
  };

  const startClip = (event: ReactPointerEvent, index: number, mode: "move" | "start" | "end") => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const orig = draft[index];
    if (!orig) return;
    setSelected(index);
    drag.current = {
      mode,
      index,
      x0: event.clientX,
      y0: event.clientY,
      orig,
      length: lengthOf(orig),
      moved: false,
      live: orig,
    };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const current = drag.current;
    if (!current) return;
    if (current.mode === "scrub") {
      onSeek(timeAt(event.clientX));
      return;
    }
    const dx = event.clientX - current.x0;
    if (!current.moved && Math.abs(dx) < 3 && Math.abs(event.clientY - current.y0) < 3) return;
    current.moved = true;
    const dt = dx / pps;
    const near = targets(current.index);
    const { orig, length } = current;
    let next: AudioTrack;
    if (current.mode === "move") {
      next = moveClip(orig, orig.start + dt, laneAt(event.clientY), length, near, pps);
    } else if (current.mode === "start") {
      next = trimStart(orig, orig.start + dt, length, near, pps);
    } else {
      next = trimEnd(orig, orig.start + length + dt, durations[orig.file], near, pps);
    }
    current.live = next;
    setDraft((list) => list.map((track, i) => (i === current.index ? next : track)));
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current || current.mode === "scrub") return;
    if (!current.moved) {
      // A click, not a drag: show the clip's line or sound in its tab.
      const file = draft[current.index]?.file;
      if (file) onClipClick?.(file);
      return;
    }
    // The last position the pointer gave, not the last one drawn: a fast move can end before the screen
    // catches up.
    const { live, orig, index } = current;
    if (JSON.stringify(live) === JSON.stringify(orig)) return;
    const after = draft.map((track, i) => (i === index ? live : track));
    const before = draft.map((track, i) => (i === index ? orig : track));
    setDraft(after);
    // Save, with Undo going back to before the drag.
    setHistory((h) => ({ past: [...h.past.slice(-49), before], future: [] }));
    onChange(after);
  };

  // ---------- Drops: sound files land where they are dropped ----------

  const onDrop = (event: React.DragEvent) => {
    const files = [...event.dataTransfer.files];
    const sounds = files.filter((file) => mediaKindOf(file.name) === "sound");
    if (sounds.length === 0) return; // pictures and videos: the page asks what they are for
    event.preventDefault();
    event.stopPropagation();
    onAddSounds(sounds, round(timeAt(event.clientX)), laneAt(event.clientY));
  };

  const zoom = (factor: number) => {
    setFit(false);
    setPps((p) =>
      Math.min(
        MAX_PPS,
        Math.max(fitZoom((scrollRef.current?.clientWidth ?? 600) - 8, duration), p * factor),
      ),
    );
  };

  const step = tickStep(pps);
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => round(i * step));
  const laneIds = Array.from({ length: lanes }, (_, i) => i);
  const selectedTrack = selected !== null ? draft[selected] : undefined;
  // A key that stays the same while a clip moves: its file and which copy of that file it is.
  const seen: Record<string, number> = {};
  const clips = draft.map((track, index) => {
    seen[track.file] = (seen[track.file] ?? 0) + 1;
    return { track, index, key: `${track.file}#${seen[track.file]}` };
  });
  /** A lane holding only spoken lines (files in voice/). */
  const isVoiceLane = (lane: number) => {
    const inLane = draft.filter((track) => track.lane === lane);
    return inLane.length > 0 && inLane.every((track) => track.file.startsWith("voice/"));
  };
  const laneMuted = (lane: number) => {
    const inLane = draft.filter((track) => track.lane === lane);
    return inLane.length > 0 && inLane.every((track) => track.muted);
  };

  return (
    <section ref={sectionRef} className="timeline" aria-label="Timeline">
      <div className="timeline-bar">
        <span className="timeline-title">Timeline</span>
        <div className="timeline-tools">
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="undo"
            disabled={!history.past.length}
            onClick={undo}
            tip="Undo (Ctrl+Z)"
          >
            Undo
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            disabled={!history.future.length}
            onClick={redo}
            tip="Redo (Ctrl+Y)"
          >
            Redo
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            aria-label="Zoom out"
            tip="Zoom out"
            onClick={() => zoom(1 / 1.5)}
          >
            −
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            aria-label="Zoom in"
            tip="Zoom in"
            onClick={() => zoom(1.5)}
          >
            +
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            aria-pressed={fit}
            onClick={() => setFit(true)}
            tip="Show the whole film"
          >
            Fit
          </PixelButton>
        </div>
      </div>

      <div className="timeline-grid">
        <div className="timeline-heads">
          <div className="timeline-head" style={{ height: RULER_H }} />
          <div className="timeline-head timeline-head-film" style={{ height: FILM_H }}>
            Film
          </div>
          {laneIds.map((lane) => (
            <div
              key={lane}
              className={`timeline-head lane-c${lane % 4}${isVoiceLane(lane) ? " lane-voice" : ""}`}
              style={{ height: LANE_H }}
            >
              <span>{isVoiceLane(lane) ? "Voice" : `Sound ${lane + 1}`}</span>
              <button
                type="button"
                className="timeline-mute"
                aria-pressed={laneMuted(lane)}
                aria-label={laneMuted(lane) ? "Sound back on" : "Mute this track"}
                data-tip={laneMuted(lane) ? "Sound back on" : "Mute"}
                onClick={() => {
                  const mute = !laneMuted(lane);
                  commit(
                    draft.map((track) => (track.lane === lane ? { ...track, muted: mute } : track)),
                  );
                }}
              >
                M
              </button>
            </div>
          ))}
          <div className="timeline-head timeline-head-new" style={{ height: LANE_H }}>
            + Sound
          </div>
        </div>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: the timeline is a pointer surface; the player's controls and the Sound tab do the same with the keyboard. */}
        <div
          ref={scrollRef}
          className="timeline-scroll"
          onWheel={(event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            zoom(event.deltaY < 0 ? 1.25 : 0.8);
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={onDrop}
        >
          <div
            ref={contentRef}
            className="timeline-content"
            style={{ width }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="timeline-ruler" style={{ height: RULER_H }} onPointerDown={startScrub}>
              {ticks.map((t) => (
                <span key={t} className="timeline-tick" style={{ left: t * pps }}>
                  {tickLabel(t, step)}
                </span>
              ))}
            </div>
            <div
              className="timeline-lane timeline-film"
              style={{ height: FILM_H }}
              onPointerDown={startScrub}
            >
              {(scenes.length ? scenes : [{ name: "Film", start: 0, end: duration }]).map(
                (scene, i, all) => {
                  const end = scene.end ?? all[i + 1]?.start ?? duration;
                  return (
                    <button
                      key={`${scene.name}@${scene.start}`}
                      type="button"
                      className="timeline-scene"
                      style={{
                        left: scene.start * pps,
                        width: Math.max(2, (end - scene.start) * pps),
                      }}
                      title={`${scene.name}: jump here`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onSeek(scene.start)}
                    >
                      {scene.name}
                    </button>
                  );
                },
              )}
              {notes.map((note) => (
                <span
                  key={note.id}
                  className="timeline-note"
                  style={{
                    left: note.t * pps,
                    width:
                      note.until !== null ? Math.max(2, (note.until - note.t) * pps) : undefined,
                  }}
                />
              ))}
            </div>
            <div ref={lanesRef}>
              {laneIds.map((lane) => (
                <div
                  key={lane}
                  className={`timeline-lane timeline-sound lane-c${lane % 4}${isVoiceLane(lane) ? " lane-voice" : ""}`}
                  data-muted={laneMuted(lane) ? "true" : undefined}
                  style={{ height: LANE_H }}
                  onPointerDown={startScrub}
                >
                  {clips
                    .filter(({ track }) => track.lane === lane)
                    .map(({ track, index, key }) => (
                      <Clip
                        key={key}
                        track={track}
                        url={soundUrl(track.file)}
                        pps={pps}
                        length={lengthOf(track)}
                        selected={selected === index}
                        stale={stale?.has(track.file) ?? false}
                        words={words?.[track.file]?.words}
                        onDuration={(d) =>
                          setDurations((all) =>
                            all[track.file] === d ? all : { ...all, [track.file]: d },
                          )
                        }
                        onPointerDown={(event, mode) => startClip(event, index, mode)}
                      />
                    ))}
                </div>
              ))}
              <div
                className="timeline-lane timeline-new"
                style={{ height: LANE_H }}
                onPointerDown={startScrub}
              >
                <span className="timeline-new-text">Drop a sound here</span>
              </div>
            </div>
            <div className="timeline-playhead" style={{ left: time * pps }} />
          </div>
        </div>
      </div>

      {selectedTrack && selected !== null && (
        <div className="timeline-clipbar">
          <span className="timeline-clipname">{fileName(selectedTrack.file)}</span>
          <span className="hint">
            {selectedTrack.start.toFixed(2)} s →{" "}
            {(selectedTrack.start + lengthOf(selectedTrack)).toFixed(2)} s
          </span>
          <label className="timeline-volume">
            <span className="field-label">Volume</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={selectedTrack.volume}
              onPointerDown={() => {
                sliderBefore.current = draft;
              }}
              onKeyDown={() => {
                sliderBefore.current ??= draft;
              }}
              onChange={(event) =>
                setDraft(change(selected, { volume: Number(event.target.value) }))
              }
              onPointerUp={() => {
                commit(draft, sliderBefore.current ?? draft);
                sliderBefore.current = null;
              }}
              onKeyUp={() => {
                commit(draft, sliderBefore.current ?? draft);
                sliderBefore.current = null;
              }}
            />
            <span className="sound-volume-value">{Math.round(selectedTrack.volume * 100)}%</span>
          </label>
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="mute"
            tip={selectedTrack.muted ? "Sound back on" : "Mute"}
            aria-label="Mute"
            aria-pressed={selectedTrack.muted}
            onClick={() => commit(change(selected, { muted: !selectedTrack.muted }))}
          />
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="target"
            tip="Start at the playhead"
            onClick={() => commit(change(selected, { start: round(time) }))}
          />
          {onGetWords &&
            (words?.[selectedTrack.file] ? (
              <span className="hint">{words[selectedTrack.file]?.words.length} words</span>
            ) : (
              <PixelButton
                variant="ghost"
                data-size="small"
                disabled={Boolean(wordsBusy)}
                tip="When each word is said (uses credits)"
                onClick={() => onGetWords(selectedTrack.file)}
              >
                {wordsBusy === selectedTrack.file ? "Listening…" : "Get words"}
              </PixelButton>
            ))}
          <PixelButton
            variant="ghost"
            data-size="small"
            data-tone="danger"
            icon="trash"
            tip="Remove"
            onClick={() => remove(selected)}
          />
        </div>
      )}
      {wordsError && <p className="field-error timeline-error">{wordsError}</p>}
    </section>
  );
}

/** One sound clip: its waveform (the trimmed part), its name, and edges to trim. */
function Clip({
  track,
  url,
  pps,
  length,
  selected,
  stale,
  words,
  onDuration,
  onPointerDown,
}: {
  track: AudioTrack;
  url: string;
  pps: number;
  length: number;
  selected: boolean;
  stale: boolean;
  words?: readonly Word[];
  onDuration: (duration: number) => void;
  onPointerDown: (event: ReactPointerEvent, mode: "move" | "start" | "end") => void;
}) {
  const peaks = usePeaks(url);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.max(4, length * pps);
  const canvasWidth = Math.min(8192, Math.round(width));

  useEffect(() => {
    if (peaks) onDuration(peaks.duration);
  }, [peaks, onDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // A new width clears the canvas: draw again.
    if (canvas && peaks && canvasWidth > 0) drawWaveform(canvas, peaks, track.from, length);
  }, [peaks, track.from, length, canvasWidth]);

  return (
    <div
      className="timeline-clip"
      data-selected={selected ? "true" : undefined}
      data-muted={track.muted ? "true" : undefined}
      data-stale={stale ? "true" : undefined}
      style={{ left: track.start * pps, width }}
      title={`${fileName(track.file)}${stale ? " (out of date: update it in the Voice tab)" : ""}: drag to move, drag an edge to trim`}
      onPointerDown={(event) => onPointerDown(event, "move")}
    >
      <canvas ref={canvasRef} className="timeline-wave" width={canvasWidth} height={WAVE_H} />
      <span className="timeline-clip-name">{fileName(track.file)}</span>
      {words && pps >= WORDS_PPS && (
        <div className="timeline-words">
          {words.map((word, i) => {
            const x = (word.start - track.from) * pps;
            if (x < 0 || word.start >= track.from + length) return null;
            const room = ((words[i + 1]?.start ?? track.from + length) - word.start) * pps - 2;
            // Too narrow for its text: just the mark where the word starts.
            return (
              <span
                key={`${word.start}:${word.text}`}
                className="timeline-word"
                style={{ left: x, maxWidth: Math.max(4, room) }}
                title={word.text}
              >
                {room >= WORD_ROOM ? word.text : ""}
              </span>
            );
          })}
        </div>
      )}
      <span
        className="timeline-edge timeline-edge-start"
        onPointerDown={(event) => onPointerDown(event, "start")}
      />
      <span
        className="timeline-edge timeline-edge-end"
        onPointerDown={(event) => onPointerDown(event, "end")}
      />
    </div>
  );
}
