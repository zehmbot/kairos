import { describe, expect, it } from "vitest";
import { TemplateFileSchema, type TemplateSummary } from "../shared/types.ts";
import {
  choicesOf,
  draftFromTemplate,
  draftProblem,
  emptyDraft,
  idFromLabel,
  kindIdFromName,
  move,
  newKind,
  newQuestion,
  templateInputOf,
} from "./templateForm.ts";

describe("template form", () => {
  it("makes ids from the question text", () => {
    expect(idFromLabel("What's the topic?")).toBe("what_s_the_topic");
    expect(idFromLabel("3D or 2D")).toBe("q_3d_or_2d");
    expect(idFromLabel("Café crème")).toBe("cafe_creme");
    expect(idFromLabel("???")).toBe("q");
    expect(kindIdFromName("Bedtime Story")).toBe("bedtime-story");
    expect(kindIdFromName("!!")).toBe("kind");
  });

  it("reads choices one per line", () => {
    expect(choicesOf(" Calm \n\nFun\n")).toEqual(["Calm", "Fun"]);
  });

  it("keeps saved ids and gives new questions free ones", () => {
    const template: TemplateSummary = {
      id: "quiz",
      name: "Quiz",
      description: "",
      source: "yours",
      defaults: { shape: "wide", fps: 30, duration: 5 },
      hasPreview: false,
      problem: null,
      kinds: [
        {
          id: "default",
          name: "Default",
          description: "",
          fields: [{ id: "topic", label: "Old text", type: "text", required: true }],
        },
      ],
    };
    const draft = draftFromTemplate(template);
    const kind = draft.kinds[0];
    if (!kind) throw new Error("no kind");
    kind.questions[0] = { ...(kind.questions[0] ?? newQuestion()), label: "Topic" };
    kind.questions.push({ ...newQuestion(), label: "Topic" });
    kind.questions.push({ ...newQuestion(), label: "Mood", type: "choice", choices: "Calm\nFun" });
    kind.questions.push({ ...newQuestion(), label: "Words", type: "number", min: "10", max: "" });

    const input = templateInputOf(draft);
    const fields = input.kinds?.[0]?.fields ?? [];
    expect(fields.map((field) => field.id)).toEqual(["topic", "topic_2", "mood", "words"]);
    expect(fields[2]).toMatchObject({ type: "choice", options: ["Calm", "Fun"] });
    expect(fields[3]).toMatchObject({ type: "number", min: 10 });
    expect(fields[3]).not.toHaveProperty("max");
    expect(TemplateFileSchema.safeParse(input).success).toBe(true);
  });

  it("names new kinds from their names, without clashes", () => {
    const draft = emptyDraft();
    draft.name = "Blocky";
    draft.kinds = [{ ...newKind("Story"), id: "story" }, newKind("Story"), newKind("Educational")];
    expect(templateInputOf(draft).kinds?.map((kind) => kind.id)).toEqual([
      "story",
      "story-2",
      "educational",
    ]);
  });

  it("says plainly what is missing", () => {
    const draft = emptyDraft();
    expect(draftProblem(draft)).toBe("Give the template a name.");
    draft.name = "Quiz";
    draft.duration = "0";
    expect(draftProblem(draft)).toBe("The length must be a number of seconds, more than 0.");
    draft.duration = "8";
    expect(draftProblem(draft)).toBeNull();
    const kind = draft.kinds[0];
    if (!kind) throw new Error("no kind");
    kind.questions.push(newQuestion());
    expect(draftProblem(draft)).toBe('Each question needs its text (in "Default").');
    kind.questions[0] = { ...newQuestion(), label: "Mood", type: "choice" };
    expect(draftProblem(draft)).toBe('"Mood" needs at least one choice (one per line).');
    kind.questions[0] = { ...newQuestion(), label: "Words", type: "number", min: "9", max: "3" };
    expect(draftProblem(draft)).toBe('"Words": the smallest number is bigger than the largest.');
  });

  it("moves items up and down", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
