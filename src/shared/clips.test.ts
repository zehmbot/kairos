import { describe, expect, it } from "vitest";
import {
  clipBox,
  clipLength,
  clipOpacity,
  clipTime,
  drawOrder,
  PICTURE_SECONDS,
  placeAt,
  placeOf,
} from "./clips.ts";
import { VideoClipSchema } from "./types.ts";

const clip = (extra: object = {}) =>
  VideoClipSchema.parse({ file: "assets/videos/a.mp4", ...extra });

describe("video clips", () => {
  it("fills the frame by default, and keeps the film's shape when smaller", () => {
    expect(clipBox(clip(), 1920, 1080)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
    expect(clipBox(clip({ size: 0.25, x: 0.75, y: 0.25 }), 1920, 1080)).toEqual({
      left: 1200,
      top: 135,
      width: 480,
      height: 270,
    });
  });

  it("places a clip in a corner with the same margin on both sides", () => {
    const at = placeAt("top-right", 0.25, 1920, 1080);
    const box = clipBox({ size: 0.25, ...at }, 1920, 1080);
    expect(Math.round(1920 - (box.left + box.width))).toBe(77);
    expect(Math.round(box.top)).toBe(77);
    expect(placeOf({ size: 0.25, ...at }, 1920, 1080)).toBe("top-right");
    expect(placeOf({ size: 0.25, x: 0.3, y: 0.6 }, 1920, 1080)).toBeNull();
    expect(placeAt("center", 0.5, 1920, 1080)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("knows how long a clip shows, and where in its file it is", () => {
    expect(clipLength(clip({ length: 2 }))).toBe(2);
    expect(clipLength(clip({ from: 1 }), 5)).toBe(4);
    expect(clipLength(clip())).toBeNull();
    expect(clipLength(clip({ file: "assets/images/logo.png" }))).toBe(PICTURE_SECONDS);
    const c = clip({ start: 2, from: 1 });
    expect(clipTime(c, 1.9, 3)).toBeNull();
    expect(clipTime(c, 2.5, 3)).toBe(1.5);
    expect(clipTime(c, 5, 3)).toBeNull();
  });

  it("fades in and out", () => {
    const c = clip({ start: 1, opacity: 0.8, fade: 0.5 });
    expect(clipOpacity(c, 0.9, 2)).toBe(0);
    expect(clipOpacity(c, 1.25, 2)).toBeCloseTo(0.4);
    expect(clipOpacity(c, 2, 2)).toBeCloseTo(0.8);
    expect(clipOpacity(c, 2.75, 2)).toBeCloseTo(0.4);
    expect(clipOpacity(clip({ start: 1 }), 2, 2)).toBe(1);
  });

  it("draws lower tracks first", () => {
    const clips = [
      clip({ lane: 1, start: 0 }),
      clip({ lane: 0, start: 3 }),
      clip({ lane: 0, start: 1 }),
    ];
    expect(drawOrder(clips).map((c) => [c.lane, c.start])).toEqual([
      [0, 1],
      [0, 3],
      [1, 0],
    ]);
  });
});
