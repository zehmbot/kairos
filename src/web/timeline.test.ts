import { describe, expect, it } from "vitest";
import type { AudioTrack } from "../shared/types.ts";
import {
  clipLength,
  fitZoom,
  laneCount,
  moveClip,
  snapTime,
  tickLabel,
  tickStep,
  trimEnd,
  trimStart,
  withLanes,
} from "./timeline.ts";

const track = (extra: Partial<AudioTrack> = {}): AudioTrack => ({
  file: "audio/a.mp3",
  start: 2,
  volume: 1,
  from: 0,
  muted: false,
  ...extra,
});

describe("timeline", () => {
  it("knows how long a clip plays", () => {
    expect(clipLength(track(), 10)).toBe(10);
    expect(clipLength(track({ from: 4 }), 10)).toBe(6);
    expect(clipLength(track({ length: 3 }), 10)).toBe(3);
    expect(clipLength(track())).toBeNull(); // the file isn't read yet
  });

  it("gives every sound a lane and counts them", () => {
    const tracks = [track(), track({ lane: 3 }), track()];
    expect(withLanes(tracks).map((t) => t.lane)).toEqual([0, 3, 2]);
    expect(laneCount(tracks)).toBe(4);
    expect(laneCount([])).toBe(0);
  });

  it("snaps to the nearest target within 8 pixels", () => {
    // 100 px per second: 8 px is 0.08 s.
    expect(snapTime(5.05, [5, 7], 100)).toBe(5);
    expect(snapTime(5.1, [5, 7], 100)).toBe(5.1);
    expect(snapTime(6.95, [5, 7], 100)).toBe(7);
  });

  it("moves a clip: snaps its start or its end, never before 0", () => {
    expect(moveClip(track(), 4.03, 1, 3, [4], 100)).toMatchObject({ start: 4, lane: 1 });
    // The end (2.97 + 3 = 5.97) snaps to 6.
    expect(moveClip(track(), 2.97, 0, 3, [6], 100)).toMatchObject({ start: 3 });
    expect(moveClip(track(), -2, 0, 3, [], 100)).toMatchObject({ start: 0 });
    expect(moveClip(track(), 3.456, 40, 3, [], 100)).toMatchObject({ start: 3.46, lane: 31 });
  });

  it("trims the start: later in the file, the end stays put", () => {
    // Clip at 2 s, 5 s long: its end is at 7 s.
    expect(trimStart(track(), 3, 5, [], 100)).toEqual(track({ start: 3, from: 1, length: 4 }));
    // Can't go before the file's start (the clip already starts at the file's start).
    expect(trimStart(track(), 1, 5, [], 100)).toEqual(track({ start: 2, from: 0, length: 5 }));
    // A trimmed clip can grow back toward the file's start.
    expect(trimStart(track({ start: 3, from: 1, length: 4 }), 2.5, 4, [], 100)).toEqual(
      track({ start: 2.5, from: 0.5, length: 4.5 }),
    );
    // Never shorter than 0.1 s.
    expect(trimStart(track(), 9, 5, [], 100)).toMatchObject({ start: 6.9, length: 0.1 });
  });

  it("trims the end: never past the file's end or under 0.1 s", () => {
    expect(trimEnd(track(), 5, 10, [], 100)).toMatchObject({ length: 3 });
    expect(trimEnd(track({ from: 4 }), 20, 10, [], 100)).toMatchObject({ length: 6 });
    expect(trimEnd(track(), 1, 10, [], 100)).toMatchObject({ length: 0.1 });
    expect(trimEnd(track(), 5.04, 10, [5], 100)).toMatchObject({ length: 3 });
  });

  it("fits the film and picks readable ruler ticks", () => {
    expect(fitZoom(680, 34)).toBe(20);
    expect(tickStep(20)).toBe(5);
    expect(tickStep(300)).toBe(0.25);
    expect(tickLabel(65, 5)).toBe("1:05");
    expect(tickLabel(2.5, 0.5)).toBe("0:02.5");
    expect(tickLabel(0.25, 0.25)).toBe("0:00.25");
  });
});
