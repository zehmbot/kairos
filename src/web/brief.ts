import type { BriefAnswers, TemplateField } from "../shared/types.ts";

/** The form's starting values: earlier answers, else each question's default, else empty. */
export function initialAnswers(
  fields: readonly TemplateField[],
  existing: BriefAnswers = {},
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const value =
        existing[field.id] ?? field.default ?? (field.type === "choice" ? field.options?.[0] : "");
      return [field.id, value === undefined ? "" : String(value)];
    }),
  );
}

/** The first required question left empty, said plainly, or null when the form can be sent. */
export function firstMissing(
  fields: readonly TemplateField[],
  values: Record<string, string>,
): string | null {
  const missing = fields.find((field) => field.required && !(values[field.id] ?? "").trim());
  return missing ? `Please answer: ${missing.label}` : null;
}

/** The answers to send (empty ones left out; the hub checks and converts them). */
export function answersOf(values: Record<string, string>): BriefAnswers {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
}
