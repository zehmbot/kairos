import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router";
import { acceptFor, formatSize, MEDIA_KINDS, type MediaKind } from "../../shared/media.ts";
import type { Asset } from "../../shared/types.ts";
import {
  queryKeys,
  useAssets,
  useDeleteAsset,
  useFilms,
  useOpenAssetsFolder,
  useUseAsset,
  useWorkspace,
} from "../api.ts";
import { AssetPreview } from "../components/AssetPreview.tsx";
import { DropZone, FileButton, UploadStatus, useUploads } from "../components/DropZone.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";

const FILTERS: { kind: MediaKind | "all"; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "image", label: "Images" },
  { kind: "video", label: "Videos" },
  { kind: "sound", label: "Sounds" },
  { kind: "font", label: "Fonts" },
];
const ACCEPT = acceptFor(MEDIA_KINDS);

/** The asset library: files shared by all films, for you and for Claude. */
export function AssetsPage() {
  const workspace = useWorkspace();
  const hasWorkspace = Boolean(workspace.data?.path);
  const assets = useAssets(hasWorkspace);
  const queryClient = useQueryClient();
  const openFolder = useOpenAssetsFolder();
  const uploads = useUploads(() => queryClient.invalidateQueries({ queryKey: queryKeys.assets }));
  const [filter, setFilter] = useState<MediaKind | "all">("all");
  const [done, setDone] = useState<string | null>(null);

  const add = (files: File[]) =>
    uploads.send(files, (file) => `/api/assets?name=${encodeURIComponent(file.name)}`);
  const list = (assets.data ?? []).filter((asset) => filter === "all" || asset.kind === filter);
  // An empty library shows Import files in its middle: then it's not in the header too (one main button).
  const empty = assets.isSuccess && assets.data.length === 0;

  const importButton = (
    <FileButton accept={ACCEPT} onFiles={add} disabled={uploads.busy} variant="primary">
      Import files
    </FileButton>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Assets</h1>
        <p>
          Your images, videos, sounds and fonts, ready to use in any film. Claude can use them too.
        </p>
      </div>

      {!hasWorkspace ? (
        <PixelPanel title="Library">
          <p>
            Your assets live in your films folder. Choose it on the{" "}
            <Link to="/films">Films page</Link> first.
          </p>
        </PixelPanel>
      ) : (
        <DropZone onFiles={add} label="Drop to import" className="drop-page">
          <PixelPanel
            title="Library"
            actions={
              <div className="panel-actions">
                <PixelButton variant="ghost" icon="folder" onClick={() => openFolder.mutate()}>
                  Folder
                </PixelButton>
                {!empty && importButton}
              </div>
            }
          >
            <div className="stack">
              <UploadStatus status={uploads.status} error={uploads.error} />
              {done && <Notice title="Added">{done}</Notice>}
              {assets.isError && <p className="field-error">{assets.error.message}</p>}
              {empty ? (
                <EmptyState icon="folder" title="No assets yet" actions={importButton}>
                  Drag files here, or import them: pictures, videos, sounds and fonts. Then use them
                  in any film.
                </EmptyState>
              ) : (
                <>
                  <fieldset className="tool-group">
                    <legend className="visually-hidden">Show</legend>
                    {FILTERS.map((entry) => (
                      <PixelButton
                        key={entry.kind}
                        variant="ghost"
                        data-size="small"
                        aria-pressed={filter === entry.kind}
                        onClick={() => setFilter(entry.kind)}
                      >
                        {entry.label}
                      </PixelButton>
                    ))}
                  </fieldset>
                  {list.length === 0 && assets.isSuccess && (
                    <p className="hint">Nothing of this kind yet.</p>
                  )}
                  <div className="film-grid">
                    {list.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} onUsed={setDone} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </PixelPanel>
        </DropZone>
      )}
    </div>
  );
}

function AssetCard({ asset, onUsed }: { asset: Asset; onUsed: (message: string) => void }) {
  const films = useFilms();
  const use = useUseAsset();
  const remove = useDeleteAsset();
  const [using, setUsing] = useState(false);
  const [film, setFilm] = useState("");
  const [confirm, setConfirm] = useState(false);
  const selectId = useId();
  const usable = (films.data ?? []).filter((entry) => entry.config && !entry.problem);
  const chosen = film || usable[0]?.id || "";
  const error = use.error ?? remove.error;

  return (
    <div className="asset-card px-box">
      <div className="asset-preview">
        <AssetPreview asset={asset} />
      </div>
      <div className="template-tile-body">
        <h3 className="film-card-title">{asset.name}</h3>
        <p className="film-card-meta">{formatSize(asset.size)}</p>
        {using ? (
          <div className="stack">
            <label htmlFor={selectId} className="field-label">
              Which film?
            </label>
            <select
              id={selectId}
              className="px-input"
              value={chosen}
              onChange={(event) => setFilm(event.target.value)}
            >
              {usable.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.config?.title ?? entry.id}
                </option>
              ))}
            </select>
            <div className="note-actions">
              <PixelButton
                data-size="small"
                icon="plus"
                disabled={!chosen || use.isPending}
                onClick={() =>
                  use.mutate(
                    { id: asset.id, film: chosen },
                    {
                      onSuccess: ({ path }) => {
                        const title =
                          usable.find((entry) => entry.id === chosen)?.config?.title ?? chosen;
                        onUsed(
                          asset.kind === "sound"
                            ? `${asset.name} is now a sound track in "${title}".`
                            : `${asset.name} is in "${title}" as ${path}. Tell Claude to use it.`,
                        );
                        setUsing(false);
                      },
                    },
                  )
                }
              >
                Add
              </PixelButton>
              <PixelButton variant="ghost" data-size="small" onClick={() => setUsing(false)}>
                Cancel
              </PixelButton>
            </div>
          </div>
        ) : confirm ? (
          <div className="note-actions">
            <span className="note-confirm">Delete this file?</span>
            <PixelButton
              data-size="small"
              data-tone="danger"
              icon="trash"
              disabled={remove.isPending}
              onClick={() => remove.mutate(asset.id)}
            >
              Delete
            </PixelButton>
            <PixelButton variant="ghost" data-size="small" onClick={() => setConfirm(false)}>
              Keep
            </PixelButton>
          </div>
        ) : (
          <div className="note-actions">
            <PixelButton
              variant="ghost"
              data-size="small"
              icon="plus"
              disabled={usable.length === 0}
              onClick={() => setUsing(true)}
            >
              Use in a film
            </PixelButton>
            <PixelButton
              variant="ghost"
              data-size="small"
              data-tone="danger"
              icon="trash"
              aria-label={`Delete ${asset.name}`}
              tip="Delete"
              onClick={() => setConfirm(true)}
            />
          </div>
        )}
        {error && <p className="field-error">{error.message}</p>}
      </div>
    </div>
  );
}
