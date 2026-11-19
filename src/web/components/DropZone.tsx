import { type ReactNode, useRef, useState } from "react";
import { uploadFile } from "../api.ts";
import type { IconName } from "../icons/icons.ts";
import { PixelButton } from "./PixelButton.tsx";

/**
 * Sends files one after the other, with a progress line ("Adding rain.mp3… 45%").
 * `urlFor` gives the upload address of each file; `onSent` runs after each one.
 */
export function useUploads(onSent: () => void) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (files: readonly File[], urlFor: (file: File) => string) => {
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of files) {
        setStatus(`Adding ${file.name}…`);
        await uploadFile(urlFor(file), file, (fraction) =>
          setStatus(`Adding ${file.name}… ${Math.round(fraction * 100)}%`),
        );
        onSent();
      }
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return { send, status, error, busy };
}

/** Shows the upload line and its error, if any. */
export function UploadStatus({ status, error }: { status: string | null; error: string | null }) {
  if (error) return <p className="field-error">{error}</p>;
  if (status) return <p className="upload-status">{status}</p>;
  return null;
}

/** A button that opens the computer's file picker. */
export function FileButton({
  accept,
  multiple = true,
  onFiles,
  disabled,
  icon = "plus",
  variant = "ghost",
  children,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  icon?: IconName;
  variant?: "primary" | "ghost";
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <PixelButton
        variant={variant}
        icon={icon}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </PixelButton>
    </>
  );
}

/** Files dropped anywhere on its area go to `onFiles`. It lights up while a file is dragged over it. */
export function DropZone({
  onFiles,
  label,
  children,
  className,
}: {
  onFiles: (files: File[]) => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping files is a shortcut; the Add buttons inside do the same with the keyboard.
    <div
      className={className ? `drop-zone ${className}` : "drop-zone"}
      data-active={active ? "true" : undefined}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current++;
        setActive(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        onFiles([...event.dataTransfer.files]);
      }}
    >
      {children}
      {active && <div className="drop-zone-label">{label}</div>}
    </div>
  );
}
