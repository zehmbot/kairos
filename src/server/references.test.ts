import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ffprobeNextTo, findFfmpeg } from "./ffmpeg.ts";
import {
  addReference,
  deleteReference,
  pickShots,
  processReference,
  readReferences,
  sheetPath,
  shotStats,
  updateReference,
} from "./references.ts";

let film: string;

beforeEach(async () => {
  film = await mkdtemp(join(tmpdir(), "kairos-refs-"));
  await mkdir(join(film, "references"));
});

afterEach(() => rm(film, { recursive: true, force: true }));

describe("shot numbers", () => {
  it("finds shot starts and the typical, shortest and longest shot", () => {
    const stats = shotStats([2, 2.05, 5, 9.99], 10);
    expect(stats.shots).toEqual([0, 2, 5]);
    expect(stats).toMatchObject({ medianShot: 3, shortestShot: 2, longestShot: 5 });
    expect(shotStats([], 4)).toMatchObject({ shots: [0], medianShot: 4 });
  });

  it("pictures every shot, or evenly chosen ones", () => {
    expect(pickShots(3)).toEqual([1, 2, 3]);
    const many = pickShots(100, 4);
    expect(many).toEqual([1, 34, 67, 100]);
  });
});

describe("the reference list", () => {
  it("adds, changes and removes references with their files", async () => {
    const ref = await addReference(film, "references/a.png", "image");
    expect(ref).toMatchObject({ status: "processing", note: "", sheets: 0 });
    await updateReference(film, ref.id, { note: "the colors" });
    expect((await readReferences(film))[0]?.note).toBe("the colors");
    expect(sheetPath(film, ref.id, 1)).toContain("sheet-1.jpg");
    expect(sheetPath(film, "../x", 1)).toBeNull();
    expect(await deleteReference(film, ref.id)).toBe(true);
    expect(await readReferences(film)).toEqual([]);
    expect(await deleteReference(film, ref.id)).toBe(false);
  });

  it("says plainly when ffmpeg is missing", async () => {
    const ref = await addReference(film, "references/a.mp4", "video");
    let done = 0;
    await processReference(film, ref, null, () => done++);
    const [after] = await readReferences(film);
    expect(after).toMatchObject({ status: "failed" });
    expect(after?.problem).toContain("needs ffmpeg");
    expect(done).toBe(1);
  });
});

const ffmpeg = findFfmpeg();

describe.runIf(ffmpeg)("looking inside references (ffmpeg)", () => {
  it("turns a video into shots, numbers and a sheet", async () => {
    const ff = ffmpeg as string;
    // One second of red, then one of blue: two shots.
    execFileSync(ff, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x180:r=25:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=25:d=1",
      "-filter_complex",
      "[0][1]concat=n=2:v=1[v]",
      "-map",
      "[v]",
      "-pix_fmt",
      "yuv420p",
      join(film, "references", "clip.mp4"),
    ]);
    const ref = await addReference(film, "references/clip.mp4", "video");
    await processReference(film, ref, ff, () => {});
    const [after] = await readReferences(film);
    expect(after?.status).toBe("ready");
    expect(after?.info).toMatchObject({ width: 320, height: 180, fps: 25, pictured: [1, 2] });
    expect(after?.info?.shots).toHaveLength(2);
    expect(after?.info?.shots[1]).toBeCloseTo(1, 0);
    expect(after?.sheets).toBe(1);
    const sheet = await readFile(sheetPath(film, ref.id, 1) as string);
    // A JPEG file starts with FF D8.
    expect([sheet[0], sheet[1]]).toEqual([0xff, 0xd8]);

    // Removing it removes the clip and its sheets.
    await deleteReference(film, ref.id);
    await expect(stat(join(film, "references", "clip.mp4"))).rejects.toThrow();
    await expect(stat(sheetPath(film, ref.id, 1) as string)).rejects.toThrow();
  }, 30_000);

  it("keeps a picture as one sheet, at most 1280 px", async () => {
    const ff = ffmpeg as string;
    execFileSync(ff, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=2000x1000",
      "-frames:v",
      "1",
      join(film, "references", "big.png"),
    ]);
    const ref = await addReference(film, "references/big.png", "image");
    await processReference(film, ref, ff, () => {});
    const [after] = await readReferences(film);
    expect(after).toMatchObject({ status: "ready", sheets: 1 });
    const size = execFileSync(ffprobeNextTo(ff), [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      sheetPath(film, ref.id, 1) as string,
    ])
      .toString()
      .trim();
    expect(size).toBe("1280,640");
  }, 30_000);

  it("reports a file it can't read", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(film, "references", "broken.mp4"), "not a video");
    const ref = await addReference(film, "references/broken.mp4", "video");
    await processReference(film, ref, ffmpeg as string, () => {});
    const [after] = await readReferences(film);
    expect(after?.status).toBe("failed");
    expect(after?.problem).toContain("couldn't read this video");
  }, 30_000);
});
