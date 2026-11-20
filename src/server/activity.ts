/**
 * Is Claude working on a film, and on what? One state per film, for the preview's loading screen and the film
 * cards. Two kinds of sources feed it:
 * - Kairos' own runs (make the film, an ask, the narration) say each step themselves; while one runs, it is the
 *   film's activity.
 * - Claude in your terminal tells Kairos through the film folder's hooks (`claude-hooks.ts`): a prompt starts it,
 *   each tool call moves it on, a permission prompt makes it wait for you, Stop ends it. A session that says
 *   nothing for a while is taken as ended.
 */
import type {
  ClaudeActivity,
  ClaudeEnd,
  ClaudeSource,
  ClaudeStage,
  WriterState,
} from "../shared/types.ts";
import { stepOf } from "./claude-steps.ts";

/** A terminal session that says nothing for this long is taken as ended. */
export const TERMINAL_IDLE_MS = 20 * 60 * 1000;
/** At most this much of Claude's last message is passed on. */
const SUMMARY_LIMIT = 800;

/** What a hook sent, already reduced to what Kairos reads (never your prompt or a file's contents). */
export interface HookCall {
  event: string;
  session?: string;
  tool?: string;
  /** The tool's input, for the step's words (a file's name, a time). */
  input?: Record<string, unknown>;
  /** A Notification's kind, from the hook's address: Claude waits for you, or for your next message. */
  notice?: "waiting" | "idle";
  /** Claude's last message (Stop). */
  message?: string;
}

export interface ActivityBoardOptions {
  /** Every change of a film's activity; `ended` when work on it ended. */
  publish: (filmId: string, activity: ClaudeActivity | null, ended?: ClaudeEnd) => void;
  idleMs?: number;
}

interface TerminalWork {
  activity: ClaudeActivity;
  session?: string;
  timer: ReturnType<typeof setTimeout>;
}

const shorten = (text: string | undefined) => {
  const clean = text?.trim();
  if (!clean) return undefined;
  return clean.length > SUMMARY_LIMIT ? `${clean.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…` : clean;
};

export class ActivityBoard {
  readonly #options: ActivityBoardOptions;
  readonly #kairos = new Map<string, ClaudeActivity>();
  readonly #terminal = new Map<string, TerminalWork>();

  constructor(options: ActivityBoardOptions) {
    this.#options = options;
  }

  /** The film's activity: Kairos' own run first, then a terminal session. */
  get(filmId: string): ClaudeActivity | null {
    return this.#kairos.get(filmId) ?? this.#terminal.get(filmId)?.activity ?? null;
  }

  /** Every film Claude works on now. */
  all(): Record<string, ClaudeActivity> {
    const films = new Set([...this.#kairos.keys(), ...this.#terminal.keys()]);
    const result: Record<string, ClaudeActivity> = {};
    for (const id of films) {
      const activity = this.get(id);
      if (activity) result[id] = activity;
    }
    return result;
  }

  /** True while Kairos runs Claude on the film (make, ask or the narration). */
  busy(filmId: string): boolean {
    return this.#kairos.has(filmId);
  }

  // ---------- Kairos' own runs ----------

  /** A run started or moved on. */
  set(filmId: string, change: { source: ClaudeSource; stage: ClaudeStage; detail?: string }): void {
    const before = this.#kairos.get(filmId);
    const activity: ClaudeActivity = {
      source: change.source,
      stage: change.stage,
      detail: change.detail,
      startedAt: before?.source === change.source ? before.startedAt : new Date().toISOString(),
    };
    if (before && before.stage === activity.stage && before.detail === activity.detail) return;
    this.#kairos.set(filmId, activity);
    this.#options.publish(filmId, activity);
  }

  /** A run ended. */
  end(filmId: string, ended: ClaudeEnd): void {
    if (!this.#kairos.delete(filmId)) return;
    // Hooks were ignored meanwhile: a terminal session starts fresh with its next event.
    this.#forgetTerminal(filmId);
    this.#options.publish(filmId, null, ended);
  }

  // ---------- Claude in your terminal ----------

  /** A hook from a Claude Code session in the film's folder. */
  hook(filmId: string, call: HookCall): void {
    // Kairos' own run says what happens itself (its hooks fire too).
    if (this.busy(filmId)) return;
    const work = this.#terminal.get(filmId);
    const now = new Date().toISOString();

    switch (call.event) {
      case "UserPromptSubmit":
        this.#terminalSet(filmId, call.session, {
          source: "terminal",
          stage: "thinking",
          detail: "Thinking",
          startedAt: work?.activity.startedAt ?? now,
        });
        return;
      case "PreToolUse": {
        const step = stepOf(call.tool ?? "", call.input ?? {});
        this.#terminalSet(filmId, call.session, {
          source: "terminal",
          ...step,
          startedAt: work?.activity.startedAt ?? now,
        });
        return;
      }
      case "PostToolUse":
        // After you answered a permission prompt, Claude is back at work.
        if (work && work.activity.stage === "waiting") {
          this.#terminalSet(filmId, call.session, {
            ...work.activity,
            stage: "thinking",
            detail: "Thinking",
          });
        } else if (work) this.#terminalSet(filmId, call.session, work.activity);
        return;
      case "Notification":
        if (call.notice === "waiting" && work) {
          this.#terminalSet(filmId, call.session, {
            ...work.activity,
            stage: "waiting",
            detail: "Answer it in your terminal",
          });
        } else if (call.notice === "idle") this.#terminalEnd(filmId);
        return;
      case "Stop":
        this.#terminalEnd(filmId, shorten(call.message));
        return;
      case "SessionEnd":
        this.#terminalEnd(filmId);
        return;
      default:
        return;
    }
  }

  #terminalSet(filmId: string, session: string | undefined, activity: ClaudeActivity): void {
    const before = this.#terminal.get(filmId);
    if (before) clearTimeout(before.timer);
    const timer = setTimeout(
      () => this.#terminalEnd(filmId),
      this.#options.idleMs ?? TERMINAL_IDLE_MS,
    );
    timer.unref?.();
    this.#terminal.set(filmId, { activity, session: session ?? before?.session, timer });
    const changed =
      !before ||
      before.activity.stage !== activity.stage ||
      before.activity.detail !== activity.detail;
    if (changed) this.#options.publish(filmId, activity);
  }

  #terminalEnd(filmId: string, summary?: string): void {
    if (!this.#forgetTerminal(filmId)) return;
    this.#options.publish(filmId, null, { source: "terminal", outcome: "done", summary });
  }

  #forgetTerminal(filmId: string): boolean {
    const work = this.#terminal.get(filmId);
    if (!work) return false;
    clearTimeout(work.timer);
    this.#terminal.delete(filmId);
    return true;
  }

  /** Forgets everything (the hub is closing). */
  close(): void {
    for (const work of this.#terminal.values()) clearTimeout(work.timer);
    this.#terminal.clear();
    this.#kairos.clear();
  }
}

/** "Write the narration" moved on: the film's activity follows it. */
export function narrationActivity(board: ActivityBoard, filmId: string, writer: WriterState): void {
  if (writer.state === "running") {
    const stage: ClaudeStage =
      writer.stage === "writing"
        ? "writing"
        : writer.stage === "casting" || writer.stage === "voicing"
          ? "voices"
          : writer.stage === "starting"
            ? "thinking"
            : writer.detail?.startsWith("Looking")
              ? "looking"
              : "reading";
    board.set(filmId, { source: "narration", stage, detail: writer.detail });
  } else if (writer.state !== "idle") {
    board.end(filmId, {
      source: "narration",
      outcome: writer.state,
      summary: writer.state === "done" ? writer.message : undefined,
      message: writer.state === "failed" ? writer.message : undefined,
    });
  }
}
