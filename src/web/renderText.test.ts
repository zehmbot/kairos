import { describe, expect, it } from "vitest";
import type { RenderJob } from "../shared/types.ts";
import { formatBytes, formatDuration, jobStatus, progressOf, secondsLeft } from "./renderText.ts";

const job = (extra: Partial<RenderJob>): RenderJob => ({
  id: "r_1",
  filmId: "intro",
  title: "Intro",
  state: "running",
  quality: "high",
  encoder: "h264_nvenc",
  done: 0,
  total: 300,
  queuedAt: "2026-11-19T10:00:00.000Z",
  startedAt: "2026-11-19T10:00:00.000Z",
  endedAt: null,
  error: null,
  version: null,
  ...extra,
});

describe("render text", () => {
  it("formats sizes and durations", () => {
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(48_234_567)).toBe("46.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GB");
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(95)).toBe("1 min 35 s");
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(3720)).toBe("1 h 2 min");
  });

  it("estimates the time left from the speed so far", () => {
    const now = Date.parse("2026-11-19T10:00:10.000Z"); // 10 s in
    expect(secondsLeft(job({ done: 100 }), now)).toBe(20);
    expect(secondsLeft(job({ done: 2 }), now)).toBeNull(); // too early to tell
    expect(progressOf(job({ done: 150 }))).toBe(0.5);
  });

  it("says where a render is", () => {
    const now = Date.parse("2026-11-19T10:00:10.000Z");
    expect(jobStatus(job({ done: 100 }), now)).toBe(
      "Rendering 33% · frame 100 of 300 · about 20 s left",
    );
    expect(jobStatus(job({ state: "queued" }), now)).toBe("Waiting for the render before it");
    expect(jobStatus(job({ state: "done", version: 3 }), now)).toBe("Done: version 3");
    expect(jobStatus(job({ state: "failed", error: "boom" }), now)).toBe("boom");
  });
});
