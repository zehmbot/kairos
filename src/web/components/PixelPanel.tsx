import type { ReactNode } from "react";

interface PixelPanelProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PixelPanel({ title, actions, children }: PixelPanelProps) {
  return (
    <section className="px-panel px-box">
      <header className="px-panel-head">
        <h2>{title}</h2>
        {actions}
      </header>
      <div className="px-panel-body">{children}</div>
    </section>
  );
}
