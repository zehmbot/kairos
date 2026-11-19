import { describe, expect, it } from "vitest";
import {
  chunkArgs,
  concatLine,
  encoderArgs,
  ffmpegCandidates,
  ffprobeNextTo,
  findFfmpeg,
  joinArgs,
  probeExport,
} from "./ffmpeg.ts";

describe("finding ffmpeg", () => {
  it("looks at KAIROS_FFMPEG, then the PATH", () => {
    expect(ffmpegCandidates("win32", { Path: "C:\\a;C:\\b" })).toEqual([
      "C:\\a\\ffmpeg.exe",
      "C:\\b\\ffmpeg.exe",
    ]);
    expect(ffmpegCandidates("linux", { PATH: "/usr/bin", KAIROS_FFMPEG: "/opt/ff" })).toEqual([
      "/opt/ff",
      "/usr/bin/ffmpeg",
    ]);
    expect(findFfmpeg("linux", { PATH: "/a:/b" }, (path) => path === "/b/ffmpeg")).toBe(
      "/b/ffmpeg",
    );
    expect(findFfmpeg("linux", { PATH: "/a" }, () => false)).toBeNull();
  });

  it("finds ffprobe next to it", () => {
    expect(ffprobeNextTo("C:\\ff\\bin\\ffmpeg.exe")).toBe("C:\\ff\\bin\\ffprobe.exe");
    expect(ffprobeNextTo("/usr/bin/ffmpeg")).toBe("/usr/bin/ffprobe");
  });
});

describe("ffmpeg commands", () => {
  it("sets each encoder for the quality", () => {
    expect(encoderArgs("libx264", "high")).toEqual([
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "16",
    ]);
    expect(encoderArgs("libx264", "small")).toContain("22");
    expect(encoderArgs("h264_nvenc", "high")).toEqual(
      expect.arrayContaining(["h264_nvenc", "-cq", "19"]),
    );
    expect(encoderArgs("h264_amf", "small")).toEqual(expect.arrayContaining(["h264_amf", "24"]));
    expect(encoderArgs("h264_qsv", "high")).toEqual(expect.arrayContaining(["h264_qsv", "20"]));
  });

  it("encodes a chunk from PNG frames on stdin", () => {
    const args = chunkArgs({
      encoder: "libx264",
      quality: "high",
      fps: 29.97,
      width: 1081,
      height: 1920,
      output: "C:\\film\\renders\\.parts\\r_1\\chunk-00000.mp4",
    });
    const flagValue = (flag: string) => args[args.indexOf(flag) + 1];
    expect(flagValue("-f")).toBe("image2pipe");
    expect(flagValue("-framerate")).toBe("29.97");
    expect(flagValue("-i")).toBe("-");
    // Odd sizes are padded to even, colors stay BT.709, and every chunk can be joined.
    expect(flagValue("-vf")).toContain("pad=ceil(iw/2)*2:ceil(ih/2)*2");
    expect(flagValue("-vf")).toContain("format=yuv420p");
    expect(flagValue("-g")).toBe("60");
    expect(args).toContain("-an");
    expect(args.at(-1)).toBe("C:\\film\\renders\\.parts\\r_1\\chunk-00000.mp4");
  });

  it("joins chunks without encoding again", () => {
    const args = joinArgs("list.txt", "out.mp4");
    expect(args).toEqual(expect.arrayContaining(["concat", "-c", "copy", "+faststart"]));
    expect(concatLine("C:\\films\\it's\\chunk.mp4")).toBe("file 'C:/films/it'\\''s/chunk.mp4'");
  });
});

describe("probing", () => {
  it("reports no ffmpeg when there is none", async () => {
    expect(await probeExport(null)).toEqual({ ffmpeg: null, encoders: [] });
  });

  const ffmpeg = findFfmpeg();
  it.runIf(ffmpeg)(
    "finds the encoders that really work, CPU last",
    async () => {
      const info = await probeExport(ffmpeg);
      expect(info.ffmpeg?.path).toBe(ffmpeg);
      expect(info.encoders.at(-1)?.id).toBe("libx264");
    },
    60_000,
  );
});
