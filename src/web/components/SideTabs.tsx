import { type ReactNode, useId, useRef } from "react";
import { PixelMenu } from "./PixelMenu.tsx";

export interface Tab<T extends string> {
  id: T;
  label: string;
  /** A small number on the tab (open notes, sounds...); hidden when 0. */
  count?: number;
  /** The number says something needs you (lines to update): it shows in another colour. */
  alert?: boolean;
}

/** The More tab's place among the tabs, for the arrow keys. */
const MORE = "\u0000more";

/**
 * One panel at a time, chosen with tabs (arrow keys move between them). Panels you open less often sit under a
 * More tab, which lights up while one of them shows.
 */
export function SideTabs<T extends string>({
  tabs,
  more = [],
  current,
  onChange,
  label,
  children,
}: {
  tabs: readonly Tab<T>[];
  /** Tabs under More. */
  more?: readonly Tab<T>[];
  current: T;
  onChange: (tab: T) => void;
  label: string;
  children: ReactNode;
}) {
  const base = useId();
  const buttons = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const inMore = more.some((tab) => tab.id === current);
  const order: string[] = [...tabs.map((tab) => tab.id), ...(more.length > 0 ? [MORE] : [])];
  // Moving onto More only reaches it (Enter or ↓ opens it); moving onto a tab shows it.
  const move = (from: string, by: number) => {
    const next = order[(order.indexOf(from) + by + order.length) % order.length];
    if (next === undefined) return;
    if (next === MORE) {
      document.getElementById(`${base}-more`)?.focus();
      return;
    }
    onChange(next as T);
    buttons.current[next as T]?.focus();
  };
  const arrows = (from: string) => (event: { key: string }) => {
    if (event.key === "ArrowRight") move(from, 1);
    if (event.key === "ArrowLeft") move(from, -1);
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
            onKeyDown={arrows(tab.id)}
          >
            {tab.label}
            {tab.count ? (
              <span className="side-tab-count" data-alert={tab.alert ? "" : undefined}>
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
        {more.length > 0 && (
          <PixelMenu
            label="More panels"
            items={more.map((tab) => ({
              id: tab.id,
              label: tab.count ? `${tab.label} (${tab.count})` : tab.label,
              current: tab.id === current,
              onSelect: () => onChange(tab.id),
            }))}
          >
            {(trigger) => (
              <button
                {...trigger}
                type="button"
                role="tab"
                id={`${base}-more`}
                aria-selected={inMore}
                aria-controls={`${base}-panel`}
                tabIndex={inMore ? 0 : -1}
                className="side-tab side-tab-more"
                onKeyDown={(event) => {
                  trigger.onKeyDown(event);
                  arrows(MORE)(event);
                }}
              >
                More
              </button>
            )}
          </PixelMenu>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={inMore ? `${base}-more` : `${base}-${current}`}
        className="side-tab-panel"
      >
        {children}
      </div>
    </div>
  );
}
