import type { ReactNode } from "react";
import type { IconName } from "../icons/icons.ts";
import { PixelIcon } from "./PixelIcon.tsx";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <div className="empty">
      <PixelIcon name={icon} size={64} />
      <h3>{title}</h3>
      <p>{children}</p>
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
