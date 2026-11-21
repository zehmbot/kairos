/**
 * Claude works on a film in the background, with no terminal: it makes the film from its brief (right after
 * Create film), or does what you ask from the film page. One run per film at a time.
 *
 * What Claude may do: read the film's files (its folder only), edit and write them (`acceptEdits` covers only the
 * working folder; anything else needs a permission no one can give in print mode), use its skills and the Kairos
 * tools. No shell commands, no web. Sessions are kept, so an ask goes on with the film's conversation
 * (`--resume <session>`), and so does Open Claude here. It is resumed by its id: `--continue` skips
 * conversations that ran in the background.
 *
 * `.kairos/claude.json` keeps the last runs (what you asked, what Claude answered).
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ClaudeAsk,
  type ClaudeHistory,
  ClaudeHistorySchema,
  type ClaudeTurn,
} from "../shared/types.ts";
import type { ActivityBoard } from "./activity.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { MCP_NAME } from "./claude-cli.ts";
import { type ClaudeRun, type KairosMcp, plainClaudeProblem, runClaude } from "./claude-run.ts";
import { streamStep } from "./claude-steps.ts";
import { claudeHome } from "./skills.ts";

export const MAKE_LIMIT_MS = 30 * 60 * 1000;
export const ASK_LIMIT_MS = 15 * 60 * 1000;
/** The runs `.kairos/claude.json` keeps. */
export const HISTORY_SIZE = 20;
export const HISTORY_FILE = join(".kairos", "claude.json");

/** Built-in tools Claude has. Reading stays inside the film's folder (no rule allows more). */
export const JOB_TOOLS = ["Read", "Glob", "Grep", "Edit", "Write", "Skill", "TodoWrite"];
/** Tools that run without asking. Edits are allowed by `acceptEdits`, inside the folder only. */
export const JOB_ALLOWED = ["Skill", "TodoWrite", `mcp__${MCP_NAME}__*`];

/** The command line after the program. `resume` goes on with that conversation. */
export function jobArgs(mcpConfigPath: string, resume: string | null = null): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    mcpConfigPath,
    "--strict-mcp-config",
    "--tools",
    JOB_TOOLS.join(","),
    "--allowedTools",
    JOB_ALLOWED.join(","),
    "--permission-mode",
    "acceptEdits",
    ...(resume ? ["--resume", resume] : []),
  ];
}

/**
 * The film's conversation when Claude Code still has it, so `--resume` can open it (else null: a new one starts).
 * Claude Code keeps each one in `projects/<folder>/<session>.jsonl` in its own folder.
 */
export async function savedSession(
  session: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (!session || !/^[\w-]{1,100}$/.test(session)) return null;
  const projects = join(claudeHome(env), "projects");
  const folders = await readdir(projects, { withFileTypes: true }).catch(() => []);
  const saved = folders.some(
    (folder) => folder.isDirectory() && existsSync(join(projects, folder.name, `${session}.jsonl`)),
  );
  return saved ? session : null;
}

const BACKGROUND = [
  "You work in the background: the user isn't watching a terminal and can't answer questions while you work.",
  "Make sensible choices yourself and never stop to ask. You can only change files in this folder.",
];
const ENDING = [
  'When you finish, answer with two or three short, plain sentences for the user, written to them ("I made..."):',
  "what you did, and anything they should know (for example: the voices wait for a fish.audio key). No lists,",
  "no code, no headings.",
];

/** What Kairos asks Claude for. */
export function jobPrompt(ask: ClaudeAsk): string {
  if (ask.kind === "make") {
    return [
      "Make the Kairos film in this folder from its brief.",
      "",
      "- Read CLAUDE.md in this folder first: it says how this film works and how to make it from brief.md.",
      "  Use the skills it names.",
      "- Check your work: look at frames with kairos_frame (and the sheets with kairos_sheet when the film has",
      "  them), fix what looks wrong, and set the film's length when the guide says so.",
      ...BACKGROUND.map((line) => `- ${line}`),
      "",
      ...ENDING,
    ].join("\n");
  }
  return [
    "The user asks this from the film's page in Kairos:",
    "",
    ask.text
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n"),
    "",
    "Do it in the Kairos film in this folder (CLAUDE.md says how the film works), and check your work with",
    "kairos_frame.",
    ...BACKGROUND,
    "",
    ...ENDING,
  ].join("\n");
}

/** Claude Code's session, from the stream's first event or its result. */
export function sessionOf(event: unknown): string | null {
  const value = (event as { session_id?: unknown })?.session_id;
  return typeof value === "string" && value ? value : null;
}

/** The answer in the stream's last event, or the problem. */
export function answerOf(event: unknown): { answer: string } | { problem: string } | null {
  const result = event as { type?: string; is_error?: boolean; result?: unknown; subtype?: string };
  if (result?.type !== "result") return null;
  const text = typeof result.result === "string" ? result.result.trim() : "";
  if (result.is_error || (result.subtype && result.subtype !== "success")) {
    return {
      problem: plainClaudeProblem(text || String(result.subtype ?? ""), "finish the film's work"),
    };
  }
  return { answer: text.slice(0, 4000) };
}

// ---------- The history ----------

const historyQueues = new Map<string, Promise<unknown>>();

/** The film's runs (none when the file is missing or broken). */
export async function readHistory(dir: string): Promise<{ history: ClaudeHistory; ok: boolean }> {
  let text: string;
  try {
    text = await readFile(join(dir, HISTORY_FILE), "utf8");
  } catch {
    return { history: { turns: [] }, ok: true };
  }
  try {
    return { history: ClaudeHistorySchema.parse(JSON.parse(text)), ok: true };
  } catch {
    return { history: { turns: [] }, ok: false };
  }
}

/** Changes the history, one change at a time per film. A broken file is left as it is. */
export function updateHistory(
  dir: string,
  change: (history: ClaudeHistory) => ClaudeHistory,
): Promise<void> {
  const before = historyQueues.get(dir) ?? Promise.resolve();
  const next = before
    .catch(() => {})
    .then(async () => {
      const { history, ok } = await readHistory(dir);
      if (!ok) return;
      const changed = change(history);
      await mkdir(join(dir, ".kairos"), { recursive: true });
      await writeFileAtomic(
        join(dir, HISTORY_FILE),
        `${JSON.stringify({ ...changed, turns: changed.turns.slice(-HISTORY_SIZE) }, null, 2)}\n`,
      );
    });
  historyQueues.set(dir, next);
  void next.finally(() => {
    if (historyQueues.get(dir) === next) historyQueues.delete(dir);
  });
  return next;
}

const withTurn = (history: ClaudeHistory, turn: ClaudeTurn): ClaudeHistory => ({
  ...history,
  turns: history.turns.some((entry) => entry.id === turn.id)
    ? history.turns.map((entry) => (entry.id === turn.id ? turn : entry))
    : [...history.turns, turn],
});

// ---------- The jobs ----------

export interface ClaudeJobsOptions {
  /** Where `claude` is (null when it isn't installed). */
  claudePath: () => string | null;
  mcp: KairosMcp;
  activity: ActivityBoard;
  /** The film's history changed. */
  onHistory?: (filmId: string) => void;
  limits?: { make?: number; ask?: number };
}

interface Job {
  run: ClaudeRun;
  turn: ClaudeTurn;
  stopped: boolean;
  /** Settles once the run is saved and its end told. */
  done: Promise<void>;
}

/** A job can't start. The message is shown as-is. */
export class ClaudeJobError extends Error {}

export class ClaudeJobs {
  readonly #options: ClaudeJobsOptions;
  readonly #jobs = new Map<string, Job>();

  constructor(options: ClaudeJobsOptions) {
    this.#options = options;
  }

  running(filmId: string): boolean {
    return this.#jobs.has(filmId);
  }

  /** Starts Claude (returns at once with the new run). Throws ClaudeJobError when it can't start. */
  async start(film: { id: string; dir: string }, ask: ClaudeAsk): Promise<ClaudeTurn> {
    const { activity } = this.#options;
    if (this.#jobs.has(film.id) || activity.busy(film.id)) {
      throw new ClaudeJobError("Claude is already working on this film.");
    }
    const claude = this.#options.claudePath();
    if (!claude) {
      throw new ClaudeJobError(
        "Claude Code isn't installed on this computer. Install it, then try again.",
      );
    }
    const { history } = await readHistory(film.dir);
    const resume = ask.kind === "ask" ? await savedSession(history.session) : null;
    if (this.#jobs.has(film.id))
      throw new ClaudeJobError("Claude is already working on this film.");
    const turn: ClaudeTurn = {
      id: randomBytes(6).toString("hex"),
      kind: ask.kind,
      ...(ask.kind === "ask" ? { text: ask.text } : {}),
      outcome: "running",
      startedAt: new Date().toISOString(),
    };
    const limitMs =
      ask.kind === "make"
        ? (this.#options.limits?.make ?? MAKE_LIMIT_MS)
        : (this.#options.limits?.ask ?? ASK_LIMIT_MS);
    let session: string | null = null;
    let result: { answer: string } | { problem: string } | null = null;
    const job: Job = {
      turn,
      stopped: false,
      done: Promise.resolve(),
      run: runClaude({
        claude,
        dir: film.dir,
        args: (mcp) => jobArgs(mcp, resume),
        prompt: jobPrompt(ask),
        mcp: this.#options.mcp,
        limitMs,
        onEvent: (event) => {
          session = sessionOf(event) ?? session;
          result = answerOf(event) ?? result;
          const step = streamStep(event);
          if (step && !job.stopped) activity.set(film.id, { source: ask.kind, ...step });
        },
      }),
    };
    this.#jobs.set(film.id, job);
    activity.set(film.id, {
      source: ask.kind,
      stage: "reading",
      detail: ask.kind === "make" ? "Reading the brief" : "Reading what you asked",
    });
    await this.#save(film, turn);

    job.done = job.run.ended.then(async (end) => {
      const answer = result as { answer: string } | { problem: string } | null;
      let finished: ClaudeTurn;
      if (job.stopped) finished = { ...turn, outcome: "stopped", message: "Stopped." };
      else if (end.timedOut) {
        finished = {
          ...turn,
          outcome: "failed",
          message: `Claude took too long (over ${Math.round(limitMs / 60000)} minutes). What it saved so far stays.`,
        };
      } else if (answer && "answer" in answer) {
        finished = { ...turn, outcome: "done", answer: answer.answer || "Done." };
      } else {
        const problem =
          answer && "problem" in answer
            ? answer.problem
            : plainClaudeProblem(
                end.errors || (end.code === null ? "" : `exit ${end.code}`),
                "finish the film's work",
              );
        finished = { ...turn, outcome: "failed", message: problem };
      }
      finished.endedAt = new Date().toISOString();
      this.#jobs.delete(film.id);
      await this.#save(film, finished, session);
      activity.end(film.id, {
        source: ask.kind,
        outcome: finished.outcome === "running" ? "done" : finished.outcome,
        summary: finished.answer,
        message: finished.outcome === "failed" ? finished.message : undefined,
      });
    });
    return turn;
  }

  /**
   * Starts Claude, or notes in the film's history why it couldn't (for a run started for you, like the one after
   * Create film: the Claude tab then says what went wrong).
   */
  async startOrNote(film: { id: string; dir: string }, ask: ClaudeAsk): Promise<void> {
    try {
      await this.start(film, ask);
    } catch (error) {
      if (!(error instanceof ClaudeJobError)) throw error;
      const now = new Date().toISOString();
      await this.#save(film, {
        id: randomBytes(6).toString("hex"),
        kind: ask.kind,
        ...(ask.kind === "ask" ? { text: ask.text } : {}),
        outcome: "failed",
        message: error.message,
        startedAt: now,
        endedAt: now,
      });
    }
  }

  /** Stops Claude and waits until it has ended. */
  async stop(filmId: string): Promise<boolean> {
    const job = this.#jobs.get(filmId);
    if (!job) return false;
    job.stopped = true;
    await job.run.stop();
    await job.done;
    return true;
  }

  async #save(film: { id: string; dir: string }, turn: ClaudeTurn, session?: string | null) {
    try {
      await updateHistory(film.dir, (history) => ({
        ...withTurn(history, turn),
        ...(session ? { session } : {}),
      }));
      this.#options.onHistory?.(film.id);
    } catch (error) {
      console.warn(`Could not save Claude's run for ${film.id}: ${(error as Error).message}`);
    }
  }

  /** Stops every run (the hub is closing). */
  async close(): Promise<void> {
    await Promise.all([...this.#jobs.keys()].map((id) => this.stop(id)));
  }
}
