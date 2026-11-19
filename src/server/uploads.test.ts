import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptFor, contentTypeOf, formatSize, mediaKindOf } from "../shared/media.ts";
import { checkUploadName, cleanFileName, saveUpload, UploadError } from "./uploads.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kairos-uploads-"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

const body = (text: string) => Readable.from([Buffer.from(text)]);

describe("file kinds", () => {
  it("knows images, videos, sounds and fonts by their extension", () => {
    expect(mediaKindOf("a.PNG")).toBe("image");
    expect(mediaKindOf("clip.mov")).toBe("video");
    expect(mediaKindOf("song.mp3")).toBe("sound");
    expect(mediaKindOf("title.woff2")).toBe("font");
    expect(mediaKindOf("notes.txt")).toBeNull();
    expect(mediaKindOf("mp3")).toBeNull();
    expect(contentTypeOf("song.mp3")).toBe("audio/mpeg");
    expect(acceptFor(["font"])).toBe(".ttf,.otf,.woff,.woff2");
    expect(formatSize(1536)).toBe("2 KB");
    expect(formatSize(12.4 * 1024 * 1024)).toBe("12.4 MB");
  });
});

describe("uploads", () => {
  it("cleans file names", () => {
    expect(cleanFileName("My Song (final).MP3")).toBe("my-song-final.mp3");
    expect(cleanFileName("C:\\Users\\me\\..\\évité.wav")).toBe("évité.wav");
    expect(cleanFileName("../../.hidden")).toBeNull();
    expect(cleanFileName("noextension")).toBeNull();
    expect(cleanFileName("???.png")).toBeNull();
  });

  it("refuses files of the wrong kind with a plain message", () => {
    expect(checkUploadName("rain.mp3", ["sound"])).toBe("rain.mp3");
    expect(() => checkUploadName("rain.exe", ["sound"])).toThrow("Add a sound file.");
    expect(() => checkUploadName("rain.mp3", ["video", "image"])).toThrow(
      "Add a video or picture file.",
    );
    expect(() => checkUploadName(undefined, ["sound"])).toThrow(UploadError);
  });

  it("saves under a free name and leaves nothing behind when it fails", async () => {
    expect(await saveUpload(body("one"), dir, "rain.mp3")).toBe("rain.mp3");
    expect(await saveUpload(body("two"), dir, "rain.mp3")).toBe("rain-2.mp3");
    expect(await readFile(join(dir, "rain-2.mp3"), "utf8")).toBe("two");
    await expect(saveUpload(body("x".repeat(50)), dir, "big.mp3", 10)).rejects.toThrow("too big");
    await expect(saveUpload(body(""), dir, "empty.mp3")).rejects.toThrow("empty");
    expect((await readdir(dir)).sort()).toEqual(["rain-2.mp3", "rain.mp3"]);
  });

  it("gives two files sent at once two names", async () => {
    const names = await Promise.all([
      saveUpload(body("a"), dir, "same.wav"),
      saveUpload(body("b"), dir, "same.wav"),
    ]);
    expect(names.sort()).toEqual(["same-2.wav", "same.wav"]);
  });
});
