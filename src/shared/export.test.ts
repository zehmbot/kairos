import { describe, expect, it } from "vitest";
import { exportSize, isReshaped, shapeOf, showingQuery, withQuery } from "./export.ts";

describe("shapes for export", () => {
  it("knows a film's shape from its size, with a little slack", () => {
    expect(shapeOf({ width: 1920, height: 1080 })).toBe("wide");
    expect(shapeOf({ width: 1280, height: 720 })).toBe("wide");
    expect(shapeOf({ width: 1080, height: 1920 })).toBe("tall");
    expect(shapeOf({ width: 720, height: 1280 })).toBe("tall");
    expect(shapeOf({ width: 1080, height: 1080 })).toBe("square");
    expect(shapeOf({ width: 1000, height: 1010 })).toBe("square");
    // 4:5 and 21:9 are shapes of their own.
    expect(shapeOf({ width: 1080, height: 1350 })).toBeNull();
    expect(shapeOf({ width: 2560, height: 1080 })).toBeNull();
  });

  it("keeps the film's own size for its own shape, else uses the shape's", () => {
    const wide = { width: 1280, height: 720 };
    expect(exportSize(wide)).toEqual(wide);
    expect(exportSize(wide, "wide")).toEqual(wide);
    expect(exportSize(wide, "tall")).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(wide, "square")).toEqual({ width: 1080, height: 1080 });
    // A 4:5 film is never "its own shape" for a preset.
    expect(exportSize({ width: 1080, height: 1350 }, "tall")).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(isReshaped(wide, exportSize(wide, "wide"))).toBe(false);
    expect(isReshaped(wide, exportSize(wide, "tall"))).toBe(true);
  });

  it("asks a film page for a size and no captions in its address", () => {
    expect(showingQuery({})).toBe("");
    expect(showingQuery({ size: { width: 1080, height: 1920 } })).toBe("kairos-size=1080x1920");
    expect(showingQuery({ size: null, captions: false })).toBe("kairos-captions=off");
    expect(withQuery("/intro/index.html", "")).toBe("/intro/index.html");
    expect(withQuery("/intro/index.html", "kairos-size=1x2")).toBe(
      "/intro/index.html?kairos-size=1x2",
    );
    expect(withQuery("/intro/index.html?kairos=preview", "kairos-size=1x2")).toBe(
      "/intro/index.html?kairos=preview&kairos-size=1x2",
    );
  });
});
