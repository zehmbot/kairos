import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { acceptFor, type MediaKind } from "../../shared/media.ts";
import type { Asset } from "../../shared/types.ts";
import { queryKeys, uploadFile } from "../api.ts";
import {
  type FileGroup,
  groupFiles,
  PURPOSE_TEXT,
  type Purpose,
  purposesFor,
  tabFor,
  uploadUrl,
} from "../filmAdd.ts";
import type { IconName } from "../icons/icons.ts";
import { AssetPicker } from "./AssetPicker.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";

export type SideTab = "claude" | "notes" | "sound" | "voice" | "references" | "brief" | "sheets";

const KIND_LABEL: Record<MediaKind, [string, string]> = {
  sound: ["sound", "sounds"],
  video: ["video", "videos"],
  image: ["picture", "pictures"],
  font: ["font", "fonts"],
};

const describeGroup = (group: FileGroup) =>
  group.files.length === 1
    ? (group.files[0]?.name ?? "")
    : `${group.files.length} ${KIND_LABEL[group.kind][1]}: ${group.files.map((f) => f.name).join(", ")}`;

async function sendJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = await response.json().catch(() => null);
  if (!response.ok) throw new Error(answer?.message ?? `The hub answered ${response.status}.`);
  return answer;
}

/**
 * Sends files (or library assets) to a film for their purposes, one after the other, with a progress line.
 * `onTab` opens the side tab that shows the result.
 */
export function useFilmAdds(filmId: string, now: () => number, onTab: (tab: SideTab) => void) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = (purpose: Purpose) => {
    if (purpose === "sound" || purpose === "clip")
      void queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId) });
    if (purpose === "reference")
      void queryClient.invalidateQueries({ queryKey: queryKeys.references(filmId) });
    if (purpose === "library") void queryClient.invalidateQueries({ queryKey: queryKeys.assets });
  };

  const finish = (purposes: Set<Purpose>, copied: string[]) => {
    const tab = [...purposes].map(tabFor).find(Boolean);
    if (tab) onTab(tab);
    const notes: string[] = [];
    if (copied.length) {
      notes.push(
        copied.length === 1
          ? `Copied to ${copied[0]}. Tell Claude to use it in the film.`
          : `Copied ${copied.length} files into the film's assets folder. Tell Claude to use them.`,
      );
    }
    if (purposes.has("library")) notes.push("Saved in your assets.");
    setMessage(notes.length ? notes.join(" ") : null);
  };

  /** Files with a purpose for each kind. */
  const addFiles = async (
    groups: readonly FileGroup[],
    choice: Partial<Record<MediaKind, Purpose>>,
  ) => {
    setError(null);
    setMessage(null);
    const purposes = new Set<Purpose>();
    const copied: string[] = [];
    try {
      for (const group of groups) {
        const purpose =
          choice[group.kind] ?? purposesFor(group.kind, group.files[0]?.name ?? "")[0];
        if (!purpose) continue;
        for (const file of group.files) {
          setStatus(`Adding ${file.name}…`);
          const answer = (await uploadFile(
            uploadUrl(filmId, purpose, file.name, now()),
            file,
            (f) => setStatus(`Adding ${file.name}… ${Math.round(f * 100)}%`),
          )) as { path?: string } | null;
          if (purpose === "film" && answer?.path) copied.push(answer.path);
          purposes.add(purpose);
          refresh(purpose);
        }
      }
      finish(purposes, copied);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setStatus(null);
    }
  };

  /** A file from the library, for a purpose. */
  const addAsset = async (asset: Asset, purpose: Purpose) => {
    setError(null);
    setMessage(null);
    setStatus(`Adding ${asset.name}…`);
    const film = `/api/films/${encodeURIComponent(filmId)}`;
    try {
      const copied: string[] = [];
      if (purpose === "sound")
        await sendJson(`${film}/sounds/from-asset`, { asset: asset.id, start: now() });
      else if (purpose === "clip")
        await sendJson(`${film}/clips/from-asset`, { asset: asset.id, start: now() });
      else if (purpose === "reference")
        await sendJson(`${film}/references/from-asset`, { asset: asset.id });
      else {
        const answer = await sendJson(`/api/assets/${asset.id}/use`, { film: filmId });
        if (answer?.path) copied.push(answer.path);
      }
      refresh(purpose);
      finish(new Set([purpose]), copied);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setStatus(null);
    }
  };

  /** Sounds dropped on the timeline: at that time, on that track (several files: one track each). */
  const addSoundsAt = async (files: readonly File[], start: number, lane: number) => {
    setError(null);
    setMessage(null);
    try {
      for (const [i, file] of files.entries()) {
        setStatus(`Adding ${file.name}…`);
        await uploadFile(
          `${uploadUrl(filmId, "sound", file.name, start)}&lane=${Math.min(31, lane + i)}`,
          file,
          (f) => setStatus(`Adding ${file.name}… ${Math.round(f * 100)}%`),
        );
        refresh("sound");
      }
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setStatus(null);
    }
  };

  /** Videos and pictures dropped on the timeline: at that time, on that video track (none: a new one each). */
  const addClipsAt = async (files: readonly File[], start: number, lane?: number) => {
    setError(null);
    setMessage(null);
    try {
      for (const [i, file] of files.entries()) {
        setStatus(`Adding ${file.name}…`);
        const onLane = lane === undefined ? "" : `&lane=${Math.min(15, lane + i)}`;
        await uploadFile(`${uploadUrl(filmId, "clip", file.name, start)}${onLane}`, file, (f) =>
          setStatus(`Adding ${file.name}… ${Math.round(f * 100)}%`),
        );
        refresh("clip");
      }
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setStatus(null);
    }
  };

  return {
    addFiles,
    addAsset,
    addSoundsAt,
    addClipsAt,
    status,
    error,
    message,
    clearMessage: () => setMessage(null),
  };
}

/** Files dropped (or picked) without a purpose yet, or a library asset. */
export type Pending = { files: File[] } | { asset: Asset };

/** "What is this for?": one choice per kind of file, only the purposes that fit. */
export function PurposeDialog({
  pending,
  onCancel,
  onFiles,
  onAsset,
}: {
  pending: Pending | null;
  onCancel: () => void;
  onFiles: (groups: FileGroup[], choice: Partial<Record<MediaKind, Purpose>>) => void;
  onAsset: (asset: Asset, purpose: Purpose) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const nameBase = useId();
  const [choice, setChoice] = useState<Partial<Record<MediaKind, Purpose>>>({});

  const asset = pending && "asset" in pending ? pending.asset : null;
  const { groups, unknown } =
    pending && "files" in pending ? groupFiles(pending.files) : { groups: [], unknown: [] };
  const rows: { kind: MediaKind; title: string; options: Purpose[] }[] = asset
    ? [{ kind: asset.kind, title: asset.name, options: purposesFor(asset.kind, asset.name, true) }]
    : groups.map((group) => ({
        kind: group.kind,
        title: describeGroup(group),
        options: purposesFor(group.kind, group.files[0]?.name ?? ""),
      }));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      setChoice({});
      dialog.showModal();
    } else if (!pending && dialog.open) dialog.close();
  }, [pending]);

  const chosen = (kind: MediaKind, options: Purpose[]) => choice[kind] ?? options[0];

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-dialog-wide px-box"
      aria-labelledby={headingId}
      onClose={onCancel}
    >
      {pending && (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (asset) {
              const purpose = chosen(asset.kind, rows[0]?.options ?? []);
              if (purpose) onAsset(asset, purpose);
            } else {
              const full = Object.fromEntries(
                rows.map((row) => [row.kind, chosen(row.kind, row.options)]),
              );
              onFiles(groups, full);
            }
          }}
        >
          <h2 id={headingId} className="dialog-title">
            Add to this film
          </h2>
          {rows.map((row) => (
            <fieldset key={row.kind} className="choice-picker">
              <legend className="field-label purpose-file">What is this for? {row.title}</legend>
              <div className="choice-cards purpose-cards">
                {row.options.map((purpose) => (
                  <label key={purpose} className="choice-card">
                    <input
                      type="radio"
                      name={`${nameBase}-${row.kind}`}
                      checked={chosen(row.kind, row.options) === purpose}
                      onChange={() => setChoice((current) => ({ ...current, [row.kind]: purpose }))}
                      className="visually-hidden"
                    />
                    <span className="choice-label">{PURPOSE_TEXT[purpose].label}</span>
                    <span className="choice-sub">{PURPOSE_TEXT[purpose].sub}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {unknown.length > 0 && (
            <p className="field-error">
              Kairos can't use {unknown.map((file) => file.name).join(", ")}: add pictures, videos,
              sounds or fonts.
            </p>
          )}
          <div className="form-actions">
            <PixelButton variant="ghost" onClick={onCancel}>
              Cancel
            </PixelButton>
            <PixelButton type="submit" icon="plus" disabled={rows.length === 0}>
              Add
            </PixelButton>
          </div>
        </form>
      )}
    </dialog>
  );
}

const ADD_CHOICES: {
  purpose: Purpose;
  icon: IconName;
  label: string;
  sub: string;
  kinds: MediaKind[];
}[] = [
  {
    purpose: "sound",
    icon: "sound",
    label: "Sound",
    sub: "A voice, music or sound effects",
    kinds: ["sound"],
  },
  {
    purpose: "reference",
    icon: "film",
    label: "Reference",
    sub: "A video or picture for Claude to copy the style of",
    kinds: ["video", "image"],
  },
  {
    purpose: "film",
    icon: "box",
    label: "File for the film",
    sub: "A picture, video or font Claude puts in the film",
    kinds: ["image", "video", "font"],
  },
];

/** The Add button's window: pick what to add, then the file (or a file from your assets). */
export function AddDialog({
  open,
  onClose,
  onFiles,
  onAsset,
}: {
  open: boolean;
  onClose: () => void;
  onFiles: (purpose: Purpose, files: File[]) => void;
  onAsset: (asset: Asset) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const inputs = useRef<Partial<Record<Purpose, HTMLInputElement | null>>>({});
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <dialog
        ref={dialogRef}
        className="px-dialog px-dialog-wide px-box"
        aria-labelledby={headingId}
        onClose={onClose}
      >
        <div className="form">
          <h2 id={headingId} className="dialog-title">
            Add to this film
          </h2>
          <div className="start-cards add-cards">
            {ADD_CHOICES.map((choice) => (
              <button
                key={choice.purpose}
                type="button"
                className="choice-card start-card"
                onClick={() => inputs.current[choice.purpose]?.click()}
              >
                <PixelIcon name={choice.icon} size={32} />
                <span className="choice-label">{choice.label}</span>
                <span className="choice-sub">{choice.sub}</span>
              </button>
            ))}
            <button
              type="button"
              className="choice-card start-card"
              onClick={() => setPicking(true)}
            >
              <PixelIcon name="folder" size={32} />
              <span className="choice-label">From my assets</span>
              <span className="choice-sub">A file you already keep in Kairos</span>
            </button>
          </div>
          {ADD_CHOICES.map((choice) => (
            <input
              key={choice.purpose}
              ref={(element) => {
                inputs.current[choice.purpose] = element;
              }}
              type="file"
              multiple
              accept={acceptFor(choice.kinds)}
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              data-purpose={choice.purpose}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length) onFiles(choice.purpose, files);
              }}
            />
          ))}
          <p className="hint">Tip: you can also drop files anywhere on this page.</p>
          <div className="form-actions">
            <PixelButton variant="ghost" onClick={onClose}>
              Close
            </PixelButton>
          </div>
        </div>
      </dialog>
      <AssetPicker
        open={picking}
        kinds={["sound", "video", "image", "font"]}
        title="Add from your assets"
        onClose={() => setPicking(false)}
        onPick={(asset) => {
          setPicking(false);
          onAsset(asset);
        }}
      />
    </>
  );
}
