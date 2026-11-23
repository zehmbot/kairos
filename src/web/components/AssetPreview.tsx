import { useEffect, useRef, useState } from "react";
import type { Asset } from "../../shared/types.ts";
import { assetFileUrl } from "../api.ts";
import { formatLength } from "../player/time.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";

/** A font from the library, loaded once under its own family name, for the "Aa" sample. */
function useAssetFont(asset: Asset): string | null {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    if (asset.kind !== "font") return;
    const name = `kairos-asset-${asset.id.replace(/[^a-z0-9]/gi, "-")}`;
    const face = new FontFace(name, `url(${assetFileUrl(asset.id)})`);
    let cancelled = false;
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        if (!cancelled) setFamily(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset]);
  return family;
}

/** `m:ss`. */
function minutesOf(seconds: number): string {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** How long it lasts ("0.9 s"), and while it plays, where it is ("0.4 / 0.9 s", "1:05 / 3:20"). */
function clockOf(at: number, length: number, playing: boolean): string {
  if (!playing) return formatLength(length);
  return length < 60
    ? `${at.toFixed(1)} / ${formatLength(length)}`
    : `${minutesOf(at)} / ${minutesOf(length)}`;
}

/** The sound or video playing in the library now: starting another one stops it. */
let playingNow: HTMLMediaElement | null = null;

/** Play and pause with a pixel button, and where it is, for a sound or video of the library. */
function useMediaPlay<T extends HTMLMediaElement>() {
  const ref = useRef<T>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, length: 0 });
  useEffect(() => {
    const media = ref.current;
    return () => {
      if (media && playingNow === media) playingNow = null;
      media?.pause();
    };
  }, []);
  const toggle = () => {
    const media = ref.current;
    if (!media) return;
    if (!media.paused) {
      media.pause();
      return;
    }
    if (playingNow && playingNow !== media) playingNow.pause();
    playingNow = media;
    if (media.ended) media.currentTime = 0;
    void media.play().catch(() => setPlaying(false));
  };
  const events = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (event: { currentTarget: HTMLMediaElement }) =>
      setTime({
        at: event.currentTarget.currentTime,
        length: event.currentTarget.duration || 0,
      }),
    onLoadedMetadata: (event: { currentTarget: HTMLMediaElement }) => {
      // Read now: React clears the event's element once the handler returns.
      const length = event.currentTarget.duration || 0;
      setTime((now) => ({ ...now, length }));
    },
  };
  const button = (name: string) => (
    <PixelButton
      className="asset-play"
      variant="ghost"
      icon={playing ? "pause" : "play"}
      aria-label={`${playing ? "Pause" : "Play"} ${name}`}
      tip={playing ? "Pause" : "Play"}
      onClick={toggle}
    />
  );
  const clock = time.length > 0 ? clockOf(time.at, time.length, playing) : null;
  return { ref, events, button, clock };
}

function SoundPreview({ asset, url }: { asset: Asset; url: string }) {
  const { ref, events, button, clock } = useMediaPlay<HTMLAudioElement>();
  return (
    <span className="asset-sound">
      <PixelIcon name="sound" size={32} />
      <span className="asset-play-row">
        {button(asset.name)}
        {clock && <span className="asset-clock">{clock}</span>}
      </span>
      <audio ref={ref} src={url} preload="metadata" {...events} />
    </span>
  );
}

function VideoPreview({ asset, url }: { asset: Asset; url: string }) {
  const { ref, events, button } = useMediaPlay<HTMLVideoElement>();
  return (
    <span className="asset-video">
      {/* "#t=0.5" shows a frame instead of a black first frame. */}
      <video
        ref={ref}
        className="asset-media"
        src={`${url}#t=0.5`}
        preload="metadata"
        playsInline
        {...events}
      />
      {button(asset.name)}
    </span>
  );
}

/** What an asset looks like: the picture, the video with a Play button, a sound's Play button, or "Aa" in the font. */
export function AssetPreview({ asset, small = false }: { asset: Asset; small?: boolean }) {
  const font = useAssetFont(asset);
  const url = assetFileUrl(asset.id);
  switch (asset.kind) {
    case "image":
      return <img className="asset-media" src={url} alt="" loading="lazy" />;
    case "video":
      return small ? (
        <video className="asset-media" src={`${url}#t=0.5`} preload="metadata" muted />
      ) : (
        <VideoPreview asset={asset} url={url} />
      );
    case "sound":
      return small ? (
        <PixelIcon name="sound" size={32} />
      ) : (
        <SoundPreview asset={asset} url={url} />
      );
    case "font":
      return (
        <span className="asset-font" style={font ? { fontFamily: font } : undefined}>
          Aa
        </span>
      );
  }
}
