import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Render } from "../shared/types.ts";
import {
  addRender,
  listRenders,
  nextVersion,
  RendersFileError,
  removeRender,
  renderPath,
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
  });

  it("deletes a video and its entry", async () => {
    await addVideo(1);
    expect(await removeRender(dir, 1)).toBe(true);
    expect(await listRenders(dir)).toEqual([]);
    expect(await removeRender(dir, 1)).toBe(false);
  });

  it("never overwrites a broken list", async () => {
    await mkdir(join(dir, ".kairos"));
    await writeFile(join(dir, ".kairos", "renders.json"), "{ broken");
    await expect(listRenders(dir)).rejects.toThrow(RendersFileError);
    await expect(addRender(dir, render(1))).rejects.toThrow(RendersFileError);
    expect(await readFile(join(dir, ".kairos", "renders.json"), "utf8")).toBe("{ broken");
  });
});
