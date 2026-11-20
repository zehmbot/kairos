import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilmMessageSchema,
  type FilmScene,
  type PlayerMessage,
} from "../../shared/film-protocol.ts";
import { clampFrame, frameCount, timeOf } from "./time.ts";

interface FilmPlayerOptions {
  /** Full address of the film page on the film server. */
  src: string;
  fps: number;
  duration: number;
}

/**
 * Drives a film page in an iframe through the Kairos bridge.
 *
 * The player owns the clock: it asks the film for one frame at a time (`seek`) and waits for the
 * answer before asking for the next one, so a slow film drops frames instead of falling behind.
 * Each time the iframe (re)loads, it says hello again and picks up on the same frame.
 */
export function useFilmPlayer({ src, fps, duration }: FilmPlayerOptions) {
  const total = frameCount(duration, fps);
  const origin = useMemo(() => new URL(src, window.location.href).origin, [src]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<FilmScene[]>([]);
  // How long the film's story lasts, when the film says (Blocky times itself to its voices).
  const [length, setLength] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);

  // Values the message handler and the play loop read right away, without waiting for a render.
  const live = useRef({
    ready: false,
    inflight: false,
    pending: null as number | null,
    frame: 0,
    nextId: 1,
    fps,
    total,
    clockStart: 0,
    clockFrame: 0,
  });

  useEffect(() => {
    live.current.fps = fps;
    live.current.total = total;
  }, [fps, total]);

  const post = useCallback(
    (message: PlayerMessage) => iframeRef.current?.contentWindow?.postMessage(message, origin),
    [origin],
  );

  /** Asks the film to draw frame `f`, or keeps it for later if the film is busy or still loading. */
  const requestFrame = useCallback(
    (f: number) => {
      const s = live.current;
      if (!s.ready || s.inflight) {
        s.pending = f;
        return;
      }
      s.pending = null;
      s.inflight = true;
      post({ kairos: 1, type: "seek", id: s.nextId++, t: timeOf(f, s.fps) });
    },
    [post],
  );

  /** Jumps to frame `f`. While playing, playback continues from there. */
  const seek = useCallback(
    (f: number) => {
      const s = live.current;
      const next = clampFrame(f, s.total);
      s.frame = next;
      s.clockStart = performance.now();
      s.clockFrame = next;
      setFrame(next);
      requestFrame(next);
    },
    [requestFrame],
  );

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      seek(live.current.frame + delta);
    },
    [seek],
  );

  const toggle = useCallback(() => setPlaying((value) => !value), []);
  const pause = useCallback(() => setPlaying(false), []);
  /** The frame showing right now (also between renders). */
  const currentFrame = useCallback(() => live.current.frame, []);

  /** The iframe finished loading a (new) page: forget the old one and say hello. */
  const onLoad = useCallback(() => {
    const s = live.current;
    s.ready = false;
    s.inflight = false;
    s.pending = s.frame;
    setLoading(true);
    setPageError(null);
    setFrameError(null);
    post({ kairos: 1, type: "hello" });
  }, [post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframeRef.current?.contentWindow) return;
      const parsed = FilmMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      const s = live.current;

      if (message.type === "ready") {
        s.ready = true;
        s.inflight = false;
        setLoading(false);
        setScenes(message.scenes);
        setLength(message.length ?? null);
        requestFrame(s.pending ?? s.frame);
      } else if (message.type === "frame") {
        s.inflight = false;
        setFrameError(message.error ?? null);
        if (s.pending !== null) requestFrame(s.pending);
      } else {
        const line = message.line ? `:${message.line}` : "";
        const where = message.source ? ` (${message.source}${line})` : "";
        setPageError(`${message.message}${where}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, requestFrame]);

  // The play loop: works out which frame is due and asks for it. Playback loops at the end.
  useEffect(() => {
    if (!playing) return;
    const s = live.current;
    s.clockStart = performance.now();
    s.clockFrame = s.frame;
    let handle = 0;
    const tick = (now: number) => {
      const elapsed = Math.max(0, Math.floor(((now - s.clockStart) / 1000) * s.fps));
      const next = (s.clockFrame + elapsed) % s.total;
      if (next !== s.frame) {
        s.frame = next;
        setFrame(next);
        requestFrame(next);
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, requestFrame]);

  // The film got shorter (kairos.json changed): stay inside it.
  useEffect(() => {
    if (live.current.frame >= total) seek(total - 1);
  }, [total, seek]);

  return {
    iframeRef,
    onLoad,
    frame,
    total,
    playing,
    loading,
    scenes,
    length,
    error: pageError ?? frameError,
    toggle,
    pause,
    seek,
    step,
    currentFrame,
  };
}
