import { describe, expect, it } from "vitest";
import { MARK_COLOR, MARK_OUTLINE, markGeometry, markStroke, marksSvg } from "./marks.ts";

describe("marks", () => {
  it("scales the line with the film", () => {
    expect(markStroke(1920, 1080)).toBe(6);
    expect(markStroke(320, 240)).toBe(3);
  });

  it("draws each kind of mark", () => {
    const elements = markGeometry(
      [
        { type: "point", x: 100, y: 50 },
        { type: "box", x: 300, y: 200, w: -100, h: -50 },
        { type: "arrow", x1: 0, y1: 0, x2: 100, y2: 0 },
        {
          type: "pen",
          points: [
            [1, 2],
            [3, 4],
          ],
        },
      ],
      6,
    );
    expect(elements.map((element) => element.tag)).toEqual([
      "circle",
      "circle",
      "rect",
      "polyline",
      "polygon",
      "polyline",
    ]);
    // Boxes drawn "backwards" are turned the right way round.
    expect(elements[2]).toEqual({ tag: "rect", x: 200, y: 150, width: 100, height: 50 });
    // The arrow head points at the end of the arrow.
    expect(elements[4]).toMatchObject({ tag: "polygon" });
    expect((elements[4] as { points: string }).points.startsWith("100,0 ")).toBe(true);
    expect(elements[5]).toEqual({ tag: "polyline", points: "1,2 3,4" });
  });

  it("builds a full-size SVG with an outline under the colour", () => {
    const svg = marksSvg([{ type: "point", x: 10, y: 10 }], 1920, 1080);
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg.indexOf(MARK_OUTLINE)).toBeLessThan(svg.indexOf(MARK_COLOR));
    expect(svg).not.toMatch(/<script|on\w+=/i);
  });
});
