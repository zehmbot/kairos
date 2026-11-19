import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FILM_SHAPES, type FilmShape } from "../../shared/types.ts";
import { useDuplicateTemplate, useSaveTemplateSettings, useTemplate } from "../api.ts";
import { BackLink } from "../components/BackLink.tsx";
import { FrameRatePicker, useFrameRate } from "../components/FrameRatePicker.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { QuestionEditor } from "../components/QuestionEditor.tsx";
import { TextField } from "../components/TextField.tsx";
import {
  type DraftKind,
  type DraftTemplate,
  draftFromTemplate,
  draftProblem,
  emptyDraft,
  move,
  newKind,
  newQuestion,
  templateInputOf,
} from "../templateForm.ts";

const SHAPES = Object.entries(FILM_SHAPES) as [FilmShape, (typeof FILM_SHAPES)[FilmShape]][];

/** New template (`/templates/new`) or Edit one of the user's (`/templates/:id`): settings and questions. */
export function TemplateEditorPage() {
  const { id } = useParams();
  const editing = id ?? null;
  const template = useTemplate(editing);
  const save = useSaveTemplateSettings(editing);
  const duplicate = useDuplicateTemplate();
  const navigate = useNavigate();
  const rate = useFrameRate(30);
  const resetRate = rate.reset;
  const descriptionId = useId();
  const shapeId = useId();

  const [draft, setDraft] = useState<DraftTemplate>(emptyDraft);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Fill the form once the template arrives (and again when another one is opened).
  useEffect(() => {
    if (!editing || !template.data || loadedFor === editing) return;
    const next = draftFromTemplate(template.data);
    setDraft(next);
    resetRate(next.fps);
    setLoadedFor(editing);
  }, [editing, template.data, loadedFor, resetRate]);

  const setKind = (index: number, kind: DraftKind) =>
    setDraft((current) => ({
      ...current,
      kinds: current.kinds.map((entry, at) => (at === index ? kind : entry)),
    }));

  const submit = () => {
    const withRate = { ...draft, fps: rate.fps ?? draft.fps };
    const found = rate.fps === null ? "Pick a frame rate." : draftProblem(withRate);
    setProblem(found);
    if (found) return;
    save.mutate(templateInputOf(withRate), { onSuccess: () => navigate("/templates") });
  };

  const heading = editing ? "Edit template" : "New template";

  if (editing && template.isPending) {
    return (
      <div className="page">
        <BackLink to="/templates" label="Templates" />
        <p>Loading the template...</p>
      </div>
    );
  }
  if (editing && template.isError) {
    return (
      <div className="page">
        <BackLink to="/templates" label="Templates" />
        <Notice title="Kairos can't open this template">{template.error.message}</Notice>
      </div>
    );
  }
  const builtin = editing && template.data?.source === "kairos" ? template.data : null;
  if (builtin) {
    return (
      <div className="page">
        <BackLink to="/templates" label="Templates" />
        <Notice title="This is one of Kairos' templates">
          Kairos' own templates can't be changed (an update of Kairos would undo your changes).
          Duplicate it to make your own copy, then change that one.
        </Notice>
        <div className="form-actions">
          <PixelButton
            disabled={duplicate.isPending}
            onClick={() =>
              duplicate.mutate(builtin.id, {
                onSuccess: (copy) => navigate(`/templates/${encodeURIComponent(copy.id)}`),
              })
            }
          >
            Duplicate
          </PixelButton>
        </div>
        {duplicate.error && <p className="field-error">{duplicate.error.message}</p>}
      </div>
    );
  }

  const many = draft.kinds.length > 1;

  return (
    <div className="page">
      <BackLink to="/templates" label="Templates" />
      <div className="page-head">
        <h1>{heading}</h1>
        <p>
          {editing
            ? "Change its settings and the questions people answer before Claude builds the film."
            : "Set the questions people answer before Claude builds the film. New templates start from the blank film."}
        </p>
      </div>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <PixelPanel title="About">
          <div className="form">
            <TextField
              label="Name"
              value={draft.name}
              maxLength={60}
              placeholder="Bedtime story"
              autoComplete="off"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <div className="field">
              <label htmlFor={descriptionId} className="field-label">
                Description (optional)
              </label>
              <textarea
                id={descriptionId}
                className="px-input px-textarea"
                rows={3}
                maxLength={300}
                value={draft.description}
                placeholder="What films this template makes, in a sentence or two."
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>
            <div className="question-grid">
              {draft.size ? (
                <p className="hint question-wide">
                  Size: {draft.size.width} × {draft.size.height} (fixed by this template).
                </p>
              ) : (
                <div className="field">
                  <label htmlFor={shapeId} className="field-label">
                    Shape
                  </label>
                  <select
                    id={shapeId}
                    className="px-input"
                    value={draft.shape}
                    onChange={(event) =>
                      setDraft({ ...draft, shape: event.target.value as FilmShape })
                    }
                  >
                    {SHAPES.map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label} ({info.ratio})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <TextField
                label="Length (seconds)"
                inputMode="decimal"
                value={draft.duration}
                onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
              />
            </div>
            <FrameRatePicker state={rate} />
          </div>
        </PixelPanel>

        {draft.kinds.map((kind, index) => (
          <PixelPanel
            key={kind.key}
            title={many ? `Kind ${index + 1}: ${kind.name.trim() || "no name yet"}` : "Questions"}
            actions={
              many ? (
                <PixelButton
                  variant="ghost"
                  data-size="small"
                  data-tone="danger"
                  icon="trash"
                  onClick={() =>
                    setDraft({ ...draft, kinds: draft.kinds.filter((_, at) => at !== index) })
                  }
                >
                  Remove kind
                </PixelButton>
              ) : undefined
            }
          >
            <div className="stack">
              {many && (
                <div className="question-grid">
                  <TextField
                    label="Kind name"
                    value={kind.name}
                    maxLength={60}
                    placeholder="Story"
                    onChange={(event) => setKind(index, { ...kind, name: event.target.value })}
                  />
                  <div className="question-wide">
                    <TextField
                      label="Description (optional)"
                      value={kind.description}
                      maxLength={300}
                      placeholder="A short story told by a narrator."
                      onChange={(event) =>
                        setKind(index, { ...kind, description: event.target.value })
                      }
                    />
                  </div>
                </div>
              )}
              {kind.questions.length === 0 ? (
                <p className="hint">
                  No questions yet: people will only give the film a name. Add questions for what
                  Claude needs to know, like a script, a topic or a mood.
                </p>
              ) : (
                <ol className="question-list">
                  {kind.questions.map((question, at) => (
                    <QuestionEditor
                      key={question.key}
                      question={question}
                      number={at + 1}
                      isFirst={at === 0}
                      isLast={at === kind.questions.length - 1}
                      onChange={(changed) =>
                        setKind(index, {
                          ...kind,
                          questions: kind.questions.map((entry, i) => (i === at ? changed : entry)),
                        })
                      }
                      onMove={(by) =>
                        setKind(index, { ...kind, questions: move(kind.questions, at, by) })
                      }
                      onRemove={() =>
                        setKind(index, {
                          ...kind,
                          questions: kind.questions.filter((_, i) => i !== at),
                        })
                      }
                    />
                  ))}
                </ol>
              )}
              <div>
                <PixelButton
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    setKind(index, { ...kind, questions: [...kind.questions, newQuestion()] })
                  }
                >
                  Add question
                </PixelButton>
              </div>
            </div>
          </PixelPanel>
        ))}

        <div className="stack">
          <div>
            <PixelButton
              variant="ghost"
              icon="plus"
              onClick={() => setDraft({ ...draft, kinds: [...draft.kinds, newKind()] })}
            >
              Add a kind of film
            </PixelButton>
          </div>
          <p className="hint">
            For a template that makes several kinds of film, like Story and Educational: each kind
            has its own questions, and New film asks which kind to make.
          </p>
          <p className="hint">
            To change how films from this template look: make a film from it, change the film with
            Claude, then press Save as template on the film's page.
          </p>
        </div>

        {(problem ?? save.error) && (
          <p className="field-error" role="alert">
            {problem ?? save.error?.message}
          </p>
        )}
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={() => navigate("/templates")}>
            Cancel
          </PixelButton>
          <PixelButton type="submit" icon="check" disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save template"}
          </PixelButton>
        </div>
      </form>
    </div>
  );
}
