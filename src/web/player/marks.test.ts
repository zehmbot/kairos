import { describe, expect, it } from "vitest";
import { minDrag, noteCovers, noteTimeLabel, shapeFromDrag, toFilmPoint } from "./marks.ts";

const film = { width: 1920, height: 1080 };

describe("toFilmPoint", () => {
  const box = { left: 100, top: 50, width: 960, height: 540 };

  it("turns screen positions into film pixels", () => {
    expect(toFilmPoint(100, 50, box, film)).toEqual([0, 0]);
    expect(toFilmPoint(580, 320, box, film)).toEqual([960, 540]);
    expect(toFilmPoint(1060, 590, box, film)).toEqual([1920, 1080]);
  });

  it("keeps points inside the frame", () => {
    expect(toFilmPoint(0, 0, box, film)).toEqual([0, 0]);
    expect(toFilmPoint(5000, 5000, box, film)).toEqual([1920, 1080]);
  });
});

describe("shapeFromDrag", () => {
  const min = minDrag(film);

  it("makes points, boxes and arrows", () => {
    expect(shapeFromDrag("point", [[10, 20]], min)).toEqual({ type: "point", x: 10, y: 20 });
    expect(
      shapeFromDrag(
        "box",
        [
          [300, 200],
          [100, 400],
        ],
        min,
      ),
    ).toEqual({ type: "box", x: 100, y: 200, w: 200, h: 200 });
    expect(
      shapeFromDrag(
        "arrow",
        [
          [0, 0],
          [100, 0],
        ],
        min,
      ),
    ).toEqual({ type: "arrow", x1: 0, y1: 0, x2: 100, y2: 0 });
  });

  it("ignores tiny drags", () => {
    const tiny: [number, number][] = [
      [10, 10],
      [12, 12],
    ];
    expect(shapeFromDrag("box", tiny, min)).toBeNull();
    expect(shapeFromDrag("arrow", tiny, min)).toBeNull();
    expect(shapeFromDrag("pen", tiny, min)).toBeNull();
    expect(shapeFromDrag("box", [], min)).toBeNull();
  });

  it("thins out pen lines", () => {
    const points = Array.from({ length: 101 }, (_, i): [number, number] => [i, 0]);
    const shape = shapeFromDrag("pen", points, min);
    expect(shape?.type).toBe("pen");
    if (shape?.type === "pen") {
      expect(shape.points.length).toBeLessThan(40);
      expect(shape.points[0]).toEqual([0, 0]);
    }
  });
});

describe("notes in time", () => {
  it("knows which frames a note covers", () => {
    expect(noteCovers({ t: 1, until: null }, 1.01, 30)).toBe(true);
    expect(noteCovers({ t: 1, until: null }, 1.04, 30)).toBe(false);
    expect(noteCovers({ t: 1, until: 2 }, 1.5, 30)).toBe(true);
    expect(noteCovers({ t: 1, until: 2 }, 2, 30)).toBe(true);
    expect(noteCovers({ t: 1, until: 2 }, 2.1, 30)).toBe(false);
  });

  it("labels note times", () => {
    expect(noteTimeLabel({ t: 1.2, until: null })).toBe("00:01.20");
    expect(noteTimeLabel({ t: 1.2, until: 2 })).toBe("00:01.20 to 00:02.00");
  });
});
