import { useEffect, useId, useRef } from "react";
import { formatSize, type MediaKind } from "../../shared/media.ts";
import type { Asset } from "../../shared/types.ts";
import { useAssets } from "../api.ts";
import { AssetPreview } from "./AssetPreview.tsx";
import { PixelButton } from "./PixelButton.tsx";

const KIND_PLURAL: Record<MediaKind, string> = {
  image: "pictures",
  video: "videos",
  sound: "sounds",
  font: "fonts",
};

/** Picks a file from the asset library (only the given kinds). */
export function AssetPicker({
  open,
  kinds,
  title,
  onPick,
  onClose,
  busy,
}: {
  open: boolean;
  kinds: readonly MediaKind[];
  title: string;
  onPick: (asset: Asset) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const assets = useAssets(open);
  const list = (assets.data ?? []).filter((asset) => kinds.includes(asset.kind));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const what = kinds.map((kind) => KIND_PLURAL[kind]).join(" or ");

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-dialog-wide px-box"
      aria-labelledby={headingId}
      onClose={onClose}
    >
      <div className="form">
        <h2 id={headingId} className="dialog-title">
          {title}
        </h2>
        {assets.isPending && <p>Loading your assets…</p>}
        {assets.isError && <p className="field-error">{assets.error.message}</p>}
        {assets.isSuccess && list.length === 0 && (
          <p>No {what} in your assets yet. Import some on the Assets page.</p>
        )}
        <ul className="asset-pick-list">
          {list.map((asset) => (
            <li key={asset.id} className="asset-pick-row px-box">
              <span className="asset-pick-preview">
                <AssetPreview asset={asset} small />
              </span>
              <span className="asset-pick-name">
                {asset.name}
                <span className="hint">{formatSize(asset.size)}</span>
              </span>
              <PixelButton
                data-size="small"
                icon="plus"
                disabled={busy}
                onClick={() => onPick(asset)}
              >
                Add
              </PixelButton>
            </li>
          ))}
        </ul>
        <div className="form-actions">
          <PixelButton variant="ghost" onClick={onClose}>
            Close
          </PixelButton>
        </div>
      </div>
    </dialog>
  );
}
