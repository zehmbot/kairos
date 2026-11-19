import { describe, expect, it } from "vitest";
import { elementVolume, filmFileUrl, needsSeek, trackPosition } from "./audioSync.ts";

describe("sound in the preview", () => {
  it("knows where each track should be", () => {
    expect(trackPosition(0, 2.5)).toBe(2.5);
    expect(trackPosition(1.2, 3)).toBeCloseTo(1.8);
    expect(trackPosition(1.2, 1)).toBeNull(); // not started yet
    expect(trackPosition(0, 12, 10)).toBeNull(); // the file already ended
    expect(trackPosition(0, 4, Number.NaN)).toBe(4); // length not known yet
    // Trimmed: starts 1.5 s into the file and plays for 2 s.
    expect(trackPosition(3, 3.5, 10, 1.5, 2)).toBeCloseTo(2);
    expect(trackPosition(3, 5.1, 10, 1.5, 2)).toBeNull();
    expect(trackPosition(0, 9, 10, 1.5)).toBeNull(); // 10.5 s into a 10 s file
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

describe("waveform peaks", () => {
  it("keeps the loudest sample of each bucket, over all channels", async () => {
    const { peaksOf } = await import("./waveform.ts");
    const left = new Float32Array([0, 0.5, -0.2, 0, 0.1, -0.9]);
    const right = new Float32Array([0.7, 0, 0, 0, 0, 0]);
    // 6 samples at 300 per second, 100 buckets per second: 3 samples per bucket.
    expect([...peaksOf([left, right], 300)].map((v) => Math.round(v * 10) / 10)).toEqual([
      0.7, 0.9,
    ]);
  });
});
