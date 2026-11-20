import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  BLANK_TEMPLATE_ID,
  DEFAULT_FPS,
  FILM_SHAPES,
  type FilmShape,
  type TemplateSummary,
} from "../../shared/types.ts";
import { templatePreviewUrl, useCreateFilm, useTemplates, useVoiceStatus } from "../api.ts";
import { answersOf, firstMissing, initialAnswers } from "../brief.ts";
import { BriefFields } from "./BriefFields.tsx";
import { FrameRatePicker, useFrameRate } from "./FrameRatePicker.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";
import { TextField } from "./TextField.tsx";

const SHAPES = Object.entries(FILM_SHAPES) as [FilmShape, (typeof FILM_SHAPES)[FilmShape]][];
/** Size of the little shape pictures, in CSS pixels. */
const SHAPE_BOX = 64;

interface NewFilmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Start from this template, at the details step (Use on the Templates page). */
  templateId?: string;
}

type Step = "start" | "template" | "details";

/**
 * New film: first "Blank film" or "From a template" (then a template and its kind), then the details and
 * the template's questions.
 */
export function NewFilmDialog({ open, onClose, templateId: preset }: NewFilmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const templateName = useId();
  const kindName = useId();
  const templates = useTemplates();
  const create = useCreateFilm();
  const navigate = useNavigate();
  const rate = useFrameRate(DEFAULT_FPS);

  const [step, setStep] = useState<Step>("start");
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE_ID);
  // Set when the dialog opens: the chosen template's defaults are applied once the templates are here.
  const [needsDefaults, setNeedsDefaults] = useState(false);
  const [kindId, setKindId] = useState("");
  const [title, setTitle] = useState("");
  const [shape, setShape] = useState<FilmShape>("wide");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [voices, setVoices] = useState<"make" | "none">("make");
  const voiceStatus = useVoiceStatus();

  const list = templates.data ?? [];
  const choices = list.filter((entry) => entry.id !== BLANK_TEMPLATE_ID);
  const template = list.find((entry) => entry.id === templateId);
  const kind = template?.kinds.find((entry) => entry.id === kindId) ?? template?.kinds[0];
  const isBlank = templateId === BLANK_TEMPLATE_ID;
  const { reset } = create;
  const resetRate = rate.reset;

  /** Picks a template (and its first kind) with its defaults. */
  const choose = (next: TemplateSummary, nextKind = next.kinds[0]) => {
    setTemplateId(next.id);
    setKindId(nextKind?.id ?? "");
    setShape(next.defaults.shape);
    resetRate(next.defaults.fps);
    setAnswers(initialAnswers(nextKind?.fields ?? []));
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setStep(preset ? "details" : "start");
      setTemplateId(preset ?? BLANK_TEMPLATE_ID);
      setNeedsDefaults(true);
      setTitle("");
      setFormError(null);
      setVoices("make");
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, preset, reset]);

  // Once the templates are here, apply the chosen template's defaults (shape, frame rate, its form).
  useEffect(() => {
    if (!needsDefaults || !template) return;
    setNeedsDefaults(false);
    choose(template);
  });

  /** "Blank film" or "From a template" on the first step. */
  const startBlank = () => {
    const blank = list.find((entry) => entry.id === BLANK_TEMPLATE_ID);
    if (blank) choose(blank);
    setStep("details");
  };
  const startFromTemplate = () => {
    const first = choices.find((entry) => !entry.problem);
    if (isBlank && first) choose(first);
    setStep("template");
  };

  const create_ = () => {
    if (!template || !kind || rate.fps === null) return;
    const missing = firstMissing(kind.fields, answers);
    if (missing) {
      setFormError(missing);
      return;
    }
    setFormError(null);
    create.mutate(
      {
        title,
        shape,
        fps: rate.fps,
        template: template.id,
        kind: kind.id,
        brief: answersOf(answers),
        voices,
      },
      {
        onSuccess: (film) => {
          onClose();
          navigate(`/films/${encodeURIComponent(film.id)}`);
        },
      },
    );
  };

  const fixedSize = template?.defaults.size;

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-dialog-wide px-box"
      aria-labelledby={headingId}
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "template") setStep("details");
          else if (step === "details") create_();
        }}
      >
        <h2 id={headingId} className="dialog-title">
          New film
          {step === "details" && template ? ` · ${isBlank ? "Blank film" : template.name}` : ""}
        </h2>

        {step === "start" ? (
          <>
            <p>How do you want to start?</p>
            <div className="start-cards">
              <button type="button" className="choice-card start-card" onClick={startBlank}>
                <PixelIcon name="film" size={32} />
                <span className="choice-label">Blank film</span>
                <span className="choice-sub">A simple film you build with Claude, any style.</span>
              </button>
              <button type="button" className="choice-card start-card" onClick={startFromTemplate}>
                <PixelIcon name="template" size={32} />
                <span className="choice-label">From a template</span>
                <span className="choice-sub">
                  Start from a ready look, and answer its questions (a script, a topic...).
                </span>
              </button>
            </div>
            {templates.isError && <p className="field-error">{templates.error.message}</p>}
            <div className="form-actions">
              <PixelButton variant="ghost" onClick={onClose}>
                Cancel
              </PixelButton>
            </div>
          </>
        ) : step === "template" ? (
          <>
            <fieldset className="choice-picker">
              <legend className="field-label">Choose a template</legend>
              {templates.isPending && <p>Loading templates...</p>}
              {templates.isError && <p className="field-error">{templates.error.message}</p>}
              {templates.isSuccess && choices.length === 0 && (
                <p>
                  There are no templates yet. Make one on the{" "}
                  <Link to="/templates" onClick={onClose}>
                    Templates page
                  </Link>
                  , or open a film and press Save as template.
                </p>
              )}
              <div className="template-cards">
                {choices.map((entry) => (
                  <label
                    key={entry.id}
                    className="choice-card template-card"
                    data-disabled={entry.problem ? "true" : undefined}
                  >
                    <input
                      type="radio"
                      name={templateName}
                      checked={template?.id === entry.id}
                      disabled={Boolean(entry.problem)}
                      onChange={() => choose(entry)}
                      className="visually-hidden"
                    />
                    <span className="template-preview">
                      {entry.hasPreview ? (
                        <img src={templatePreviewUrl(entry.id)} alt="" />
                      ) : (
                        <PixelIcon name="film" size={32} />
                      )}
                    </span>
                    <span className="choice-label">
                      {entry.name}
                      {entry.source === "yours" && (
                        <span className="px-tag template-yours">Yours</span>
                      )}
                    </span>
                    <span className="template-description">
                      {entry.problem ?? entry.description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {template && template.kinds.length > 1 && (
              <fieldset className="choice-picker">
                <legend className="field-label">What kind of film?</legend>
                <div className="choice-cards">
                  {template.kinds.map((entry) => (
                    <label key={entry.id} className="choice-card">
                      <input
                        type="radio"
                        name={kindName}
                        checked={kind?.id === entry.id}
                        onChange={() => choose(template, entry)}
                        className="visually-hidden"
                      />
                      <span className="choice-label">{entry.name}</span>
                      <span className="choice-sub">{entry.description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="form-actions">
              <PixelButton variant="ghost" icon="arrowLeft" onClick={() => setStep("start")}>
                Back
              </PixelButton>
              <PixelButton
                type="submit"
                disabled={!template || isBlank || Boolean(template.problem)}
              >
                Next
              </PixelButton>
            </div>
          </>
        ) : (
          <>
            <TextField
              label="Name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="My first film"
              maxLength={80}
              autoComplete="off"
            />
            {fixedSize ? (
              <p className="hint">
                Size: {fixedSize.width} × {fixedSize.height} (set by the template).
              </p>
            ) : (
              <fieldset className="choice-picker">
                <legend className="field-label">Shape</legend>
                <div className="choice-cards">
                  {SHAPES.map(([key, info]) => {
                    const fit = SHAPE_BOX / Math.max(info.width, info.height);
                    return (
                      <label key={key} className="choice-card">
                        <input
                          type="radio"
                          name="shape"
                          value={key}
                          checked={shape === key}
                          onChange={() => setShape(key)}
                          className="visually-hidden"
                        />
                        <span className="shape-box">
                          <span
                            className="shape-preview"
                            style={{
                              width: Math.round(info.width * fit),
                              height: Math.round(info.height * fit),
                            }}
                          />
                        </span>
                        <span className="choice-label">{info.label}</span>
                        <span className="choice-sub">{info.ratio}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <FrameRatePicker state={rate} />
            {kind && kind.fields.length > 0 && (
              <BriefFields
                fields={kind.fields}
                values={answers}
                onChange={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))}
              />
            )}
            <fieldset className="voice-choice">
              <legend className="field-label">Voices</legend>
              <label className="check-row">
                <input
                  type="radio"
                  name="voices"
                  checked={voices === "make"}
                  onChange={() => setVoices("make")}
                />
                <span>
                  Make them with the film: Claude writes the narration and the characters' lines,
                  and each speaker gets a fitting voice (uses fish.audio credits).
                </span>
              </label>
              <label className="check-row">
                <input
                  type="radio"
                  name="voices"
                  checked={voices === "none"}
                  onChange={() => setVoices("none")}
                />
                <span>No voices</span>
              </label>
              {voices === "make" && voiceStatus.isSuccess && !voiceStatus.data.key && (
                <p className="hint">
                  Add your fish.audio key in Settings → Voice. Until then, the script and the
                  voices' choice are made, and the voices wait for your key.
                </p>
              )}
            </fieldset>
            {(formError ?? create.error) && (
              <p className="field-error">{formError ?? create.error?.message}</p>
            )}
            <div className="form-actions">
              <PixelButton
                variant="ghost"
                icon="arrowLeft"
                onClick={() => setStep(isBlank ? "start" : "template")}
              >
                Back
              </PixelButton>
              <PixelButton
                type="submit"
                icon="plus"
                disabled={create.isPending || !title.trim() || rate.fps === null}
              >
                {create.isPending ? "Creating..." : "Create film"}
              </PixelButton>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
