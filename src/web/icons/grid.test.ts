import { describe, expect, it } from "vitest";
import { MONO, parseGrid } from "./grid.ts";
import { ICONS } from "./icons.ts";

describe("parseGrid", () => {
  it("merges horizontal runs and skips transparent pixels", () => {
    const rects = parseGrid({ colors: MONO, grid: ["##.#", "...."] });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 2, h: 1, fill: "currentColor" },
      { x: 3, y: 0, w: 1, h: 1, fill: "currentColor" },
    ]);
  });

  it("splits runs when the color changes", () => {
    const rects = parseGrid({ colors: { a: "red", b: "blue" }, grid: ["aab"] });
    expect(rects.map((r) => [r.x, r.w, r.fill])).toEqual([
      [0, 2, "red"],
      [2, 1, "blue"],
    ]);
  });

  it("rejects rows of the wrong length", () => {
    expect(() => parseGrid({ colors: MONO, grid: ["##", "#"] })).toThrow(/row 1/);
  });

  it("rejects characters without a color", () => {
    expect(() => parseGrid({ colors: MONO, grid: ["#x"] })).toThrow(/"x"/);
  });
});

describe("ICONS", () => {
  it.each(Object.entries(ICONS))("%s is a valid 16x16 icon", (_name, icon) => {
    expect(icon.grid).toHaveLength(16);
    expect(() => parseGrid(icon)).not.toThrow();
    for (const row of icon.grid) expect(row).toHaveLength(16);
  });
});
