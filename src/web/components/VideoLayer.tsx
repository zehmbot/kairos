import { useEffect, useRef, useState } from "react";
import {
  clipBox,
  clipLength,
  clipOpacity,
  clipTime,
  drawOrder,
  isPicture,
} from "../../shared/clips.ts";
import type { VideoClip } from "../../shared/types.ts";
import { DRIFT_LIMIT, needsSeek } from "../player/audioSync.ts";

/** A clip as the preview shows it: with the address of its file on the film server. */
export type PreviewClip = VideoClip & { url: string };

interface VideoLayerProps {
  clips: readonly PreviewClip[];
  /** The film's size in pixels, and how much the stage shrinks it. */
  width: number;
  height: number;
  scale: number;
  /** The time of the frame showing, in seconds. */
  t: number;
  playing: boolean;
  /** The player's clock right now (between frames too). */
  now: () => number;
}

/**
 * The film's video clips over the preview, placed like the render places them (src/shared/clips.ts). Videos are
 * muted (their sound plays with the film's sound) and follow the player's clock.
 */
export function VideoLayer({ clips, width, height, scale, t, playing, now }: VideoLayerProps) {
  if (clips.length === 0) return null;
  // A key that stays the same when a clip changes: its file and which copy of that file it is.
  const seen: Record<string, number> = {};
  const keyed = clips.map((clip) => {
    seen[clip.file] = (seen[clip.file] ?? 0) + 1;
    return { ...clip, key: `${clip.file}#${seen[clip.file]}` };
  });
  return (
    <div className="video-layer" style={{ width: width * scale, height: height * scale }}>
      {drawOrder(keyed).map(({ key, ...clip }) => (
        <ClipElement
          key={key}
          clip={clip}
          width={width}
          height={height}
          scale={scale}
          t={t}
          playing={playing}
          now={now}
        />
      ))}
    </div>
  );
}

function ClipElement({
  clip,
  width,
  height,
  scale,
  t,
  playing,
  now,
}: Omit<VideoLayerProps, "clips"> & { clip: PreviewClip }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fileDuration, setFileDuration] = useState<number | undefined>(undefined);
  const picture = isPicture(clip.file);
  const length = clipLength(clip, fileDuration);
  const time = clipTime(clip, t, length);
  const shown = time !== null;
  const box = clipBox(clip, width, height);

  // Keep the video in step: playing with the player (moved back when it drifts), or on the exact frame when
  // paused or scrubbing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || picture) return;
    if (!shown || time === null) {
      if (!video.paused) video.pause();
      return;
    }
    if (playing) {
      const expected = clipTime(clip, now(), length) ?? time;
      if (needsSeek(video.currentTime, expected, DRIFT_LIMIT * 2)) video.currentTime = expected;
      if (video.paused) void video.play().catch(() => undefined);
    } else {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - time) > 1 / 120) video.currentTime = time;
    }
  }, [time, shown, playing, picture, clip, now, length]);

  const style = {
    left: box.left * scale,
    top: box.top * scale,
    width: box.width * scale,
    height: box.height * scale,
    objectFit: clip.fit === "fill" ? ("cover" as const) : ("contain" as const),
    opacity: clipOpacity(clip, t, length),
    visibility: shown ? ("visible" as const) : ("hidden" as const),
  };

  return picture ? (
    <img className="video-clip" src={clip.url} alt="" style={style} draggable={false} />
  ) : (
    <video
      ref={videoRef}
      className="video-clip"
      src={clip.url}
      style={style}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={(event) => {
        const duration = event.currentTarget.duration;
        if (Number.isFinite(duration)) setFileDuration(duration);
      }}
    />
  );
}
