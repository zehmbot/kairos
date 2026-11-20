/**
 * "Write the narration": Kairos runs Claude Code in the background (`claude -p`) in a film's folder. Claude may
 * only look (read files, the Kairos tools that show the film); it answers with a structured script: the cast
 * (who speaks and what type of voice) and the lines with their start times. Progress comes from the stream of
 * tool calls. One run per film at a time; Stop ends it.
 */
import { z } from "zod";
import {
  type FilmVoices,
  LINE_ID_PATTERN,
  NARRATION_LANGUAGES,
  SPEAKER_PATTERN,
  VOICE_TYPES,
  VoiceTypeSchema,
  type WriteNarrationSchema,
  type WriterState,
} from "../shared/types.ts";
import { MCP_NAME } from "./claude-cli.ts";
import { type ClaudeRun, type KairosMcp, plainClaudeProblem, runClaude } from "./claude-run.ts";

/** How long Claude may take. */
export const WRITER_LIMIT_MS = 6 * 60 * 1000;

/** Built-in tools Claude may use: reading only. */
export const WRITER_BUILTIN_TOOLS = ["Read", "Glob", "Grep"];
/** Kairos tools Claude may use: the ones that look at the film. */
export const WRITER_KAIROS_TOOLS = [
  "kairos_status",
  "kairos_frame",
  "kairos_references",
  "kairos_words",
].map((name) => `mcp__${MCP_NAME}__${name}`);

/** What Claude answers with. */
export const WrittenSchema = z.object({
  cast: z
    .array(z.object({ speaker: z.string().regex(SPEAKER_PATTERN), type: VoiceTypeSchema }))
    .max(20),
  lines: z
    .array(
      z.object({
        /** The shot's `line` key in a Blocky story.js, when it has one. */
        id: z.string().regex(LINE_ID_PATTERN).optional(),
        speaker: z.string().regex(SPEAKER_PATTERN),
        text: z.string().trim().min(1).max(2000),
        start: z.number().min(0),
      }),
    )
    .min(1)
    .max(200),
  note: z.string().max(1000).optional(),
});
export type Written = z.infer<typeof WrittenSchema>;

/** The same shape as a JSON Schema, for `--json-schema`. */
export const WRITTEN_JSON_SCHEMA = {
  type: "object",
  properties: {
    cast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", pattern: SPEAKER_PATTERN.source },
          type: { type: "string", enum: [...VOICE_TYPES] },
        },
        required: ["speaker", "type"],
      },
    },
    lines: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: LINE_ID_PATTERN.source },
          speaker: { type: "string", pattern: SPEAKER_PATTERN.source },
          text: { type: "string" },
          start: { type: "number", minimum: 0 },
        },
        required: ["speaker", "text", "start"],
      },
    },
    note: { type: "string" },
  },
  required: ["cast", "lines"],
};

/** A line the user wrote: Claude writes around it. */
export interface KeptLine {
  speaker: string;
  text: string;
  start: number;
}

export interface FilmFacts {
  title: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  /** The narration never stops: Kairos packs the lines back to back (kairos.json `narration: "packed"`). */
  packed?: boolean;
}

const WHO: Record<z.infer<typeof WriteNarrationSchema>["speakers"], string> = {
  narrator: "the narrator only",
  both: "a narrator, and the characters talking where it fits",
  characters: "the characters only (dialogue, no narrator)",
};

/** What Kairos asks Claude for. */
export function writerPrompt(
  film: FilmFacts,
  request: z.infer<typeof WriteNarrationSchema>,
  voices: FilmVoices,
  kept: readonly KeptLine[] = [],
): string {
  const language =
    NARRATION_LANGUAGES.find(([code]) => code === request.language)?.[1] ?? request.language;
  const cast = Object.entries(voices)
    .map(([speaker, voice]) => `${speaker}${voice.type ? ` (${voice.type})` : ""}`)
    .join(", ");
  return [
    "You are writing what the voices say in the Kairos film in this folder. Kairos turns each of your lines",
    "into a voice (fish.audio) and places it at its start time. You can't change the film: only look at it.",
    "",
    `The film: "${film.title}", ${film.duration} s long, ${film.width}x${film.height}, ${film.fps} fps.`,
    "",
    "What the user asked for:",
    `- Style: ${request.style || "storyteller"}`,
    `- Who speaks: ${WHO[request.speakers]}`,
    `- Language: ${language}. Write every line in it.`,
    `- Note: ${request.note || "(none)"}`,
    cast ? `- Speakers who already have a voice (use these names): ${cast}` : "",
    ...(kept.length > 0
      ? [
          "- The user wrote these lines themselves. Kairos keeps them as they are: don't write them again, and",
          "  write your lines around them (never over them):",
          ...kept.map((line) => `  - ${line.start} s, ${line.speaker}: "${line.text}"`),
        ]
      : []),
    "",
    "How to work:",
    "1. Read brief.md if there is one, and the film's code (kairos.json, film.js, story.js...) to learn the",
    "   story, its scenes and shots, and when each moment happens. kairos_status gives the film's facts.",
    "2. Look at the film with kairos_frame: a frame from each scene or shot (at most 12 frames).",
    ...(film.packed
      ? [
          "3. Write the lines. The narration NEVER stops: Kairos plays the lines back to back, so the voice talks",
          "   from the first second to the last, with no silent moments. Tell the whole story, with enough words",
          "   for the whole film (about 2.6 words per second).",
          "   - One line is one or two short sentences. Their starts only give the order (0, 1, 2...).",
          "   - Never leave a moment without words: every shot is under the voice.",
        ]
      : [
          "3. Write the lines:",
          "   - Each line belongs to a moment and starts when it starts (seconds from the start of the film).",
          "   - A line must end before the next one starts and before the film ends: count about 2.5 words per",
          "     second plus a short pause. Keep lines short, and leave silent moments where the picture speaks.",
          "   - Lines never overlap and are in time order.",
        ]),
    "   - If the film already shows the words that are said (captions, or `say` in a Blocky story.js), keep",
    "     to them.",
    '   - Speakers: "narrator" for the narrator; characters by a short name in small letters (milo, ruby,',
    "     grandpa-bo). In a Blocky film, a character's id from the cast (bo, not grandpa-bo).",
    '   - id: when a shot in story.js names its line (`line: "joke"`), give that line the same id. Otherwise',
    "     leave id out.",
    "4. cast: every speaker with its type: narrator, woman, man, girl, boy, old-woman or old-man.",
    "5. note: one or two plain sentences for the user when something matters (for example: the story needs",
    "   more time than the film has). Leave it empty otherwise.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The command line (after the program): print mode, the stream, only the tools that look. */
export function writerArgs(mcpConfigPath: string): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--json-schema",
    JSON.stringify(WRITTEN_JSON_SCHEMA),
    "--mcp-config",
    mcpConfigPath,
    "--strict-mcp-config",
    "--tools",
    WRITER_BUILTIN_TOOLS.join(","),
    "--allowedTools",
    [...WRITER_BUILTIN_TOOLS, ...WRITER_KAIROS_TOOLS].join(","),
  ];
}

const fileName = (path: unknown) =>
  typeof path === "string" ? (path.split(/[\\/]/).pop() ?? path) : "a file";

/** What a stream event says Claude is doing, for the progress line. */
export function progressOf(event: unknown): Pick<WriterState, "stage" | "detail"> | null {
  const message = (event as { type?: string; message?: { content?: unknown[] } }) ?? {};
  if (message.type !== "assistant") return null;
  for (const part of message.message?.content ?? []) {
    const use = part as { type?: string; name?: string; input?: Record<string, unknown> };
    if (use.type !== "tool_use" || !use.name) continue;
    const name = use.name.replace(`mcp__${MCP_NAME}__`, "");
    const input = use.input ?? {};
    if (name === "kairos_frame") {
      const t = Number(input.t ?? 0);
      return { stage: "watching", detail: `Looking at ${Math.round(t * 10) / 10} s` };
    }
    if (name === "kairos_references")
      return { stage: "watching", detail: "Looking at your references" };
    if (name === "kairos_status") return { stage: "watching", detail: "Reading the film's facts" };
    if (name === "kairos_words") return { stage: "watching", detail: "Listening to the sound" };
    if (name === "Read")
      return { stage: "watching", detail: `Reading ${fileName(input.file_path)}` };
    if (name === "Glob" || name === "Grep")
      return { stage: "watching", detail: "Looking through the film's files" };
    if (name === "StructuredOutput") return { stage: "writing", detail: "Writing the lines" };
  }
  return null;
}

/** The answer in the stream's last event, or the problem. */
export function resultOf(event: unknown): { written: Written } | { problem: string } | null {
  const result = event as {
    type?: string;
    is_error?: boolean;
    result?: unknown;
    structured_output?: unknown;
  };
  if (result?.type !== "result") return null;
  if (result.is_error) return { problem: plainClaudeProblem(String(result.result ?? "")) };
  let output = result.structured_output;
  if (output === undefined && typeof result.result === "string") {
    try {
      output = JSON.parse(result.result);
    } catch {}
  }
  const parsed = WrittenSchema.safeParse(output);
  return parsed.success
    ? { written: parsed.data }
    : { problem: "Claude answered, but not with a script Kairos can use. Try again." };
}

export interface WriterOptions {
  /** Where `claude` is (null when it isn't installed). */
  claudePath: () => string | null;
  /** The Kairos tools server Claude starts: node, `src/mcp/server.ts`, the hub's port. */
  mcp: KairosMcp;
  /** Every change of a film's writer state. */
  onChange: (filmId: string, state: WriterState) => void;
  /** True while Claude already works on the film another way (making it, an ask). */
  busy?: (filmId: string) => boolean;
  limitMs?: number;
}

/** What happens with Claude's answer: save it, cast, make the voices. Reports its steps. */
export type FinishWriting = (
  written: Written,
  step: (stage: WriterState["stage"], detail: string) => void,
) => Promise<{ message: string; warnings: string[] }>;

interface Job {
  state: WriterState;
  run: ClaudeRun | null;
  stopped: boolean;
}

export class Writers {
  readonly #options: WriterOptions;
  readonly #jobs = new Map<string, Job>();

  constructor(options: WriterOptions) {
    this.#options = options;
  }

  state(filmId: string): WriterState {
    return this.#jobs.get(filmId)?.state ?? { state: "idle", warnings: [] };
  }

  running(filmId: string): boolean {
    return this.#jobs.get(filmId)?.state.state === "running";
  }

  #set(filmId: string, job: Job, change: Partial<WriterState>): void {
    job.state = { ...job.state, ...change };
    this.#options.onChange(filmId, job.state);
  }

  /** Starts writing (returns at once; the state says how it goes). Throws when it can't start. */
  start(
    film: { id: string; dir: string; facts: FilmFacts; voices: FilmVoices; kept?: KeptLine[] },
    request: z.infer<typeof WriteNarrationSchema>,
    finish: FinishWriting,
  ): WriterState {
    if (this.running(film.id))
      throw new WriterError("Claude is already writing this film's script.");
    if (this.#options.busy?.(film.id))
      throw new WriterError("Claude is already working on this film.");
    const claude = this.#options.claudePath();
    if (!claude) {
      throw new WriterError(
        "Claude Code isn't installed on this computer. Install it, then try again.",
      );
    }
    const job: Job = {
      state: {
        state: "running",
        stage: "starting",
        detail: "Starting Claude Code",
        warnings: [],
        startedAt: new Date().toISOString(),
      },
      run: null,
      stopped: false,
    };
    this.#jobs.set(film.id, job);
    this.#options.onChange(film.id, job.state);
    void this.#run(film, request, finish, claude, job);
    return job.state;
  }

  /** Stops Claude and waits (a few seconds at most) until it has ended. */
  async stop(filmId: string): Promise<WriterState> {
    const job = this.#jobs.get(filmId);
    if (job?.state.state !== "running") return this.state(filmId);
    job.stopped = true;
    await job.run?.stop();
    this.#set(filmId, job, {
      state: "stopped",
      stage: undefined,
      detail: undefined,
      message: "Stopped.",
    });
    return job.state;
  }

  async #run(
    film: { id: string; dir: string; facts: FilmFacts; voices: FilmVoices; kept?: KeptLine[] },
    request: z.infer<typeof WriteNarrationSchema>,
    finish: FinishWriting,
    claude: string,
    job: Job,
  ): Promise<void> {
    const fail = (message: string) => {
      if (!job.stopped)
        this.#set(film.id, job, { state: "failed", stage: undefined, detail: undefined, message });
    };
    const limitMs = this.#options.limitMs ?? WRITER_LIMIT_MS;
    let outcome: { written: Written } | { problem: string } | null = null;
    try {
      const run = runClaude({
        claude,
        dir: film.dir,
        args: writerArgs,
        prompt: writerPrompt(film.facts, request, film.voices, film.kept),
        mcp: this.#options.mcp,
        limitMs,
        onEvent: (event) => {
          const progress = progressOf(event);
          if (progress && !job.stopped) this.#set(film.id, job, progress);
          outcome = resultOf(event) ?? outcome;
        },
      });
      job.run = run;
      const end = await run.ended;
      if (job.stopped) return;
      if (end.timedOut) {
        fail(`Claude took too long (over ${Math.round(limitMs / 60000)} minutes). Try again.`);
        return;
      }
      const answer = outcome as { written: Written } | { problem: string } | null;
      if (!answer) {
        fail(plainClaudeProblem(end.errors || (end.code === null ? "" : `exit ${end.code}`)));
        return;
      }
      if ("problem" in answer) {
        fail(answer.problem);
        return;
      }
      const done = await finish(answer.written, (stage, detail) => {
        if (!job.stopped) this.#set(film.id, job, { stage, detail });
      });
      if (!job.stopped) {
        this.#set(film.id, job, {
          state: "done",
          stage: undefined,
          detail: undefined,
          message: done.message,
          warnings: done.warnings,
        });
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}

/** The writer can't start. The message is shown as-is. */
export class WriterError extends Error {}
