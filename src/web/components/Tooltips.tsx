import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeTip, type TipPlace } from "../tooltip.ts";

/** How long the pointer rests on a button before its name shows (ms). The keyboard shows it at once. */
const WAIT = 350;

/** Tips longer than this many letters are sentences. */
const LONG = 48;

interface Shown {
  text: string;
  anchor: Element;
  /** Inside the open dialog when there is one: a modal dialog sits above everything else on the page. */
  container: Element;
}

const tipOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest("[data-tip]") : null;

/**
 * Short names for icon buttons: any element with `data-tip` shows it in a small pixel box when pointed at or
 * reached with the keyboard. One layer for the whole app, drawn outside scrolling boxes so it is never cut.
 */
export function Tooltips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [place, setPlace] = useState<TipPlace | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = (anchor: Element) => {
      const text = anchor.getAttribute("data-tip");
      // A button whose menu is open doesn't cover it with its name.
      if (!text || anchor.getAttribute("aria-expanded") === "true") return;
      setPlace(null);
      setShown({ text, anchor, container: anchor.closest("dialog[open]") ?? document.body });
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      setShown(null);
    };
    const over = (event: PointerEvent) => {
      const anchor = tipOf(event.target);
      if (!anchor || event.pointerType === "touch") return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => show(anchor), WAIT);
    };
    const out = (event: PointerEvent) => {
      const anchor = tipOf(event.target);
      if (anchor && !anchor.contains(event.relatedTarget as Node | null)) hide();
    };
    const focus = (event: FocusEvent) => {
      const anchor = tipOf(event.target);
      if (anchor?.matches(":focus-visible")) show(anchor);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // Measure the box once it is drawn, then put it in its place.
  useLayoutEffect(() => {
    if (!shown || !bubble.current) return;
    if (!shown.anchor.isConnected) {
      setShown(null);
      return;
    }
    const box = bubble.current.getBoundingClientRect();
    setPlace(
      placeTip(
        shown.anchor.getBoundingClientRect(),
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [shown]);

  if (!shown) return null;
  return createPortal(
    <div
      ref={bubble}
      className="px-tip"
      role="tooltip"
      data-side={place?.side}
      // A sentence (the rest of a hint) wraps, in the text font; a button's name stays on one line.
      data-long={shown.text.length > LONG ? "" : undefined}
      style={
        place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }
      }
    >
      {shown.text}
    </div>,
    shown.container,
  );
}
