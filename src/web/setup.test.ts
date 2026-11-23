import { describe, expect, it } from "vitest";
import { ffmpegInstall, type SetupState, setupProgress } from "./setup.ts";

const ready: SetupState = {
  folder: true,
  claude: "connected",
  voices: true,
  ffmpeg: true,
  browser: true,
};

describe("setup progress", () => {
  it("is complete when every step is done", () => {
    expect(setupProgress(ready)).toMatchObject({ count: 4, total: 4, complete: true, known: true });
  });

  it("counts Claude Code as done only once it is connected", () => {
    const progress = setupProgress({ ...ready, claude: "installed" });
    expect(progress.done.claude).toBe(false);
    expect(progress.count).toBe(3);
    expect(progress.complete).toBe(false);
  });

  it("needs both ffmpeg and a browser for the computer step", () => {
    expect(setupProgress({ ...ready, browser: false }).done.computer).toBe(false);
    expect(setupProgress({ ...ready, ffmpeg: false }).done.computer).toBe(false);
  });

  it("waits until every answer is in", () => {
    expect(setupProgress({ ...ready, voices: null }).known).toBe(false);
  });
});

describe("ffmpeg install command", () => {
  it("fits the computer", () => {
    expect(ffmpegInstall("win32")).toBe("winget install Gyan.FFmpeg");
    expect(ffmpegInstall("darwin")).toBe("brew install ffmpeg");
    expect(ffmpegInstall("linux")).toBe("sudo apt install ffmpeg");
  });
});
