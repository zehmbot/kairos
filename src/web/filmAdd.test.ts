import { describe, expect, it } from "vitest";
import { groupFiles, purposesFor, tabFor, uploadUrl } from "./filmAdd.ts";

const file = (name: string) => new File(["x"], name);

describe("adding files to a film", () => {
  it("offers what fits each kind, the usual choice first", () => {
    expect(purposesFor("sound", "a.mp3")).toEqual(["sound", "library"]);
    expect(purposesFor("video", "a.mp4")).toEqual(["clip", "reference", "film", "library"]);
    expect(purposesFor("image", "a.png")).toEqual(["clip", "reference", "film", "library"]);
    expect(purposesFor("image", "logo.svg")).toEqual(["film", "library"]);
    expect(purposesFor("font", "a.ttf")).toEqual(["film", "library"]);
    // A file already in the library can't be added to it again.
    expect(purposesFor("video", "a.mp4", true)).toEqual(["clip", "reference", "film"]);
  });

  it("groups dropped files by kind and sets aside the others", () => {
    const { groups, unknown } = groupFiles([
      file("b.png"),
      file("a.mp3"),
      file("notes.txt"),
      file("c.PNG"),
    ]);
    expect(groups.map((g) => [g.kind, g.files.map((f) => f.name)])).toEqual([
      ["sound", ["a.mp3"]],
      ["image", ["b.png", "c.PNG"]],
    ]);
    expect(unknown.map((f) => f.name)).toEqual(["notes.txt"]);
  });

  it("sends each purpose to its place and opens the right tab", () => {
    expect(uploadUrl("my film", "sound", "rain drops.mp3", 2.5)).toBe(
      "/api/films/my%20film/sounds?name=rain%20drops.mp3&start=2.50",
    );
    expect(uploadUrl("intro", "reference", "a.mp4")).toBe("/api/films/intro/references?name=a.mp4");
    expect(uploadUrl("intro", "film", "a.ttf")).toBe("/api/films/intro/files?name=a.ttf");
    expect(uploadUrl("intro", "clip", "logo.png", 1)).toBe(
      "/api/films/intro/clips?name=logo.png&start=1.00",
    );
    expect(uploadUrl("intro", "library", "a.ttf")).toBe("/api/assets?name=a.ttf");
    expect(tabFor("sound")).toBe("sound");
    expect(tabFor("reference")).toBe("references");
    expect(tabFor("film")).toBeNull();
  });
});
