/**
 * The template editor's form, and turning it into a template's settings (`TemplateInput`): ids made from the
 * question text (old ids kept, so earlier briefs still match), choices from lines, numbers from text.
 */
import type {
  FilmShape,
  TemplateField,
  TemplateInput,
  TemplateKind,
  TemplateSummary,
} from "../shared/types.ts";
import { DEFAULT_FPS } from "../shared/types.ts";

export type QuestionType = TemplateField["type"];

export const QUESTION_TYPES: { type: QuestionType; label: string }[] = [
  { type: "text", label: "Short text" },
  { type: "longtext", label: "Long text (a script, a story...)" },
  { type: "choice", label: "Choice" },
  { type: "number", label: "Number" },
];

export interface DraftQuestion {
  /** For React lists only. */
  key: string;
  /** The saved id, kept when editing; new questions get one from their text. */
  id?: string;
  label: string;
  type: QuestionType;
  required: boolean;
  placeholder: string;
  hint: string;
  /** One choice per line. */
  choices: string;
  min: string;
  max: string;
}

export interface DraftKind {
  key: string;
  id?: string;
  name: string;
  description: string;
  questions: DraftQuestion[];
}

export interface DraftTemplate {
  name: string;
  description: string;
  shape: FilmShape;
  fps: number;
  duration: string;
  /** A fixed size from the template, kept as it is (the editor doesn't change it). */
  size?: { width: number; height: number };
  kinds: DraftKind[];
}

let nextKey = 0;
const newKey = () => `k${++nextKey}`;

export function newQuestion(): DraftQuestion {
  return {
    key: newKey(),
    label: "",
    type: "text",
    required: false,
    placeholder: "",
    hint: "",
    choices: "",
    min: "",
    max: "",
  };
}

export function newKind(name = ""): DraftKind {
  return { key: newKey(), name, description: "", questions: [] };
}

export function emptyDraft(): DraftTemplate {
  return {
    name: "",
    description: "",
    shape: "wide",
    fps: DEFAULT_FPS,
    duration: "5",
    kinds: [newKind("Default")],
  };
}

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

function draftQuestion(field: TemplateField): DraftQuestion {
  return {
    key: newKey(),
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder ?? "",
    hint: field.hint ?? "",
    choices: (field.options ?? []).join("\n"),
    min: numberText(field.min),
    max: numberText(field.max),
  };
}

function draftKind(kind: TemplateKind): DraftKind {
  return {
    key: newKey(),
    id: kind.id,
    name: kind.name,
    description: kind.description,
    questions: kind.fields.map(draftQuestion),
  };
}

export function draftFromTemplate(template: TemplateSummary): DraftTemplate {
  return {
    name: template.name,
    description: template.description,
    shape: template.defaults.shape,
    fps: template.defaults.fps,
    duration: String(template.defaults.duration),
    size: template.defaults.size,
    kinds: template.kinds.length > 0 ? template.kinds.map(draftKind) : [newKind("Default")],
  };
}

/** Small letters, digits and `sep` from any text ("What's the topic?" → "what_s_the_topic"). */
function slug(text: string, sep: "_" | "-", maxLength: number): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "")
    .slice(0, maxLength)
    .replace(new RegExp(`\\${sep}+$`), "");
}

/** A question id from its text: small letters, digits and `_`, starting with a letter, at most 32. */
export function idFromLabel(label: string): string {
  const base = slug(label, "_", 28);
  return /^[a-z]/.test(base) ? base : `q_${base}`.replace(/_+$/, "").slice(0, 28) || "q";
}

/** A kind id from its name: small letters, digits and `-`. */
export function kindIdFromName(name: string): string {
  return slug(name, "-", 56) || "kind";
}

/** `base`, or `base_2`, `base_3`... so it isn't in `taken`. */
function unique(base: string, taken: Set<string>, sep: string): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}${sep}${n}`;
  taken.add(id);
  return id;
}

/** "3" → 3, "" → undefined, "abc" → NaN (the hub refuses it with a plain message). */
const numberOf = (text: string) => (text.trim() === "" ? undefined : Number(text));

export const choicesOf = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** The form as a template's settings, ready to send. */
export function templateInputOf(draft: DraftTemplate): TemplateInput {
  // Saved ids first, so a new question can never take an old one's id.
  const kindIds = new Set(draft.kinds.flatMap((kind) => (kind.id ? [kind.id] : [])));
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    defaults: {
      shape: draft.shape,
      fps: draft.fps,
      duration: Number(draft.duration),
      ...(draft.size ? { size: draft.size } : {}),
    },
    kinds: draft.kinds.map((kind) => {
      const fieldIds = new Set(
        kind.questions.flatMap((question) => (question.id ? [question.id] : [])),
      );
      return {
        id: kind.id ?? unique(kindIdFromName(kind.name), kindIds, "-"),
        name: kind.name.trim(),
        description: kind.description.trim(),
        fields: kind.questions.map((question) => {
          const field: TemplateField = {
            id: question.id ?? unique(idFromLabel(question.label), fieldIds, "_"),
            label: question.label.trim(),
            type: question.type,
            required: question.required,
          };
          if (question.placeholder.trim()) field.placeholder = question.placeholder.trim();
          if (question.hint.trim()) field.hint = question.hint.trim();
          if (question.type === "choice") field.options = choicesOf(question.choices);
          if (question.type === "number") {
            const min = numberOf(question.min);
            const max = numberOf(question.max);
            if (min !== undefined) field.min = min;
            if (max !== undefined) field.max = max;
          }
          return field;
        }),
      };
    }),
  };
}

/** Moves item `index` one place up (-1) or down (+1). */
export function move<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

const isNumber = (text: string) => text.trim() === "" || Number.isFinite(Number(text));

/** The first problem in the form, said plainly, or null when it can be saved. */
export function draftProblem(draft: DraftTemplate): string | null {
  if (!draft.name.trim()) return "Give the template a name.";
  const duration = Number(draft.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "The length must be a number of seconds, more than 0.";
  }
  if (draft.kinds.length === 0) return "A template needs at least one kind of film.";
  for (const kind of draft.kinds) {
    if (!kind.name.trim()) return "Each kind of film needs a name.";
    for (const question of kind.questions) {
      const label = question.label.trim();
      if (!label) return `Each question needs its text (in "${kind.name.trim()}").`;
      if (question.type === "choice" && choicesOf(question.choices).length === 0) {
        return `"${label}" needs at least one choice (one per line).`;
      }
      if (question.type === "number") {
        if (!isNumber(question.min) || !isNumber(question.max)) {
          return `"${label}": the smallest and largest numbers must be numbers.`;
        }
        const min = numberOf(question.min);
        const max = numberOf(question.max);
        if (min !== undefined && max !== undefined && min > max) {
          return `"${label}": the smallest number is bigger than the largest.`;
        }
      }
    }
  }
  return null;
}
