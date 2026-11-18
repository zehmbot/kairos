import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeFilmId, normalizeWorkspacePath, resolveInside } from "./workspace.ts";

describe("isSafeFilmId", () => {
  it("accepts plain folder names in any language", () => {
    for (const id of ["my-intro", "Intro_2", "v1.2", "我的电影", "café clip"]) {
      expect(isSafeFilmId(id)).toBe(true);
    }
  });

  it("rejects anything that could leave the films folder or hide", () => {
    for (const id of [
      "",
      ".",
      "..",
      ".kairos",
      "a/b",
      "a\\b",
      "../x",
      "a..b",
      "-x",
      " x",
      "C:",
      "x\0",
    ]) {
      expect(isSafeFilmId(id)).toBe(false);
    }
  });
});

describe("resolveInside", () => {
  const root = resolve("/films/my-intro");

  it("resolves files and sub-folders inside the root", () => {
    expect(resolveInside(root, "index.html")).toBe(join(root, "index.html"));
    expect(resolveInside(root, "assets/logo.png")).toBe(join(root, "assets", "logo.png"));
    expect(resolveInside(root, "./film.js")).toBe(join(root, "film.js"));
  });

  it("blocks escapes, hidden files and odd paths", () => {
    for (const path of [
      "",
      "/",
      "../secret.txt",
      "assets/../../x",
      ".kairos/notes.json",
      "assets/.env",
      "C:/Windows/win.ini",
      "a\\..\\..\\b",
      "x\0.html",
    ]) {
      expect(resolveInside(root, path)).toBeNull();
    }
  });
});

describe("normalizeWorkspacePath", () => {
  const home = resolve("/home/you");

  it("accepts full paths and cleans them up", () => {
    const full = resolve("/data/Kairos");
    expect(normalizeWorkspacePath(`  ${full}  `, home)).toEqual({ ok: true, path: full });
    expect(normalizeWorkspacePath(`"${full}"`, home)).toEqual({ ok: true, path: full });
  });

  it("expands ~ to the home folder", () => {
    expect(normalizeWorkspacePath("~", home)).toEqual({ ok: true, path: home });
    expect(normalizeWorkspacePath("~/Kairos", home)).toEqual({
      ok: true,
      path: join(home, "Kairos"),
    });
  });

  it("refuses relative or empty paths with a plain message", () => {
    for (const input of ["", "   ", "Kairos", "./films"]) {
      const result = normalizeWorkspacePath(input, home, "win32");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("C:\\Users\\you\\Kairos");
    }
  });
});
