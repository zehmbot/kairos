import { type ReactNode, useId, useRef } from "react";

export interface Tab<T extends string> {
  id: T;
  label: string;
  /** A small number on the tab (open notes, sounds...); hidden when 0. */
  count?: number;
}

/** One panel at a time, chosen with tabs (arrow keys move between them). */
export function SideTabs<T extends string>({
  tabs,
  current,
  onChange,
  label,
  children,
}: {
  tabs: readonly Tab<T>[];
  current: T;
  onChange: (tab: T) => void;
  label: string;
  children: ReactNode;
}) {
  const base = useId();
  const buttons = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const move = (by: number) => {
    const index = tabs.findIndex((tab) => tab.id === current);
    const next = tabs[(index + by + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    buttons.current[next.id]?.focus();
  };

  return (
    <div className="side-tabs-wrap">
      <div className="side-tabs" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`${base}-${tab.id}`}
            aria-selected={tab.id === current}
            aria-controls={`${base}-panel`}
            tabIndex={tab.id === current ? 0 : -1}
            className="side-tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(1);
              if (event.key === "ArrowLeft") move(-1);
            }}
          >
            {tab.label}
            {tab.count ? <span className="side-tab-count">{tab.count}</span> : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-${current}`}
        className="side-tab-panel"
      >
        {children}
      </div>
    </div>
  );
}
