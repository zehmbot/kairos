/** Where a tooltip goes: centred above its button, below it near the top edge, always inside the window. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TipPlace {
  left: number;
  top: number;
  side: "above" | "below";
}

/** The gap between the button and the tooltip, and the room kept to the window's edges (pixels). */
const GAP = 6;
const MARGIN = 4;

export function placeTip(
  anchor: Box,
  tip: { width: number; height: number },
  view: { width: number; height: number },
): TipPlace {
  const centred = anchor.left + anchor.width / 2 - tip.width / 2;
  const left = Math.round(Math.max(MARGIN, Math.min(centred, view.width - tip.width - MARGIN)));
  const above = anchor.top - GAP - tip.height;
  if (above >= MARGIN) return { left, top: Math.round(above), side: "above" };
  const below = Math.min(anchor.top + anchor.height + GAP, view.height - tip.height - MARGIN);
  return { left, top: Math.round(Math.max(MARGIN, below)), side: "below" };
}
