import { useEffect, useRef, useState } from "react";

/** Plays one sound at a time (a voice's sample, a line): pressing the playing one again stops it. */
export function useSample() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = (key: string, url: string) => {
    audio.current?.pause();
    if (playing === key) {
      setPlaying(null);
      return;
    }
    const next = new Audio(url);
    next.onended = () => setPlaying(null);
    void next.play().catch(() => setPlaying(null));
    audio.current = next;
    setPlaying(key);
  };
  return { playing, toggle };
}
