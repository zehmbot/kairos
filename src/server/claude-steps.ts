/**
 * What Claude is doing, in plain words, from the tool it calls: the loading screen's step ("Writing story.js")
 * and the picture's stage. Used for Kairos' own runs (their stream of tool calls) and for Claude in your terminal
 * (its hooks). Only the tool's name, a file's name and a few small fields are read, never file contents.
 */
import type { ClaudeStage } from "../shared/types.ts";
import { MCP_NAME } from "./claude-cli.ts";

export interface ClaudeStep {
  stage: ClaudeStage;
  detail: string;
}

/** `C:\films\intro\story.js` -> `story.js`. */
const fileName = (path: unknown): string =>
  typeof path === "string" && path.trim() ? (path.split(/[\\/]/).pop() ?? path) : "a file";

/** `kairos-blocky-cinema` -> `Blocky Cinema`, `kairos-3d` -> `3D`, `kairos` -> `Kairos`. */
export function guideName(skill: unknown): string | null {
  if (typeof skill !== "string" || !skill.startsWith("kairos")) return null;
  const words = (skill.replace(/^kairos-?/, "") || "kairos").split("-").filter(Boolean);
  return words
    .map((word) => (word === "3d" ? "3D" : word[0]?.toUpperCase() + word.slice(1)))
    .join(" ");
}

const seconds = (t: unknown) => `${Math.round(Number(t ?? 0) * 10) / 10} s`;

/** The step for a tool call (a built-in tool, or a Kairos tool with or without its `mcp__kairos__` prefix). */
export function stepOf(tool: string, input: Record<string, unknown> = {}): ClaudeStep {
  const name = tool.replace(`mcp__${MCP_NAME}__`, "");
  switch (name) {
    case "Read":
      return { stage: "reading", detail: `Reading ${fileName(input.file_path)}` };
    case "Glob":
    case "Grep":
    case "LS":
      return { stage: "reading", detail: "Looking through the film's files" };
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return {
        stage: "writing",
        detail: `Writing ${fileName(input.file_path ?? input.notebook_path)}`,
      };
    case "Skill": {
      const guide = guideName(input.skill ?? input.command ?? input.name);
      return { stage: "reading", detail: guide ? `Reading the ${guide} guide` : "Reading a guide" };
    }
    case "TodoWrite":
      return { stage: "thinking", detail: "Planning the steps" };
    case "AskUserQuestion":
      return { stage: "waiting", detail: "It has a question for you in your terminal" };
    case "Bash":
    case "PowerShell":
      return { stage: "writing", detail: "Running a command" };
    case "WebFetch":
    case "WebSearch":
      return { stage: "reading", detail: "Looking on the web" };
    case "Task":
    case "Agent":
      return { stage: "thinking", detail: "Working on a part of it" };
    case "kairos_frame":
      return { stage: "looking", detail: `Looking at ${seconds(input.t)}` };
    case "kairos_sheet":
      return {
        stage: "looking",
        detail: `Checking the ${typeof input.sheet === "string" ? input.sheet : "film's"} sheet`,
      };
    case "kairos_references":
      return { stage: "looking", detail: "Looking at your references" };
    case "kairos_notes":
      return { stage: "reading", detail: "Reading your notes" };
    case "kairos_status":
      return { stage: "reading", detail: "Reading the film's facts" };
    case "kairos_assets":
    case "kairos_use_asset":
      return { stage: "reading", detail: "Looking at your assets" };
    case "kairos_voices":
      return { stage: "voices", detail: "Casting the voices" };
    case "kairos_script":
      return { stage: "voices", detail: input.make ? "Making the voices" : "Writing the script" };
    case "kairos_say":
      return { stage: "voices", detail: "Making a voice" };
    case "kairos_words":
      return { stage: "voices", detail: "Listening to the sound" };
    case "kairos_film_settings":
      return {
        stage: "writing",
        detail:
          input.duration !== undefined
            ? "Setting the film's length"
            : "Changing the film's settings",
      };
    case "kairos_render":
    case "kairos_renders":
      return { stage: "writing", detail: "Rendering the video" };
    default:
      return { stage: "thinking", detail: "Working" };
  }
}

/** The step a `stream-json` event shows: its last tool call, or thinking for plain text. */
export function streamStep(event: unknown): ClaudeStep | null {
  const message = (event as { type?: string; message?: { content?: unknown[] } }) ?? {};
  if (message.type !== "assistant") return null;
  let step: ClaudeStep | null = null;
  for (const part of message.message?.content ?? []) {
    const block = part as { type?: string; name?: string; input?: Record<string, unknown> };
    if (block.type === "tool_use" && block.name) step = stepOf(block.name, block.input ?? {});
    else if ((block.type === "text" || block.type === "thinking") && !step) {
      step = { stage: "thinking", detail: "Thinking" };
    }
  }
  return step;
}
