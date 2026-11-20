import { describe, expect, it } from "vitest";
import { placeTip } from "./tooltip.ts";

const view = { width: 1000, height: 800 };
const tip = { width: 60, height: 20 };

describe("placeTip", () => {
  it("centres the tooltip above its button", () => {
    expect(placeTip({ left: 100, top: 300, width: 32, height: 32 }, tip, view)).toEqual({
      left: 86,
      top: 274,
      side: "above",
    });
  });

  it("goes below a button at the top of the window", () => {
    expect(placeTip({ left: 100, top: 10, width: 32, height: 32 }, tip, view)).toEqual({
      left: 86,
      top: 48,
      side: "below",
    });
  });

  it("stays inside the window at its sides", () => {
    expect(placeTip({ left: 0, top: 300, width: 20, height: 20 }, tip, view).left).toBe(4);
    expect(placeTip({ left: 990, top: 300, width: 10, height: 20 }, tip, view).left).toBe(936);
  });
});
