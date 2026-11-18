import { describe, expect, it } from "vitest";
import { filmIdFromPath } from "./watcher.ts";

describe("filmIdFromPath", () => {
  it("finds the film a changed file belongs to", () => {
    expect(filmIdFromPath("my-intro/film.js")).toBe("my-intro");
    expect(filmIdFromPath("my-intro\\assets\\logo.png")).toBe("my-intro");
    expect(filmIdFromPath("my-intro/film.js", "change")).toBe("my-intro");
  });

  it("notices film folders being added, removed or renamed", () => {
    expect(filmIdFromPath("my-intro", "rename")).toBe("my-intro");
  });

  it("ignores the folder-level change Windows sends for any change inside", () => {
    expect(filmIdFromPath("my-intro", "change")).toBeNull();
  });

  it("ignores hidden files, renders and things outside films", () => {
    for (const path of [
      "my-intro/.kairos/notes.json",
      "my-intro/.film.js.swp",
      "my-intro/renders/my-intro_v1.mp4",
      "my-intro/node_modules/x/index.js",
      ".DS_Store",
      "",
    ]) {
      expect(filmIdFromPath(path)).toBeNull();
    }
  });
});
