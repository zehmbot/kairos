import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Picture, Render } from "../shared/types.ts";
import {
  addPicture,
  addRender,
  listPictures,
  listRenders,
  nextPictureNumber,
  nextVersion,
  pictureName,
  picturePath,
  RendersFileError,
  removePicture,
  removeRender,
  renderPath,
  subtitlesFileOf,
  versionIn,
  videoName,
} from "./renders.ts";

let dir: string;

const render = (version: number): Render => ({
  version,
  file: `renders/${videoName("intro", version)}`,
  createdAt: "2026-11-19T10:00:00.000Z",
  quality: "high",
  encoder: "libx264",
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 5,
  frames: 150,
  bytes: 4,
  seconds: 3,
});

async function addVideo(version: number) {
  await mkdir(join(dir, "renders"), { recursive: true });
  await writeFile(join(dir, "renders", videoName("intro", version)), "mp4!");
  await addRender(dir, render(version));
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kairos-renders-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("renders", () => {
  it("lists the videos, newest first, and skips missing files", async () => {
    await addVideo(1);
    await addVideo(2);
    await addRender(dir, render(3)); // listed, but the file isn't there
    expect((await listRenders(dir)).map((entry) => entry.version)).toEqual([2, 1]);
    expect(await renderPath(dir, 2)).toBe(join(dir, "renders", "intro-v2.mp4"));
    expect(await renderPath(dir, 3)).toBeNull();
  });

  it("never reuses a version, even for files it didn't list", async () => {
    expect(await nextVersion(dir, "intro")).toBe(1);
    await addVideo(1);
    await writeFile(join(dir, "renders", "intro-v7.mp4"), "made elsewhere");
    expect(await nextVersion(dir, "intro")).toBe(8);
    // Videos in another shape, and their subtitles, count too; other films' files don't.
    await writeFile(join(dir, "renders", "intro-v9-tall.mp4"), "tall");
    await writeFile(join(dir, "renders", "intro-v11-square.srt"), "subtitles");
    await writeFile(join(dir, "renders", "intro-extra-v40.mp4"), "another film");
    await writeFile(join(dir, "renders", "intro-v50-round.mp4"), "not a shape");
    expect(await nextVersion(dir, "intro")).toBe(12);
  });

  it("names a video in another shape after it", () => {
    expect(videoName("intro", 3)).toBe("intro-v3.mp4");
    expect(videoName("intro", 3, "tall")).toBe("intro-v3-tall.mp4");
    expect(versionIn("intro", "intro-v3-tall.mp4")).toBe(3);
    expect(versionIn("intro", "intro-v3.srt")).toBe(3);
    expect(versionIn("intro", "intro-v3.png")).toBeNull();
    expect(versionIn("intro", "outro-v3.mp4")).toBeNull();
  });

  it("deletes a video and its entry", async () => {
    await addVideo(1);
    expect(await removeRender(dir, 1)).toBe(true);
    expect(await listRenders(dir)).toEqual([]);
    expect(await removeRender(dir, 1)).toBe(false);
  });

  it("keeps a video's subtitles next to it, and deletes them with it", async () => {
    await mkdir(join(dir, "renders"), { recursive: true });
    const file = `renders/${videoName("intro", 1, "tall")}`;
    const subtitles = subtitlesFileOf(file);
    expect(subtitles).toBe("renders/intro-v1-tall.srt");
    await writeFile(join(dir, file), "mp4!");
    await writeFile(join(dir, subtitles), "1\r\n...");
    await addRender(dir, { ...render(1), file, subtitles });
    expect((await listRenders(dir))[0]?.subtitles).toBe(subtitles);
    // A subtitles file deleted by hand reads as none.
    await rm(join(dir, subtitles));
    expect((await listRenders(dir))[0]?.subtitles).toBeNull();
    await writeFile(join(dir, subtitles), "back");
    expect(await removeRender(dir, 1)).toBe(true);
    await expect(readFile(join(dir, subtitles))).rejects.toThrow();
    await expect(readFile(join(dir, file))).rejects.toThrow();
  });

  it("keeps saved pictures beside the videos, numbered upwards", async () => {
    const picture = (number: number): Picture => ({
      number,
      file: `renders/${pictureName("intro", number)}`,
      createdAt: "2026-11-23T10:00:00.000Z",
      t: 2.5,
      width: 1080,
      height: 1920,
      shape: "tall",
      bytes: 5,
    });
    expect(await nextPictureNumber(dir, "intro")).toBe(1);
    await addVideo(1);
    await writeFile(join(dir, "renders", pictureName("intro", 1)), "png!!");
    await addPicture(dir, picture(1));
    // A picture made elsewhere still takes its number.
    await writeFile(join(dir, "renders", "intro-picture-4.png"), "png!!");
    expect(await nextPictureNumber(dir, "intro")).toBe(5);
    await writeFile(join(dir, "renders", pictureName("intro", 5)), "png!!");
    await addPicture(dir, picture(5));
    // Videos and pictures don't push each other out of the list.
    await addVideo(2);
    expect((await listRenders(dir)).map((entry) => entry.version)).toEqual([2, 1]);
    expect((await listPictures(dir)).map((entry) => entry.number)).toEqual([5, 1]);
    expect(await picturePath(dir, 5)).toBe(join(dir, "renders", "intro-picture-5.png"));

    expect(await removePicture(dir, 1)).toBe(true);
    expect(await removePicture(dir, 1)).toBe(false);
    expect(await picturePath(dir, 1)).toBeNull();
    expect((await listPictures(dir)).map((entry) => entry.number)).toEqual([5]);
    expect((await listRenders(dir)).map((entry) => entry.version)).toEqual([2, 1]);
  });

  it("reads a list of videos made before pictures and subtitles", async () => {
    await mkdir(join(dir, ".kairos"), { recursive: true });
    await mkdir(join(dir, "renders"), { recursive: true });
    await writeFile(join(dir, "renders", "intro-v1.mp4"), "mp4!");
    const { shape: _shape, fit: _fit, subtitles: _subtitles, ...old } = render(1);
    await writeFile(
      join(dir, ".kairos", "renders.json"),
      JSON.stringify({ version: 1, renders: [old] }),
    );
    expect(await listRenders(dir)).toEqual([old]);
    expect(await listPictures(dir)).toEqual([]);
    // Written back without an empty list of pictures.
    await addVideo(2);
    const saved = JSON.parse(await readFile(join(dir, ".kairos", "renders.json"), "utf8"));
    expect(Object.keys(saved)).toEqual(["version", "renders"]);
  });

  it("never overwrites a broken list", async () => {
    await mkdir(join(dir, ".kairos"));
    await writeFile(join(dir, ".kairos", "renders.json"), "{ broken");
    await expect(listRenders(dir)).rejects.toThrow(RendersFileError);
    await expect(addRender(dir, render(1))).rejects.toThrow(RendersFileError);
    expect(await readFile(join(dir, ".kairos", "renders.json"), "utf8")).toBe("{ broken");
  });
});
