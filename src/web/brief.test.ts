import { describe, expect, it } from "vitest";
import type { TemplateField } from "../shared/types.ts";
import { answersOf, firstMissing, initialAnswers } from "./brief.ts";

const fields: TemplateField[] = [
  { id: "script", label: "Script", type: "longtext", required: true },
  { id: "mood", label: "Mood", type: "choice", required: false, options: ["calm", "funny"] },
  { id: "minutes", label: "Minutes", type: "number", required: false, default: 2 },
];

describe("the brief form", () => {
  it("starts from earlier answers, then defaults, then the first choice", () => {
    expect(initialAnswers(fields)).toEqual({ script: "", mood: "calm", minutes: "2" });
    expect(initialAnswers(fields, { script: "Once", minutes: 5 })).toEqual({
      script: "Once",
      mood: "calm",
      minutes: "5",
    });
  });

  it("names the first required question left empty", () => {
    expect(firstMissing(fields, { script: "  " })).toBe("Please answer: Script");
    expect(firstMissing(fields, { script: "Once" })).toBeNull();
  });

  it("sends only what was answered", () => {
    expect(answersOf({ script: "Once", mood: "", minutes: " " })).toEqual({ script: "Once" });
  });
});
