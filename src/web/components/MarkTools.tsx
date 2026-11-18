import type { MouseEvent } from "react";
import type { NoteTool } from "../../shared/types.ts";
import type { IconName } from "../icons/icons.ts";
import { PixelButton } from "./PixelButton.tsx";

export const MARK_TOOLS: { tool: NoteTool; icon: IconName; label: string; hint: string }[] = [
  {
    tool: "point",
    icon: "point",
    label: "Point",
    hint: "Click on the video to point at something.",
  },
  {
    tool: "box",
    icon: "box",
    label: "Box",
    hint: "Drag on the video to draw a box around something.",
  },
  { tool: "arrow", icon: "arrow", label: "Arrow", hint: "Drag on the video to draw an arrow." },
  { tool: "pen", icon: "pen", label: "Pen", hint: "Draw freely on the video." },
];

/** Keeps focus off the buttons, so the arrow keys keep moving through frames. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

interface MarkToolsProps {
  tool: NoteTool;
  onTool: (tool: NoteTool) => void;
  /** Number of marks on the note, for Undo. */
  marks: number;
  onUndo: () => void;
}

/** The drawing tools, shown above the video. */
export function MarkTools({ tool, onTool, marks, onUndo }: MarkToolsProps) {
  return (
    <fieldset className="tool-group">
      <legend className="visually-hidden">Mark tool</legend>
      {MARK_TOOLS.map((entry) => (
        <PixelButton
          key={entry.tool}
          variant="ghost"
          icon={entry.icon}
          aria-label={entry.label}
          title={`${entry.label}: ${entry.hint}`}
          aria-pressed={tool === entry.tool}
          onMouseDown={keepFocus}
          onClick={() => onTool(entry.tool)}
        />
      ))}
      <PixelButton
        variant="ghost"
        icon="undo"
        aria-label="Undo last mark"
        title="Undo last mark (Ctrl+Z)"
        disabled={marks === 0}
        onMouseDown={keepFocus}
        onClick={onUndo}
      />
    </fieldset>
  );
}
