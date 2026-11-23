import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { IconName } from "../icons/icons.ts";
import { PixelIcon } from "./PixelIcon.tsx";

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  /** Deleting and the like: shown in the danger colour. */
  danger?: boolean;
  disabled?: boolean;
  /** The one showing now (a tab under More). */
  current?: boolean;
  /** A short name shown when pointed at (the folder's path...). */
  tip?: string;
  onSelect: () => void;
}

/** What the menu's own button needs: put these on it. */
export interface MenuTrigger {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** Below the button, lined up with its right edge (`end`) or its left edge (`start`), inside the window. */
function placeMenu(
  button: DOMRect,
  menu: { width: number; height: number },
  align: "start" | "end",
) {
  const gap = 6;
  const margin = 8;
  const left = align === "end" ? button.right - menu.width : button.left;
  const below = button.bottom + gap;
  const top =
    below + menu.height > window.innerHeight - margin && button.top - gap - menu.height > margin
      ? button.top - gap - menu.height
      : below;
  return {
    left: Math.max(margin, Math.min(left, window.innerWidth - menu.width - margin)),
    top,
  };
}

/** The entries of an open menu that can be picked. */
const menuEntries = (list: HTMLElement | null) =>
  [...(list?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])].filter(
    (entry) => !entry.disabled,
  );

/**
 * A button that opens a short list of actions (More). The list is drawn over the page, outside scrolling boxes, so
 * it is never cut, and follows its button when the page scrolls. It closes on a pick, a click elsewhere, Escape,
 * or when its button leaves the window. Arrow keys move through it.
 */
export function PixelMenu({
  label,
  items,
  align = "end",
  children,
}: {
  /** The menu's name for screen readers ("More for this film"). */
  label: string;
  items: readonly MenuItem[];
  align?: "start" | "end";
  /** Draws the button, with the trigger's props spread on it. */
  children: (trigger: MenuTrigger) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setPlace(null);
    if (refocus) button.current?.focus();
  }, []);

  const entries = () => menuEntries(list.current);

  /** Puts the list by its button; false when the button is out of the window. */
  const reposition = useCallback((): boolean => {
    if (!button.current || !list.current) return false;
    const at = button.current.getBoundingClientRect();
    if (at.bottom < 0 || at.top > window.innerHeight) return false;
    const box = list.current.getBoundingClientRect();
    setPlace(placeMenu(at, { width: box.width, height: box.height }, align));
    return true;
  }, [align]);

  // Measure the list once it is drawn, then put it in its place.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // Once it shows (a hidden list can't take focus), the keyboard is on its first entry.
  const placed = place !== null;
  useLayoutEffect(() => {
    if (open && placed) menuEntries(list.current)[0]?.focus({ preventScroll: true });
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    const follow = () => {
      if (!reposition()) close(false);
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, close, reposition]);

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = entries();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (index: number) => all[(index + all.length) % all.length]?.focus();
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(all.length - 1);
    else if (event.key === "Escape") close(true);
    else if (event.key === "Tab") close(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
  };

  const trigger: MenuTrigger = {
    ref: button,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    onClick: () => (open ? close(false) : setOpen(true)),
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    },
  };

  return (
    <>
      {children(trigger)}
      {open &&
        createPortal(
          <div
            ref={list}
            className="px-menu px-box"
            role="menu"
            aria-label={label}
            style={place ?? { left: 0, top: 0, visibility: "hidden" }}
            onKeyDown={onListKey}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="px-menu-item"
                data-tone={item.danger ? "danger" : undefined}
                aria-current={item.current ? "true" : undefined}
                data-tip={item.tip}
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon && <PixelIcon name={item.icon} size={16} />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          button.current?.closest("dialog[open]") ?? document.body,
        )}
    </>
  );
}
