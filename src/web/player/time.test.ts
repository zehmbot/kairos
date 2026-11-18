import { describe, expect, it } from "vitest";
import {
  clampFrame,
  formatLength,
  formatTimecode,
  frameAt,
  frameCount,
  sceneAt,
  timeOf,
} from "./time.ts";

describe("frame math", () => {
  it("counts frames", () => {
    expect(frameCount(5, 30)).toBe(150);
    expect(frameCount(1.5, 24)).toBe(36);
    expect(frameCount(0.001, 30)).toBe(1);
  });

  it("goes between time and frames", () => {
    expect(timeOf(30, 30)).toBe(1);
    expect(frameAt(1, 30, 150)).toBe(30);
    expect(frameAt(0.1, 30, 150)).toBe(3);
    expect(frameAt(1.99, 30, 150)).toBe(59);
    expect(frameAt(99, 30, 150)).toBe(149);
  });

  it("keeps frames inside the film", () => {
    expect(clampFrame(-3, 150)).toBe(0);
    expect(clampFrame(150, 150)).toBe(149);
    expect(clampFrame(2.6, 150)).toBe(3);
  });
});

describe("formatting", () => {
  it("formats timecodes", () => {
    expect(formatTimecode(0)).toBe("00:00.00");
    expect(formatTimecode(1.5)).toBe("00:01.50");
    expect(formatTimecode(75.25)).toBe("01:15.25");
    expect(formatTimecode(-1)).toBe("00:00.00");
    // Frame 2 at 30 fps is 0.0667 s: rounded like the film's own `t.toFixed(2)`.
    expect(formatTimecode(2 / 30)).toBe("00:00.07");
    expect(formatTimecode(59.999)).toBe("01:00.00");
  });

  it("formats lengths in plain words", () => {
    expect(formatLength(5)).toBe("5 s");
    expect(formatLength(2.5)).toBe("2.5 s");
    expect(formatLength(60)).toBe("1 min");
    expect(formatLength(75)).toBe("1 min 15 s");
  });
});

describe("sceneAt", () => {
  const scenes = [
    { name: "Title", start: 1, end: 4 },
    { name: "Intro", start: 0 },
    { name: "Outro", start: 4 },
  ];

  it("finds the scene playing at a time", () => {
    expect(sceneAt(scenes, 0.5)?.name).toBe("Intro");
    expect(sceneAt(scenes, 1)?.name).toBe("Title");
    expect(sceneAt(scenes, 4.9)?.name).toBe("Outro");
    expect(sceneAt([], 1)).toBeUndefined();
  });
});
