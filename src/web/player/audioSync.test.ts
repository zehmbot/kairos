import { describe, expect, it } from "vitest";
import { elementVolume, filmFileUrl, needsSeek, trackPosition } from "./audioSync.ts";

describe("sound in the preview", () => {
  it("knows where each track should be", () => {
    expect(trackPosition(0, 2.5)).toBe(2.5);
    expect(trackPosition(1.2, 3)).toBeCloseTo(1.8);
    expect(trackPosition(1.2, 1)).toBeNull(); // not started yet
    expect(trackPosition(0, 12, 10)).toBeNull(); // the file already ended
    expect(trackPosition(0, 4, Number.NaN)).toBe(4); // length not known yet
  });

  it("only moves a track when it drifted too far", () => {
    expect(needsSeek(2.0, 2.05)).toBe(false);
    expect(needsSeek(2.0, 2.2)).toBe(true);
    expect(needsSeek(5, 1)).toBe(true); // after a seek
  });

  it("mixes the track volume with the player's", () => {
    expect(elementVolume(0.5, 1, false)).toBe(0.5);
    expect(elementVolume(0.5, 0.5, false)).toBe(0.25);
    expect(elementVolume(2, 1, false)).toBe(1); // the preview can't go louder than the file
    expect(elementVolume(1, 1, true)).toBe(0);
  });

  it("builds file addresses on the film server", () => {
    expect(filmFileUrl("http://127.0.0.1:7342", "my film", "audio/voice over.wav")).toBe(
      "http://127.0.0.1:7342/my%20film/audio/voice%20over.wav",
    );
  });
});
