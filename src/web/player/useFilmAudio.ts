import { useCallback, useEffect, useState } from "react";
import { duckGain } from "../../shared/duck.ts";
import { elementVolume, needsSeek, type PreviewTrack, trackPosition } from "./audioSync.ts";

const SETTINGS_KEY = "kairos.sound";
const CHECK_EVERY_MS = 50;

interface SoundSettings {
  /** 0 to 1, for every film. */
  volume: number;
  muted: boolean;
}

function loadSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (saved && typeof saved.volume === "number" && typeof saved.muted === "boolean") return saved;
  } catch {
    // Storage can be blocked or broken: use the defaults.
  }
  return { volume: 1, muted: false };
}

/** The preview's sound on/off and volume, remembered in this browser. */
export function useSoundSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const update = useCallback((change: Partial<SoundSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...change };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, but still applied.
      }
      return next;
    });
  }, []);
  return { ...settings, update };
}

/**
 * Plays the film's sound tracks in step with the preview: they follow play and pause, jump with seeks,
 * start when the clock reaches their `start`, and are nudged back when they drift.
 */
export function useFilmAudio(
  tracks: readonly PreviewTrack[],
  playing: boolean,
  /** Time of the frame showing now, in seconds. */
  time: () => number,
  settings: SoundSettings,
): void {
  const key = JSON.stringify(tracks);
  const [audios, setAudios] = useState<{ element: HTMLAudioElement; track: PreviewTrack }[]>([]);

  // One <audio> element per track, made again when the tracks change.
  useEffect(() => {
    const list = (JSON.parse(key) as PreviewTrack[]).map((track) => {
      const element = new Audio(track.url);
      element.preload = "auto";
      return { element, track };
    });
    setAudios(list);
    return () => {
      for (const { element } of list) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    };
  }, [key]);

  useEffect(() => {
    for (const { element, track } of audios) {
      element.volume = elementVolume(track.volume, settings.volume, settings.muted);
    }
  }, [settings.volume, settings.muted, audios]);

  const sync = useCallback(
    (force: boolean) => {
      const t = time();
      for (const { element, track } of audios) {
        const position = track.muted
          ? null
          : trackPosition(track.start, t, element.duration, track.from, track.length, track.loop);
        // Music under the narration follows the voices.
        if (track.duck) {
          element.volume = elementVolume(
            track.volume * duckGain(track.duck, t),
            settings.volume,
            settings.muted,
          );
        }
        if (!playing || position === null) {
          if (!element.paused) element.pause();
          continue;
        }
        if (force || needsSeek(element.currentTime, position)) element.currentTime = position;
        if (element.paused) void element.play().catch(() => undefined);
      }
    },
    [playing, time, audios, settings.volume, settings.muted],
  );

  // Start or stop with the player, then check every 50 ms: a track starts at most 50 ms late, which is
  // under the drift limit, so its first moment (a word, a beat) is never skipped. Seeks and drift too.
  useEffect(() => {
    sync(true);
    if (!playing) return;
    const timer = setInterval(() => sync(false), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [playing, sync]);
}
