import { useId } from "react";
import type { TemplateField } from "../../shared/types.ts";

interface BriefFieldsProps {
  fields: readonly TemplateField[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
}

/** A template's questions as form fields (used by New film and Edit brief). */
export function BriefFields({ fields, values, onChange }: BriefFieldsProps) {
  const base = useId();
  return (
    <>
      {fields.map((field) => {
        const id = `${base}-${field.id}`;
        const hintId = `${id}-hint`;
        const value = values[field.id] ?? "";
        const common = {
          id,
          "aria-describedby": field.hint ? hintId : undefined,
          required: field.required,
        };
        return (
          <div key={field.id} className="field">
            <label htmlFor={id} className="field-label">
              {field.label}
              {field.required && <span className="field-required"> *</span>}
            </label>
            {field.type === "longtext" ? (
              <textarea
                {...common}
                className="px-input px-textarea"
                rows={6}
                value={value}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            ) : field.type === "choice" ? (
              <select
                {...common}
                className="px-input"
                value={value}
                onChange={(event) => onChange(field.id, event.target.value)}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                className="px-input"
                type={field.type === "number" ? "number" : "text"}
                min={field.min}
                max={field.max}
                step={field.type === "number" ? "any" : undefined}
                value={value}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            )}
            {field.hint && (
              <p id={hintId} className="field-hint">
                {field.hint}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
