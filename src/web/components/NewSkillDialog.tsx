import { useEffect, useId, useRef, useState } from "react";
import { useCreateSkill } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { TextField } from "./TextField.tsx";

interface NewSkillDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Writes a new skill of the user's own: a name, when Claude should use it, and what to do. */
export function NewSkillDialog({ open, onClose }: NewSkillDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const instructionsId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const create = useCreateSkill();
  const { reset } = create;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName("");
      setDescription("");
      setInstructions("");
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset]);

  const ready = name.trim() && description.trim() && instructions.trim();

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
          create.mutate({ name, description, instructions }, { onSuccess: onClose });
        }}
      >
        <h2 id={headingId} className="dialog-title">
          New skill
        </h2>
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value.toLowerCase().replaceAll(" ", "-"))}
          placeholder="my-style"
          maxLength={64}
          autoComplete="off"
          hint="Small letters, numbers and dashes. In Claude Code it's /my-style."
        />
        <div className="field">
          <label htmlFor={descriptionId} className="field-label">
            When should Claude use it?
          </label>
          <textarea
            id={descriptionId}
            className="px-input px-textarea"
            rows={2}
            maxLength={1000}
            value={description}
            placeholder="When making any film for my channel, or when I ask for my style."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={instructionsId} className="field-label">
            What should Claude do?
          </label>
          <textarea
            id={instructionsId}
            className="px-input px-textarea"
            rows={9}
            value={instructions}
            placeholder={
              "Use warm colors: #ef7d57 and #ffcd75 on a dark navy background.\nCaptions: one word at a time, white with a black outline.\nEnd every film on the logo for 1.5 seconds."
            }
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
        {create.error && <p className="field-error">{create.error.message}</p>}
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancel
          </PixelButton>
          <PixelButton type="submit" icon="plus" disabled={create.isPending || !ready}>
            Create skill
          </PixelButton>
        </div>
      </form>
    </dialog>
  );
}
