import {
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { formatTimecode, frameAt, sceneAt, timeOf } from "../player/time.ts";
import { useFilmPlayer } from "../player/useFilmPlayer.ts";
import { Notice } from "./Notice.tsx";
import { PixelButton } from "./PixelButton.tsx";

interface PlayerProps {
  /** Full address of the film page on the film server. */
  src: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** Changes whenever the film's files change, to reload the page. */
  reloadKey: number;
  /** Drawn over the film, at the film's scaled size (note marks). Gets the current frame. */
  overlay?: (frame: number) => ReactNode;
  /** Notes to show on the scrub bar: a marker for one frame, a bar for a range. */
  noteMarks?: readonly { id: string; t: number; until: number | null }[];
  ref?: Ref<PlayerHandle>;
}

/** Lets the film page drive the player (jump to a note, pause to add one). */
export interface PlayerHandle {
  /** Time of the frame showing now, in seconds. */
  time(): number;
  seekTime(t: number): void;
  pause(): void;
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Keeps focus where it was when a control is clicked, so Space keeps meaning play/pause. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

export function Player({
  src,
  title,
  width,
  height,
  fps,
  duration,
  reloadKey,
  overlay,
  noteMarks = [],
  ref,
}: PlayerProps) {
  const player = useFilmPlayer({ src, fps, duration });
  const { frame, total, toggle, step, seek, pause, currentFrame } = player;
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);

  // The page is built at the film's real size and scaled down to fit the stage.
  const scale = stage ? Math.min(stage.width / width, stage.height / height) : 0;
  const t = timeOf(frame, fps);
  const scene = sceneAt(player.scenes, t);
  const progress = total > 1 ? frame / (total - 1) : 0;
  const markerAt = (start: number) => (total > 1 ? frameAt(start, fps, total) / (total - 1) : 0);

  useImperativeHandle(
    ref,
    () => ({
      time: () => timeOf(currentFrame(), fps),
      seekTime: (time) => {
        pause();
        seek(frameAt(time, fps, total));
      },
      pause,
    }),
    [currentFrame, fps, pause, seek, total],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const onScrubber = target instanceof HTMLInputElement && target.type === "range";
      if (!onScrubber && target?.closest("input, textarea, select, dialog, [contenteditable]"))
        return;
      if (event.key === " " && target?.closest("button, a")) return;

      const jump = event.shiftKey ? Math.round(fps) : 1;
      switch (event.key) {
        case " ":
          toggle();
          break;
        case "ArrowLeft":
          step(-jump);
          break;
        case "ArrowRight":
          step(jump);
          break;
        case "Home":
          seek(0);
          break;
        case "End":
          seek(total - 1);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fps, total, toggle, step, seek]);

  return (
    <div className="player">
      {/* The stage takes the film's shape; CSS caps its height so the controls stay in view. */}
      <div className="stage" ref={stageRef} style={{ aspectRatio: `${width} / ${height}` }}>
        <div className="stage-frame" style={{ width: width * scale, height: height * scale }}>
          <iframe
            key={reloadKey}
            ref={player.iframeRef}
            src={src}
            title={`Preview of ${title}`}
            sandbox="allow-scripts allow-same-origin"
            width={width}
            height={height}
            tabIndex={-1}
            style={{ transform: `scale(${scale})` }}
            onLoad={player.onLoad}
          />
          {overlay?.(frame)}
        </div>
        {player.loading && !player.error && <span className="px-tag stage-tag">Loading</span>}
        {player.error && (
          <div className="stage-notice">
            <Notice title="The film hit a problem">
              <p className="notice-code">{player.error}</p>
              <p>Fix the film and the preview reloads by itself.</p>
            </Notice>
          </div>
        )}
      </div>

      <div className="scrub">
        <div className="scrub-track">
          <div className="scrub-fill" style={{ width: `${progress * 100}%` }} />
          {player.scenes.map((s) => (
            <span
              key={`${s.name}@${s.start}`}
              className="scrub-marker"
              style={{ left: `${markerAt(s.start) * 100}%` }}
            />
          ))}
          {noteMarks.map((note) =>
            note.until === null ? (
              <span
                key={note.id}
                className="scrub-note"
                style={{ left: `${markerAt(note.t) * 100}%` }}
              />
            ) : (
              <span
                key={note.id}
                className="scrub-note-range"
                style={{
                  left: `${markerAt(note.t) * 100}%`,
                  width: `${(markerAt(note.until) - markerAt(note.t)) * 100}%`,
                }}
              />
            ),
          )}
        </div>
        <input
          type="range"
          className="scrub-input"
          min={0}
          max={total - 1}
          step={1}
          value={frame}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Position"
          aria-valuetext={`${formatTimecode(t)}, frame ${frame + 1} of ${total}`}
        />
      </div>

      <div className="controls">
        <div className="controls-buttons">
          <PixelButton
            variant="ghost"
            icon="toStart"
            aria-label="Go to start"
            title="Go to start (Home)"
            onMouseDown={keepFocus}
            onClick={() => seek(0)}
          />
          <PixelButton
            variant="ghost"
            icon="stepBack"
            aria-label="Previous frame"
            title="Previous frame (Left arrow)"
            onMouseDown={keepFocus}
            onClick={() => step(-1)}
          />
          <PixelButton
            icon={player.playing ? "pause" : "play"}
            aria-label={player.playing ? "Pause" : "Play"}
            title="Play / pause (Space)"
            onMouseDown={keepFocus}
            onClick={toggle}
          />
          <PixelButton
            variant="ghost"
            icon="stepForward"
            aria-label="Next frame"
            title="Next frame (Right arrow)"
            onMouseDown={keepFocus}
            onClick={() => step(1)}
          />
          <PixelButton
            variant="ghost"
            icon="toEnd"
            aria-label="Go to end"
            title="Go to end (End)"
            onMouseDown={keepFocus}
            onClick={() => seek(total - 1)}
          />
        </div>
        <output className="timecode">
          {formatTimecode(t)}
          <span className="timecode-total"> / {formatTimecode(duration)}</span>
        </output>
        <span className="frame-count">
          f {frame + 1} / {total}
        </span>
        {scene && <span className="px-tag">{scene.name}</span>}
      </div>
    </div>
  );
}
