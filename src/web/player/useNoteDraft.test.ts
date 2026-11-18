import { describe, expect, it } from "vitest";
import { isEmptyDraft, type NoteDraft, settleDraft } from "./useNoteDraft.ts";

const empty: NoteDraft = { tool: "box", shapes: [], text: "", t: null, range: false, until: null };
const box = { type: "box", x: 10, y: 10, w: 50, h: 50 } as const;

describe("note draft", () => {
  it("is empty until something is drawn, written or a range is picked", () => {
    expect(isEmptyDraft(empty)).toBe(true);
    expect(isEmptyDraft({ ...empty, text: "   " })).toBe(true);
    expect(isEmptyDraft({ ...empty, text: "Bigger" })).toBe(false);
    expect(isEmptyDraft({ ...empty, shapes: [box] })).toBe(false);
    expect(isEmptyDraft({ ...empty, range: true })).toBe(false);
  });

  it("pins the note to the frame of its first mark or word", () => {
    expect(settleDraft({ ...empty, shapes: [box] }, 1.5).t).toBe(1.5);
    expect(settleDraft({ ...empty, text: "B" }, 2).t).toBe(2);
    expect(settleDraft({ ...empty, range: true }, 3).t).toBe(3);
  });

  it("keeps the frame once pinned", () => {
    expect(settleDraft({ ...empty, shapes: [box], text: "B", t: 1.5 }, 4).t).toBe(1.5);
  });

  it("lets go of the frame when the note is emptied again", () => {
    const settled = settleDraft({ ...empty, t: 1.5, until: 2 }, 4);
    expect(settled.t).toBeNull();
    expect(settled.until).toBeNull();
    expect(settleDraft(empty, 4).t).toBeNull();
  });
});
