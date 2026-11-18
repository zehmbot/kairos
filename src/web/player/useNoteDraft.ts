import { useMemo, useState } from "react";
import type { NoteShape, NoteTool } from "../../shared/types.ts";

/** The note being written: where it is, what's drawn, what it says. */
export interface NoteDraft {
  tool: NoteTool;
  shapes: NoteShape[];
  text: string;
  /**
   * The frame the note is about, in seconds. `null` while the note is empty: it then belongs to
   * whatever frame is showing. The first mark, word or "Range" pins it to the frame of that moment.
   */
  t: number | null;
  /** True when the note covers a range of frames. */
  range: boolean;
  /** End of the range, once "End here" was pressed. */
  until: number | null;
}

const EMPTY = { shapes: [], text: "", t: null, range: false, until: null } as const;

/** Nothing drawn, written or chosen yet. */
export function isEmptyDraft(draft: NoteDraft): boolean {
  return draft.shapes.length === 0 && draft.text.trim() === "" && !draft.range;
}

/** Pins the note to `now` once it has content, and lets go again when it is emptied. */
export function settleDraft(draft: NoteDraft, now: number): NoteDraft {
  if (isEmptyDraft(draft)) return { ...draft, t: null, until: null };
  return draft.t === null ? { ...draft, t: now } : draft;
}

export function useNoteDraft() {
  const [draft, setDraft] = useState<NoteDraft>({ tool: "box", ...EMPTY, shapes: [] });

  const actions = useMemo(() => {
    const change = (update: (draft: NoteDraft) => Partial<NoteDraft>, now = 0) =>
      setDraft((current) => settleDraft({ ...current, ...update(current) }, now));
    return {
      /** Empties the note (the tool stays). */
      clear: () => setDraft((current) => ({ ...current, ...EMPTY, shapes: [] })),
      setTool: (tool: NoteTool) => setDraft((current) => ({ ...current, tool })),
      addShape: (shape: NoteShape, now: number) =>
        change((current) => ({ shapes: [...current.shapes, shape] }), now),
      undo: () => change((current) => ({ shapes: current.shapes.slice(0, -1) })),
      setText: (text: string, now: number) => change(() => ({ text }), now),
      setRange: (range: boolean, now: number) => change(() => ({ range, until: null }), now),
      setUntil: (until: number) => change(() => ({ until })),
    };
  }, []);

  return { draft, ...actions };
}

export type NoteDraftActions = Omit<ReturnType<typeof useNoteDraft>, "draft">;
