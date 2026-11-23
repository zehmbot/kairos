import { useState } from "react";
import { useBrief, useFilmClaude, useSaveBrief } from "../api.ts";
import { answersOf, firstMissing, initialAnswers } from "../brief.ts";
import { BriefFields } from "./BriefFields.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

/**
 * What you asked for when you made the film, with Edit brief. Claude reads it as brief.md. Until Claude has made
 * the film, it points to the Claude tab's Make it from the brief.
 */
export function BriefPanel({ filmId, onClaude }: { filmId: string; onClaude: () => void }) {
  const brief = useBrief(filmId, true);
  const save = useSaveBrief(filmId);
  const turns = useFilmClaude(filmId).data?.turns ?? [];
  // Made from the brief, or changed by Claude since (the film exists).
  const made = turns.some((turn) => turn.outcome === "done");
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const data = brief.data;

  const startEditing = () => {
    if (!data) return;
    setValues(initialAnswers(data.fields, data.answers));
    setFormError(null);
    save.reset();
    setEditing(true);
  };

  return (
    <PixelPanel
      title="Brief"
      actions={
        data &&
        !editing && (
          <PixelButton variant="ghost" icon="pen" onClick={startEditing}>
            Edit brief
          </PixelButton>
        )
      }
    >
      {brief.isPending ? (
        <p>Loading the brief...</p>
      ) : !data ? (
        <p className="field-error">{brief.error?.message ?? "This film has no brief."}</p>
      ) : editing ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            const missing = firstMissing(data.fields, values);
            if (missing) {
              setFormError(missing);
              return;
            }
            save.mutate(answersOf(values), { onSuccess: () => setEditing(false) });
          }}
        >
          <BriefFields
            fields={data.fields}
            values={values}
            onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
          />
          {(formError ?? save.error) && (
            <p className="field-error">{formError ?? save.error?.message}</p>
          )}
          <div className="form-actions">
            <PixelButton variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </PixelButton>
            <PixelButton type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save brief"}
            </PixelButton>
          </div>
        </form>
      ) : (
        <div className="stack">
          <dl className="brief-list">
            {data.fields.map((field) => (
              <div key={field.id} className="brief-item">
                <dt className="field-label">{field.label}</dt>
                <dd className="brief-answer">
                  {String(data.answers[field.id] ?? "") || "(no answer)"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            Made with the {data.templateName} template.{" "}
            {made ? "After editing the brief, ask Claude in the " : "Next: in the "}
            <button type="button" className="link-button" onClick={onClaude}>
              Claude tab
            </button>
            {made ? " to update the film." : ", press Make it from the brief."}
          </p>
        </div>
      )}
    </PixelPanel>
  );
}
