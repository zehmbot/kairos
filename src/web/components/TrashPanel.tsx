import { useState } from "react";
import type { TrashEntry } from "../../shared/types.ts";
import { useTrash, useTrashAction } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

/** Deleted films: Restore, Delete for good, Empty trash. Shown only when the trash isn't empty. */
export function TrashPanel() {
  const trash = useTrash(true);
  const empty = useTrashAction();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const items = trash.data ?? [];
  if (items.length === 0) return null;

  return (
    <PixelPanel
      title={`Trash (${items.length})`}
      actions={
        confirmEmpty ? (
          <div className="panel-actions">
            <span className="note-confirm">Delete them all for good?</span>
            <PixelButton
              data-size="small"
              data-tone="danger"
              icon="trash"
              disabled={empty.isPending}
              onClick={() =>
                empty.mutate({ action: "delete" }, { onSuccess: () => setConfirmEmpty(false) })
              }
            >
              Empty trash
            </PixelButton>
            <PixelButton variant="ghost" data-size="small" onClick={() => setConfirmEmpty(false)}>
              Keep
            </PixelButton>
          </div>
        ) : (
          <PixelButton variant="ghost" icon="trash" onClick={() => setConfirmEmpty(true)}>
            Empty trash
          </PixelButton>
        )
      }
    >
      <div className="stack">
        <p className="hint">
          Deleted films wait here until you restore them or delete them for good.
        </p>
        {empty.error && <p className="field-error">{empty.error.message}</p>}
        <ul className="render-list">
          {items.map((item) => (
            <TrashRow key={item.entry} item={item} />
          ))}
        </ul>
      </div>
    </PixelPanel>
  );
}

function TrashRow({ item }: { item: TrashEntry }) {
  const action = useTrashAction();
  const [confirm, setConfirm] = useState(false);

  return (
    <li className="render-row px-box">
      <div className="render-head">
        <span className="render-title">{item.title}</span>
        <span className="render-date">Deleted {new Date(item.deletedAt).toLocaleString()}</span>
      </div>
      <div className="note-actions">
        <PixelButton
          data-size="small"
          icon="undo"
          disabled={action.isPending}
          onClick={() => action.mutate({ entry: item.entry, action: "restore" })}
        >
          Restore
        </PixelButton>
        {confirm ? (
          <>
            <span className="note-confirm">This can't be undone. Delete for good?</span>
            <PixelButton
              data-size="small"
              data-tone="danger"
              icon="trash"
              disabled={action.isPending}
              onClick={() => action.mutate({ entry: item.entry, action: "delete" })}
            >
              Delete for good
            </PixelButton>
            <PixelButton variant="ghost" data-size="small" onClick={() => setConfirm(false)}>
              Keep
            </PixelButton>
          </>
        ) : (
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="trash"
            onClick={() => setConfirm(true)}
          >
            Delete for good
          </PixelButton>
        )}
      </div>
      {action.error && <p className="field-error">{action.error.message}</p>}
    </li>
  );
}
