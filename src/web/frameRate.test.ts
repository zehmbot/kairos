import { describe, expect, it } from "vitest";
import { isPresetRate, parseFrameRate } from "./frameRate.ts";

describe("frame rates", () => {
  it("knows the one-click rates", () => {
    expect(isPresetRate(24)).toBe(true);
    expect(isPresetRate(30)).toBe(true);
    expect(isPresetRate(60)).toBe(true);
    expect(isPresetRate(48)).toBe(false);
  });

  it("reads typed rates", () => {
    expect(parseFrameRate("48")).toEqual({ ok: true, fps: 48 });
    expect(parseFrameRate(" 29.97 ")).toEqual({ ok: true, fps: 29.97 });
    expect(parseFrameRate("23,976")).toEqual({ ok: true, fps: 23.976 });
    expect(parseFrameRate("120")).toEqual({ ok: true, fps: 120 });
  });

  it("explains rates it can't use", () => {
    expect(parseFrameRate("")).toEqual({ ok: false, error: "Type a frame rate." });
    expect(parseFrameRate("fast")).toMatchObject({
      ok: false,
      error: expect.stringContaining("number"),
    });
    expect(parseFrameRate("0")).toMatchObject({
      ok: false,
      error: expect.stringContaining("at least 1"),
    });
    expect(parseFrameRate("240")).toMatchObject({
      ok: false,
      error: expect.stringContaining("at most 120"),
    });
  });
});
