import type { ReactNode } from "react";
import { PixelIcon } from "./PixelIcon.tsx";

/** A small "i" that shows `text` when pointed at or reached with the keyboard: the rest of a one-line hint. */
export function InfoTip({ text }: { text: string }) {
  return (
    <button type="button" className="info-tip" data-tip={text} aria-label={text}>
      <PixelIcon name="info" size={16} />
    </button>
  );
}

/** A one-line hint, with the rest of it behind an "i". */
export function Hint({ more, children }: { more?: string; children: ReactNode }) {
  return (
    <p className="hint">
      {children}
      {more && <InfoTip text={more} />}
    </p>
  );
}
