import type { ReactNode } from "react";
import { PixelIcon } from "./PixelIcon.tsx";

interface NoticeProps {
  title: string;
  children: ReactNode;
}

/** A warning box: something needs the user's (or Claude's) attention. */
export function Notice({ title, children }: NoticeProps) {
  return (
    <div className="notice px-box" role="alert">
      <PixelIcon name="warning" size={32} />
      <div className="notice-body">
        <h3>{title}</h3>
        <div className="notice-text">{children}</div>
      </div>
    </div>
  );
}
