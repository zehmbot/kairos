import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CLIP_PLACES,
  type ClipPlace,
  isPicture,
  placeAt,
  placeOf,
  clipLength as videoLength,
} from "../../shared/clips.ts";
import { mediaKindOf } from "../../shared/media.ts";
import type { AudioTrack, VideoClip, Word } from "../../shared/types.ts";
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
import { EffectsMenu } from "./EffectsMenu.tsx";
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
/** Video tracks offered at most. */
const MAX_VIDEO_LANES = 16;

const PLACE_WORDS: Record<ClipPlace, string> = {
  center: "Center",
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
const FADES = [0, 0.3, 0.5, 1];

interface Scene {
  name: string;
  start: number;
  end?: number;
}

/** What a slider needs: show changes at once, save them as one Undo step when let go. */
type SliderProps = Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onPointerDown" | "onKeyDown" | "onChange" | "onPointerUp" | "onKeyUp"
>;

/** A clip on the timeline: a sound track or a video clip (a video or a picture). */
type SoundItem = AudioTrack & { kind: "sound" };
type VideoItem = VideoClip & { kind: "video" };
type Item = SoundItem | VideoItem;

const itemsOf = (audio: readonly AudioTrack[], video: readonly VideoClip[]): Item[] => [
  ...withLanes(audio).map((track) => ({ ...track, kind: "sound" as const })),
  ...withLanes(video).map((clip) => ({ ...clip, kind: "video" as const })),
];

/** The film's two lists again, as kairos.json keeps them. */
function split(items: readonly Item[]): { audio: AudioTrack[]; video: VideoClip[] } {
  const audio: AudioTrack[] = [];
  const video: VideoClip[] = [];
  for (const { kind, ...rest } of items) {
    if (kind === "sound") audio.push(rest as AudioTrack);
    else video.push(rest as VideoClip);
  }
  return { audio, video };
}

export interface TimelineProps {
  duration: number;
  /** The film's size in pixels (to place video clips in its corners). */
  filmSize: { width: number; height: number };
  /** The player's time now, in seconds. */
  time: number;
  scenes: readonly Scene[];
  notes: readonly { id: string; t: number; until: number | null }[];
  tracks: readonly AudioTrack[];
  /** The film's video clips (videos and pictures over the film). */
  video: readonly VideoClip[];
  /** Address the app can read a film sound file from (for waveforms). */
  soundUrl: (file: string) => string;
  /** Address of a film file on the film server (video clips' first frames and lengths). */
  fileUrl: (file: string) => string;
  onSeek: (t: number) => void;
  /** Saves the film's whole lists of sound tracks and video clips. */
  onChange: (next: { audio: AudioTrack[]; video: VideoClip[] }) => void;
  /** Sound files dropped on the timeline, at a time and a lane. */
  onAddSounds: (files: File[], start: number, lane: number) => void;
  /** Videos and pictures dropped on the timeline, at a time and a video lane (none: a new one). */
  onAddClips: (files: File[], start: number, lane?: number) => void;
  /** Word timings of the sounds that have them, by file. */
  words?: Readonly<Record<string, { words: readonly Word[] }>>;
  /** Asks for the word timings of a sound (speech-to-text). */
  onGetWords?: (file: string) => void;
  /** The file whose words are being found, and the last problem. */
  wordsBusy?: string | null;
  wordsError?: string | null;
  /** A clip clicked (not dragged): its file and kind (the page shows a sound's line or track in its tab). */
  onClipClick?: (file: string, kind: Item["kind"]) => void;
  /** Selects the clip of this file (from the Voice or Sound tab); `n` changes on every ask. */
  selectFile?: { file: string; n: number } | null;
  /** Files whose clips are out of date (a voice made before its words or voice changed). */
  stale?: ReadonlySet<string>;
  /** Adds one of Kairos' sound effects at a time (the Effects lane). */
  onAddEffect?: (sound: string, start: number) => void;
}

type Drag =
  | { mode: "scrub" }
  | {
      mode: "move" | "start" | "end";
      index: number;
      x0: number;
      y0: number;
      orig: Item;
      length: number;
      moved: boolean;
      /** Where the clip is now (the screen may not have caught up yet). */
      live: Item;
    };

const fileName = (file: string) => file.split("/").pop() ?? file;

/**
 * The film on a timeline: video tracks over the film, its scenes, and its sound tracks, with a playhead in step
 * with the player. Clips of both kinds move, trim and snap the same way, with one Undo list.
 */
export function Timeline({
  duration,
  filmSize,
  time,
  scenes,
  notes,
  tracks,
  video,
  soundUrl,
  fileUrl,
  onSeek,
  onChange,
  onAddSounds,
  onAddClips,
  words,
  onGetWords,
  wordsBusy,
  wordsError,
  onClipClick,
  selectFile,
  stale,
  onAddEffect,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const videoLanesRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The list before a slider started moving (Undo goes back there).
  const sliderBefore = useRef<Item[] | null>(null);
  const [draft, setDraft] = useState<Item[]>(() => itemsOf(tracks, video));
  const [history, setHistory] = useState<{ past: Item[][]; future: Item[][] }>({
    past: [],
    future: [],
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [fit, setFit] = useState(true);
  const [pps, setPps] = useState(20);
  const [durations, setDurations] = useState<Record<string, number>>({});

  // Follow the film when it changes elsewhere (Claude, the Sound tab), except in the middle of a drag.
  const saved = JSON.stringify({ tracks, video });
  useEffect(() => {
    if (drag.current) return;
    const lists = JSON.parse(saved) as { tracks: AudioTrack[]; video: VideoClip[] };
    setDraft(itemsOf(lists.tracks, lists.video));
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

  // A line or sound chosen in a side tab: its clip is selected and comes into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new ask (n) selects.
  useEffect(() => {
    if (!selectFile) return;
    const index = draft.findIndex((item) => item.file === selectFile.file);
    if (index < 0) return;
    setSelected(index);
    const item = draft[index];
    const scroll = scrollRef.current;
    if (item && scroll) {
      const x = item.start * pps;
      if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40) {
        scroll.scrollLeft = Math.max(0, x - 40);
      }
    }
  }, [selectFile?.n]);

  const lengthOf = useCallback(
    (item: Item) =>
      (item.kind === "sound"
        ? clipLength(item, durations[item.file])
        : videoLength(item, durations[item.file])) ?? PLACEHOLDER,
    [durations],
  );
  const sounds = draft.filter((item) => item.kind === "sound");
  const clipsOnly = draft.filter((item) => item.kind === "video");
  const lanes = laneCount(sounds);
  const videoLanes = laneCount(clipsOnly);
  const width = Math.max(duration * pps, 1);

  const save = (next: Item[]) => onChange(split(next));
  /** Saves a change, remembering the list before it (`before`) for Undo. */
  const commit = (next: Item[], before: Item[] = draft) => {
    setHistory((h) => ({ past: [...h.past.slice(-49), before], future: [] }));
    setDraft(next);
    save(next);
  };
  const undo = () => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [draft, ...history.future] });
    setDraft(previous);
    save(previous);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, draft], future: history.future.slice(1) });
    setDraft(next);
    save(next);
  };
  const remove = (index: number) => {
    setSelected(null);
    commit(draft.filter((_, i) => i !== index));
  };
  const change = (index: number, patch: Partial<AudioTrack> | Partial<VideoClip>) =>
    draft.map((item, i) => (i === index ? ({ ...item, ...patch } as Item) : item));

  /** A slider's changes show at once and are saved (one Undo step) when it is let go. */
  const slider = (
    index: number,
    read: (value: number) => Partial<AudioTrack> | Partial<VideoClip>,
  ): SliderProps => ({
    onPointerDown: () => {
      sliderBefore.current = draft;
    },
    onKeyDown: () => {
      sliderBefore.current ??= draft;
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(change(index, read(Number(event.target.value)))),
    onPointerUp: () => {
      commit(draft, sliderBefore.current ?? draft);
      sliderBefore.current = null;
    },
    onKeyUp: () => {
      commit(draft, sliderBefore.current ?? draft);
      sliderBefore.current = null;
    },
  });

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
  /** The sound lane under the pointer (one past the last: a new lane). */
  const laneAt = (clientY: number) => {
    const box = lanesRef.current?.getBoundingClientRect();
    return box ? Math.max(0, Math.min(lanes, Math.floor((clientY - box.top) / LANE_H))) : 0;
  };
  /** The video lane under the pointer: the top row makes a new one, the lowest lane is next to the film. */
  const videoLaneAt = (clientY: number) => {
    const box = videoLanesRef.current?.getBoundingClientRect();
    if (!box) return 0;
    const row = Math.floor((clientY - box.top) / LANE_H);
    return Math.max(0, Math.min(videoLanes, MAX_VIDEO_LANES - 1, videoLanes - row));
  };
  const inVideoArea = (clientY: number) => {
    const box = videoLanesRef.current?.getBoundingClientRect();
    return Boolean(box && clientY >= box.top && clientY < box.bottom);
  };
  /** What a moving edge can snap to: the playhead, scenes, the film's ends and other clips. */
  const targets = (except: number) => [
    0,
    duration,
    time,
    ...scenes.flatMap((scene) => [scene.start, ...(scene.end !== undefined ? [scene.end] : [])]),
    ...draft.flatMap((item, i) => (i === except ? [] : [item.start, item.start + lengthOf(item)])),
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
    // A picture has no end of file: it can be stretched to any length.
    const fileEnd =
      orig.kind === "video" && isPicture(orig.file) ? undefined : durations[orig.file];
    let next: Item;
    if (current.mode === "move") {
      const lane = orig.kind === "video" ? videoLaneAt(event.clientY) : laneAt(event.clientY);
      next = moveClip(orig, orig.start + dt, lane, length, near, pps);
    } else if (current.mode === "start") {
      next = trimStart(orig, orig.start + dt, length, near, pps);
      // A picture has no file time to trim: only its start moves.
      if (next.kind === "video" && isPicture(next.file)) next = { ...next, from: 0 };
    } else {
      next = trimEnd(orig, orig.start + length + dt, fileEnd, near, pps);
    }
    current.live = next;
    setDraft((list) => list.map((item, i) => (i === current.index ? next : item)));
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current || current.mode === "scrub") return;
    if (!current.moved) {
      // A click, not a drag: show the clip's line or sound in its tab.
      const item = draft[current.index];
      if (item) onClipClick?.(item.file, item.kind);
      return;
    }
    // The last position the pointer gave, not the last one drawn: a fast move can end before the screen
    // catches up.
    const { live, orig, index } = current;
    if (JSON.stringify(live) === JSON.stringify(orig)) return;
    const after = draft.map((item, i) => (i === index ? live : item));
    const before = draft.map((item, i) => (i === index ? orig : item));
    setDraft(after);
    // Save, with Undo going back to before the drag.
    setHistory((h) => ({ past: [...h.past.slice(-49), before], future: [] }));
    save(after);
  };

  // ---------- Drops: files land where they are dropped ----------

  const onDrop = (event: React.DragEvent) => {
    const files = [...event.dataTransfer.files];
    const sound = files.filter((file) => mediaKindOf(file.name) === "sound");
    const pictures = files.filter((file) => {
      const kind = mediaKindOf(file.name);
      return kind === "video" || kind === "image";
    });
    if (sound.length === 0 && pictures.length === 0) return; // fonts: the page asks what they are for
    event.preventDefault();
    event.stopPropagation();
    const at = round(timeAt(event.clientX));
    const overVideo = inVideoArea(event.clientY);
    if (sound.length) onAddSounds(sound, at, overVideo ? lanes : laneAt(event.clientY));
    if (pictures.length) {
      onAddClips(pictures, at, overVideo ? videoLaneAt(event.clientY) : undefined);
    }
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
  // Video lanes from the top: the highest first, the lowest next to the film.
  const videoLaneIds = Array.from({ length: videoLanes }, (_, i) => videoLanes - 1 - i);
  const selectedItem = selected !== null ? draft[selected] : undefined;
  // A key that stays the same while a clip moves: its kind, file and which copy of that file it is.
  const seen: Record<string, number> = {};
  const clips = draft.map((item, index) => {
    const id = `${item.kind}:${item.file}`;
    seen[id] = (seen[id] ?? 0) + 1;
    return { item, index, key: `${id}#${seen[id]}` };
  });
  /** A lane holding only spoken lines (files in voice/). */
  const isVoiceLane = (lane: number) => {
    const inLane = sounds.filter((track) => track.lane === lane);
    return inLane.length > 0 && inLane.every((track) => track.file.startsWith("voice/"));
  };
  /** The Effects lane: sound effects only. */
  const isEffectsLane = (lane: number) => {
    const inLane = sounds.filter((track) => track.lane === lane);
    return inLane.length > 0 && inLane.every((track) => track.sfx);
  };
  const laneKind = (lane: number) =>
    isVoiceLane(lane) ? " lane-voice" : isEffectsLane(lane) ? " lane-fx" : "";
  const laneName = (lane: number) =>
    isVoiceLane(lane) ? "Voice" : isEffectsLane(lane) ? "Effects" : `Sound ${lane + 1}`;
  const laneMuted = (lane: number) => {
    const inLane = sounds.filter((track) => track.lane === lane);
    return inLane.length > 0 && inLane.every((track) => track.muted);
  };

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-bar">
        <span className="timeline-title">Timeline</span>
        <div className="timeline-tools">
          {onAddEffect && <EffectsMenu onPick={(sound) => onAddEffect(sound, time)} />}
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
          {videoLanes < MAX_VIDEO_LANES && (
            <div className="timeline-head timeline-head-new" style={{ height: LANE_H }}>
              + Video
            </div>
          )}
          {videoLaneIds.map((lane) => (
            <div key={lane} className="timeline-head lane-video" style={{ height: LANE_H }}>
              <span>Video {lane + 1}</span>
            </div>
          ))}
          <div className="timeline-head timeline-head-film" style={{ height: FILM_H }}>
            Film
          </div>
          {laneIds.map((lane) => (
            <div
              key={lane}
              className={`timeline-head lane-c${lane % 4}${laneKind(lane)}`}
              style={{ height: LANE_H }}
            >
              <span>{laneName(lane)}</span>
              <button
                type="button"
                className="timeline-mute"
                aria-pressed={laneMuted(lane)}
                aria-label={laneMuted(lane) ? "Sound back on" : "Mute this track"}
                data-tip={laneMuted(lane) ? "Sound back on" : "Mute"}
                onClick={() => {
                  const mute = !laneMuted(lane);
                  commit(
                    draft.map((item) =>
                      item.kind === "sound" && item.lane === lane ? { ...item, muted: mute } : item,
                    ),
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
            <div ref={videoLanesRef}>
              {videoLanes < MAX_VIDEO_LANES && (
                <div
                  className="timeline-lane timeline-new"
                  style={{ height: LANE_H }}
                  onPointerDown={startScrub}
                >
                  <span className="timeline-new-text">Drop a video or a picture here</span>
                </div>
              )}
              {videoLaneIds.map((lane) => (
                <div
                  key={lane}
                  className="timeline-lane timeline-video lane-video"
                  style={{ height: LANE_H }}
                  onPointerDown={startScrub}
                >
                  {clips
                    .filter(({ item }) => item.kind === "video" && item.lane === lane)
                    .map(({ item, index, key }) =>
                      item.kind === "video" ? (
                        <VideoClipView
                          key={key}
                          clip={item}
                          url={fileUrl(item.file)}
                          pps={pps}
                          length={lengthOf(item)}
                          selected={selected === index}
                          onDuration={(d) =>
                            setDurations((all) =>
                              all[item.file] === d ? all : { ...all, [item.file]: d },
                            )
                          }
                          onPointerDown={(event, mode) => startClip(event, index, mode)}
                        />
                      ) : null,
                    )}
                </div>
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
                  className={`timeline-lane timeline-sound lane-c${lane % 4}${laneKind(lane)}`}
                  data-muted={laneMuted(lane) ? "true" : undefined}
                  style={{ height: LANE_H }}
                  onPointerDown={startScrub}
                >
                  {clips
                    .filter(({ item }) => item.kind === "sound" && item.lane === lane)
                    .map(({ item, index, key }) =>
                      item.kind === "sound" ? (
                        <Clip
                          key={key}
                          track={item}
                          url={soundUrl(item.file)}
                          pps={pps}
                          length={lengthOf(item)}
                          selected={selected === index}
                          stale={stale?.has(item.file) ?? false}
                          words={words?.[item.file]?.words}
                          onDuration={(d) =>
                            setDurations((all) =>
                              all[item.file] === d ? all : { ...all, [item.file]: d },
                            )
                          }
                          onPointerDown={(event, mode) => startClip(event, index, mode)}
                        />
                      ) : null,
                    )}
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

      {selectedItem && selected !== null && (
        <div className="timeline-clipbar">
          <span className="timeline-clipname">{fileName(selectedItem.file)}</span>
          <span className="hint">
            {selectedItem.start.toFixed(2)} s →{" "}
            {(selectedItem.start + lengthOf(selectedItem)).toFixed(2)} s
          </span>
          {selectedItem.kind === "video" && (
            <VideoSettings
              clip={selectedItem}
              filmSize={filmSize}
              slider={(read) => slider(selected, read)}
              onChange={(patch) => commit(change(selected, patch))}
            />
          )}
          {(selectedItem.kind === "sound" || !isPicture(selectedItem.file)) && (
            <>
              <label className="timeline-volume">
                <span className="field-label">
                  {selectedItem.kind === "video" ? "Sound" : "Volume"}
                </span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={selectedItem.volume}
                  {...slider(selected, (volume) => ({ volume }))}
                />
                <span className="sound-volume-value">{Math.round(selectedItem.volume * 100)}%</span>
              </label>
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="mute"
                tip={selectedItem.muted ? "Sound back on" : "Mute"}
                aria-label="Mute"
                aria-pressed={selectedItem.muted}
                onClick={() => commit(change(selected, { muted: !selectedItem.muted }))}
              />
            </>
          )}
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="target"
            tip="Start at the playhead"
            onClick={() => commit(change(selected, { start: round(time) }))}
          />
          {selectedItem.kind === "sound" &&
            onGetWords &&
            (words?.[selectedItem.file] ? (
              <span className="hint">{words[selectedItem.file]?.words.length} words</span>
            ) : (
              <PixelButton
                variant="ghost"
                data-size="small"
                disabled={Boolean(wordsBusy)}
                tip="When each word is said (uses credits)"
                onClick={() => onGetWords(selectedItem.file)}
              >
                {wordsBusy === selectedItem.file ? "Listening…" : "Get words"}
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

/** Settings of a video clip: fill or fit, size, place, see-through and fades. */
function VideoSettings({
  clip,
  filmSize,
  slider,
  onChange,
}: {
  clip: VideoClip;
  filmSize: { width: number; height: number };
  slider: (read: (value: number) => Partial<VideoClip>) => SliderProps;
  onChange: (patch: Partial<VideoClip>) => void;
}) {
  const { width, height } = filmSize;
  const place = placeOf(clip, width, height);
  // A clip in a corner stays in its corner when its size changes.
  const resize = (size: number) => ({
    size,
    ...(place ? placeAt(place, size, width, height) : {}),
  });
  return (
    <>
      <div className="tool-group">
        <PixelButton
          variant="ghost"
          data-size="small"
          aria-pressed={clip.fit === "fill"}
          tip="Fill its box (cropped)"
          onClick={() => onChange({ fit: "fill" })}
        >
          Fill
        </PixelButton>
        <PixelButton
          variant="ghost"
          data-size="small"
          aria-pressed={clip.fit === "fit"}
          tip="Show it whole"
          onClick={() => onChange({ fit: "fit" })}
        >
          Fit
        </PixelButton>
      </div>
      <label className="timeline-volume">
        <span className="field-label">Size</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={clip.size}
          {...slider((size) => resize(size))}
        />
        <span className="sound-volume-value">{Math.round(clip.size * 100)}%</span>
      </label>
      <label className="timeline-volume">
        <span className="field-label">Place</span>
        <select
          className="px-input timeline-select"
          value={place ?? ""}
          onChange={(event) =>
            onChange(placeAt(event.target.value as ClipPlace, clip.size, width, height))
          }
        >
          {!place && <option value="">Custom</option>}
          {CLIP_PLACES.map((entry) => (
            <option key={entry} value={entry}>
              {PLACE_WORDS[entry]}
            </option>
          ))}
        </select>
      </label>
      <label className="timeline-volume">
        <span className="field-label">See-through</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={1 - clip.opacity}
          {...slider((clear) => ({ opacity: Math.round((1 - clear) * 100) / 100 }))}
        />
        <span className="sound-volume-value">{Math.round((1 - clip.opacity) * 100)}%</span>
      </label>
      <label className="timeline-volume">
        <span className="field-label">Fade</span>
        <select
          className="px-input timeline-select"
          value={clip.fade}
          onChange={(event) => onChange({ fade: Number(event.target.value) })}
        >
          {[...new Set([...FADES, clip.fade])]
            .sort((a, b) => a - b)
            .map((fade) => (
              <option key={fade} value={fade}>
                {fade === 0 ? "None" : `${fade} s`}
              </option>
            ))}
        </select>
      </label>
    </>
  );
}

/** One video clip: its first frame (or the picture), its name, and edges to trim. */
function VideoClipView({
  clip,
  url,
  pps,
  length,
  selected,
  onDuration,
  onPointerDown,
}: {
  clip: VideoClip;
  url: string;
  pps: number;
  length: number;
  selected: boolean;
  onDuration: (duration: number) => void;
  onPointerDown: (event: ReactPointerEvent, mode: "move" | "start" | "end") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const picture = isPicture(clip.file);
  const width = Math.max(4, length * pps);

  // A video: its length, and its frame at the clip's start drawn small (pictures show as they are).
  useEffect(() => {
    if (picture) return;
    const element = document.createElement("video");
    element.muted = true;
    element.preload = "auto";
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration)) onDuration(element.duration);
      element.currentTime = Math.min(clip.from + 0.05, Math.max(0, element.duration - 0.05));
    };
    element.onseeked = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !element.videoWidth) return;
      const scale = Math.max(
        canvas.width / element.videoWidth,
        canvas.height / element.videoHeight,
      );
      const w = element.videoWidth * scale;
      const h = element.videoHeight * scale;
      ctx.drawImage(element, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    element.src = url;
    return () => {
      element.removeAttribute("src");
      element.load();
    };
  }, [url, picture, clip.from, onDuration]);

  return (
    <div
      className="timeline-clip timeline-clip-video"
      data-selected={selected ? "true" : undefined}
      style={{ left: clip.start * pps, width }}
      title={`${fileName(clip.file)}: drag to move, drag an edge to trim`}
      onPointerDown={(event) => onPointerDown(event, "move")}
    >
      {picture ? (
        <img className="timeline-thumb" src={url} alt="" draggable={false} />
      ) : (
        <canvas ref={canvasRef} className="timeline-thumb" width={64} height={36} />
      )}
      <span className="timeline-clip-name">{fileName(clip.file)}</span>
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
