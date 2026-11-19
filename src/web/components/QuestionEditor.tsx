import { useId } from "react";
import { type DraftQuestion, QUESTION_TYPES, type QuestionType } from "../templateForm.ts";
import { PixelButton } from "./PixelButton.tsx";

interface QuestionEditorProps {
  question: DraftQuestion;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (question: DraftQuestion) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

/** One question of a template's form: its text, its type, and what the type needs. */
export function QuestionEditor({
  question,
  number,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: QuestionEditorProps) {
  const base = useId();
  const set = (change: Partial<DraftQuestion>) => onChange({ ...question, ...change });

  return (
    <li className="question-editor px-box">
      <div className="question-head">
        <span className="question-number">Question {number}</span>
        <div className="note-actions">
          <PixelButton
            variant="ghost"
            data-size="small"
            disabled={isFirst}
            aria-label={`Move question ${number} up`}
            onClick={() => onMove(-1)}
          >
            Up
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            disabled={isLast}
            aria-label={`Move question ${number} down`}
            onClick={() => onMove(1)}
          >
            Down
          </PixelButton>
          <PixelButton
            variant="ghost"
            data-size="small"
            data-tone="danger"
            icon="trash"
            aria-label={`Remove question ${number}`}
            onClick={onRemove}
          />
        </div>
      </div>

      <div className="question-grid">
        <div className="field question-wide">
          <label htmlFor={`${base}-label`} className="field-label">
            The question
          </label>
          <input
            id={`${base}-label`}
            className="px-input"
            value={question.label}
            maxLength={120}
            placeholder="What is the story about?"
            onChange={(event) => set({ label: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${base}-type`} className="field-label">
            Answer
          </label>
          <select
            id={`${base}-type`}
            className="px-input"
            value={question.type}
            onChange={(event) => set({ type: event.target.value as QuestionType })}
          >
            {QUESTION_TYPES.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <label className="check-row question-required">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(event) => set({ required: event.target.checked })}
          />
          <span>Must be answered</span>
        </label>

        {question.type === "choice" && (
          <div className="field question-wide">
            <label htmlFor={`${base}-choices`} className="field-label">
              Choices (one per line)
            </label>
            <textarea
              id={`${base}-choices`}
              className="px-input px-textarea"
              rows={4}
              value={question.choices}
              placeholder={"Funny\nCalm\nEpic"}
              onChange={(event) => set({ choices: event.target.value })}
            />
          </div>
        )}

        {question.type === "number" && (
          <>
            <div className="field">
              <label htmlFor={`${base}-min`} className="field-label">
                Smallest
              </label>
              <input
                id={`${base}-min`}
                className="px-input"
                inputMode="decimal"
                value={question.min}
                placeholder="Any"
                onChange={(event) => set({ min: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`${base}-max`} className="field-label">
                Largest
              </label>
              <input
                id={`${base}-max`}
                className="px-input"
                inputMode="decimal"
                value={question.max}
                placeholder="Any"
                onChange={(event) => set({ max: event.target.value })}
              />
            </div>
          </>
        )}

        {question.type !== "choice" && (
          <div className="field question-wide">
            <label htmlFor={`${base}-placeholder`} className="field-label">
              Example answer (optional, shown grey in the empty box)
            </label>
            <input
              id={`${base}-placeholder`}
              className="px-input"
              value={question.placeholder}
              maxLength={500}
              onChange={(event) => set({ placeholder: event.target.value })}
            />
          </div>
        )}
        <div className="field question-wide">
          <label htmlFor={`${base}-hint`} className="field-label">
            Help (optional, shown under the question)
          </label>
          <input
            id={`${base}-hint`}
            className="px-input"
            value={question.hint}
            maxLength={300}
            onChange={(event) => set({ hint: event.target.value })}
          />
        </div>
      </div>
    </li>
  );
}
