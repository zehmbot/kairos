import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  BLANK_TEMPLATE_ID,
  DEFAULT_FPS,
  FILM_SHAPES,
  type FilmShape,
  type FilmVoice,
  NARRATION_LANGUAGES,
  type TemplateField,
  type TemplateSummary,
} from "../../shared/types.ts";
import {
  templatePreviewUrl,
  useClaude,
  useCreateFilm,
  usePickVoice,
  useTemplates,
  useVoiceStatus,
} from "../api.ts";
import { answersOf, firstMissing, initialAnswers } from "../brief.ts";
import { useSample } from "../useSample.ts";
import { AssetPicker } from "./AssetPicker.tsx";
import { BriefFields } from "./BriefFields.tsx";
import { FrameRatePicker, useFrameRate } from "./FrameRatePicker.tsx";
import { InfoTip } from "./InfoTip.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";
import { TextField } from "./TextField.tsx";
import { VoicePicker } from "./VoicePicker.tsx";

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

/** Up front: what a film can't start without (required), and the long text a film is made from (a story, an idea). */
const isMainField = (field: TemplateField) => field.required || field.type === "longtext";

/** A short answer for the summary line. */
const shortAnswer = (value: string) => (value.length > 28 ? `${value.slice(0, 27)}…` : value);

/**
 * New film: first "Blank film" or "From a template" (then a template and its kind), then a short form: the name,
 * what the film is about, voices and Claude. Everything with a good default (shape, frame rate, the template's other questions, the
 * narrator, music) waits under More choices, said on one line while it's closed.
 */
export function NewFilmDialog({ open, onClose, templateId: preset }: NewFilmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const templateName = useId();
  const kindName = useId();
  const moreId = useId();
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
  const [moreOpen, setMoreOpen] = useState(false);
  const voiceStatus = useVoiceStatus();
  // Claude makes the film right after Create, in the background (when Claude Code is installed).
  const [makeNow, setMakeNow] = useState(true);
  // Music from your assets, under the voice.
  const [music, setMusic] = useState<{ id: string; name: string } | null>(null);
  const [pickingMusic, setPickingMusic] = useState(false);
  const claude = useClaude();
  const claudeReady = claude.data ? Boolean(claude.data.cli) : true;
  // The narrator's voice, picked when the window opens (free) and changed here before anything is made.
  const [narrator, setNarrator] = useState<FilmVoice | null>(null);
  const [language, setLanguage] = useState("en");
  const [pickedFor, setPickedFor] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const pick = usePickVoice();
  const { mutate: pickVoice } = pick;
  const sample = useSample();
  const languageId = useId();

  useEffect(() => {
    if (!open || voices !== "make" || pickedFor === language) return;
    setPickedFor(language);
    pickVoice({ type: "narrator", language }, { onSuccess: (voice) => setNarrator(voice) });
  }, [open, voices, language, pickedFor, pickVoice]);

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
      setMoreOpen(false);
      setMakeNow(true);
      setMusic(null);
      setNarrator(null);
      setLanguage("en");
      setPickedFor(null);
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
    setMoreOpen(false);
    setStep("details");
  };
  const startFromTemplate = () => {
    const first = choices.find((entry) => !entry.problem);
    if (isBlank && first) choose(first);
    setMoreOpen(false);
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
        make: makeNow && claudeReady,
        ...(music ? { music: music.id } : {}),
        ...(voices === "make" && narrator
          ? { narrator: { ...narrator, type: "narrator" as const }, language }
          : voices === "make"
            ? { language }
            : {}),
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
  const fields = kind?.fields ?? [];
  const mainFields = fields.filter(isMainField);
  const otherFields = fields.filter((field) => !isMainField(field));
  const languageWords = NARRATION_LANGUAGES.find(([code]) => code === language)?.[1];
  // What More choices will use, on one line while it's closed.
  const summary = [
    fixedSize ? `${fixedSize.width} × ${fixedSize.height}` : FILM_SHAPES[shape].label,
    rate.fps !== null ? `${rate.fps} fps` : null,
    ...otherFields.map((field) => {
      const value = (answers[field.id] ?? "").trim();
      return value ? shortAnswer(value) : null;
    }),
    voices === "make" && narrator ? `Narrator: ${narrator.name.trim()}` : null,
    voices === "make" && language !== "en" ? languageWords : null,
    music ? `Music: ${shortAnswer(music.name)}` : null,
  ].filter(Boolean);

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
                  , or open a film and choose More → Save as template.
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
            {mainFields.length > 0 && (
              <BriefFields
                fields={mainFields}
                values={answers}
                onChange={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))}
              />
            )}
            <div className="new-film-checks">
              <div className="check-line">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={voices === "make"}
                    onChange={(event) => setVoices(event.target.checked ? "make" : "none")}
                  />
                  <span>Voices</span>
                </label>
                <InfoTip text="Claude writes what the narrator and the characters say, and each speaker gets a fitting voice. Uses fish.audio credits." />
              </div>
              {voices === "make" && voiceStatus.isSuccess && !voiceStatus.data.key && (
                <p className="hint">
                  Add your fish.audio key in Settings → Voice: until then, the voices wait for it.
                </p>
              )}
              <div className="check-line">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={makeNow && claudeReady}
                    disabled={!claudeReady}
                    onChange={(event) => setMakeNow(event.target.checked)}
                  />
                  <span>Claude makes it now</span>
                </label>
                <InfoTip text="It starts as soon as you create the film, in the background (on your Claude plan). You watch it work on the film's page." />
              </div>
              {!claudeReady && (
                <p className="hint">
                  Install Claude Code (Settings → Claude Code) and Claude can make films right after
                  you create them.
                </p>
              )}
            </div>

            <div className="more-choices">
              <button
                type="button"
                className="more-choices-toggle"
                aria-expanded={moreOpen}
                aria-controls={moreId}
                onClick={() => setMoreOpen((now) => !now)}
              >
                <PixelIcon name={moreOpen ? "minus" : "plus"} size={16} />
                {moreOpen ? "Fewer choices" : "More choices"}
              </button>
              {!moreOpen && <p className="hint more-choices-summary">{summary.join(" · ")}</p>}
              {moreOpen && (
                <div id={moreId} className="stack">
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
                  {otherFields.length > 0 && (
                    <BriefFields
                      fields={otherFields}
                      values={answers}
                      onChange={(id, value) =>
                        setAnswers((current) => ({ ...current, [id]: value }))
                      }
                    />
                  )}
                  {voices === "make" && (
                    <fieldset className="voice-choice">
                      <legend className="field-label">Narrator</legend>
                      <div className="narrator-pick px-box">
                        <span className="voice-cast-name">
                          {pick.isPending
                            ? "Picking…"
                            : (narrator?.name ?? "Picked when the film is made")}
                        </span>
                        <div className="icon-row">
                          <PixelButton
                            variant="ghost"
                            data-size="small"
                            icon={sample.playing === "narrator" ? "pause" : "play"}
                            tip={sample.playing === "narrator" ? "Stop" : "Listen"}
                            disabled={!narrator?.sample}
                            onClick={() =>
                              narrator?.sample && sample.toggle("narrator", narrator.sample)
                            }
                          />
                          <PixelButton
                            variant="ghost"
                            data-size="small"
                            icon="dice"
                            tip="Another voice"
                            disabled={pick.isPending}
                            onClick={() =>
                              pickVoice(
                                {
                                  type: "narrator",
                                  language,
                                  avoid: narrator ? [narrator.id] : [],
                                },
                                { onSuccess: (voice) => setNarrator(voice) },
                              )
                            }
                          />
                          <PixelButton
                            variant="ghost"
                            data-size="small"
                            icon="search"
                            tip="Choose a voice"
                            onClick={() => setChoosing(true)}
                          />
                        </div>
                      </div>
                      <div className="writer-grid">
                        <label htmlFor={languageId} className="field-label">
                          Language
                        </label>
                        <select
                          id={languageId}
                          className="px-input"
                          value={language}
                          onChange={(event) => setLanguage(event.target.value)}
                        >
                          {NARRATION_LANGUAGES.map(([code, words]) => (
                            <option key={code} value={code}>
                              {words}
                            </option>
                          ))}
                        </select>
                      </div>
                      {pick.isError && (
                        <p className="hint">
                          Kairos couldn't reach fish.audio to pick one now: it picks the narrator
                          when the film is made.
                        </p>
                      )}
                    </fieldset>
                  )}
                  <fieldset className="voice-choice">
                    <legend className="field-label">Music</legend>
                    <div className="music-pick">
                      <span>{music ? music.name : "No music"}</span>
                      <PixelButton
                        variant="ghost"
                        data-size="small"
                        icon="folder"
                        onClick={() => setPickingMusic(true)}
                      >
                        {music ? "Change" : "From your assets"}
                      </PixelButton>
                      {music && (
                        <PixelButton
                          variant="ghost"
                          data-size="small"
                          icon="trash"
                          tip="No music"
                          onClick={() => setMusic(null)}
                        />
                      )}
                      <InfoTip text="It plays under the voice for the whole film, quieter while voices talk." />
                    </div>
                  </fieldset>
                </div>
              )}
            </div>

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
      <AssetPicker
        open={pickingMusic}
        kinds={["sound"]}
        title="Music for this film"
        busy={false}
        onClose={() => setPickingMusic(false)}
        onPick={(asset) => {
          setMusic({ id: asset.id, name: asset.name });
          setPickingMusic(false);
        }}
      />
      <VoicePicker
        open={choosing}
        speaker="the narrator"
        onClose={() => setChoosing(false)}
        onPick={(voice) => {
          setNarrator({ ...voice, type: "narrator", auto: false });
          setChoosing(false);
        }}
      />
    </dialog>
  );
}
