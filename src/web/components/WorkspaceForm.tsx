import { useState } from "react";
import { useSetWorkspace } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { TextField } from "./TextField.tsx";

interface WorkspaceFormProps {
  /** Path shown when the form opens. */
  initialPath: string;
  /** The workspace in use now, if any: saving it again is pointless, so the button waits for a change. */
  currentPath?: string | null;
  submitLabel: string;
}

/** Picks the folder where Kairos keeps films. */
export function WorkspaceForm({ initialPath, currentPath, submitLabel }: WorkspaceFormProps) {
  const [path, setPath] = useState(initialPath);
  const setWorkspace = useSetWorkspace();
  const unchanged = currentPath != null && path.trim() === currentPath;

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        setWorkspace.mutate(path);
      }}
    >
      <TextField
        label="Folder"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        hint="Kairos makes a films folder inside it."
        error={setWorkspace.error?.message}
      />
      <div className="form-actions">
        <PixelButton
          type="submit"
          icon="folder"
          disabled={setWorkspace.isPending || !path.trim() || unchanged}
        >
          {submitLabel}
        </PixelButton>
      </div>
    </form>
  );
}
