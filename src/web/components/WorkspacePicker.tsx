import { useState } from "react";
import type { Workspace } from "../../shared/types.ts";
import { usePickWorkspace } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { WorkspaceForm } from "./WorkspaceForm.tsx";

interface WorkspacePickerProps {
  workspace: Workspace;
  /** Button text, like "Choose folder" or "Change folder". */
  chooseLabel: string;
}

/**
 * Picks the workspace with the computer's own folder window. If this computer can't show one,
 * a box to type the folder path appears instead.
 */
export function WorkspacePicker({ workspace, chooseLabel }: WorkspacePickerProps) {
  const pick = usePickWorkspace();
  const [typePath, setTypePath] = useState(false);

  return (
    <div className="stack">
      {workspace.path && (
        <dl className="kv">
          <dt>Folder</dt>
          <dd>{workspace.path}</dd>
        </dl>
      )}

      {pick.isPending && (
        <p className="hint">
          A folder window is open. Choose a folder there. If you can't see it, it may be behind this
          window.
        </p>
      )}
      {pick.isError && !typePath && (
        <>
          <p className="field-error">{pick.error.message}</p>
          <div>
            <PixelButton variant="ghost" onClick={() => setTypePath(true)}>
              Type the path instead
            </PixelButton>
          </div>
        </>
      )}

      {typePath ? (
        <>
          {pick.data?.status === "unsupported" && (
            <p className="field-error">
              This computer can't show a folder window, so type the folder path instead.
            </p>
          )}
          <WorkspaceForm
            key={workspace.path ?? ""}
            initialPath={workspace.path ?? workspace.suggested}
            currentPath={workspace.path}
            submitLabel={workspace.path ? "Save folder" : "Use this folder"}
          />
        </>
      ) : (
        <div className="form-actions">
          <PixelButton
            icon="folder"
            disabled={pick.isPending}
            onClick={() =>
              pick.mutate(undefined, {
                onSuccess: (result) => setTypePath(result.status === "unsupported"),
              })
            }
          >
            {pick.isPending ? "Waiting..." : chooseLabel}
          </PixelButton>
        </div>
      )}
    </div>
  );
}
