import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { FastifyInstance } from "fastify";
import { ClaudeAskSchema, type FilmClaude } from "../../shared/types.ts";
import type { ActivityBoard, HookCall } from "../activity.ts";
import { HOOK_PATH } from "../claude-hooks.ts";
import { ClaudeJobError, type ClaudeJobs, readHistory } from "../claude-jobs.ts";
import { readFilm } from "../films.ts";
import type { Studio } from "../studio.ts";
import { sendError } from "./errors.ts";

/** Hooks post whole tool inputs (a Write's file contents too): Kairos reads only a few small fields. */
const HOOK_BODY_LIMIT = 64 * 1024 * 1024;
/** The fields of a tool's input the step's words use. Never a command or a file's contents. */
const STEP_FIELDS = ["file_path", "notebook_path", "t", "sheet", "make", "duration", "skill"];

/** Only what Kairos reads from a hook: the event, the session, the tool, a few small fields, Claude's words. */
export function hookCall(body: unknown, notice: unknown): HookCall | null {
  const data = body as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || typeof data.hook_event_name !== "string") return null;
  const input: Record<string, unknown> = {};
  const raw = data.tool_input;
  if (raw && typeof raw === "object") {
    for (const key of STEP_FIELDS) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === "string") input[key] = value.slice(0, 300);
      else if (typeof value === "number" || typeof value === "boolean") input[key] = value;
    }
  }
  return {
    event: data.hook_event_name,
    session: typeof data.session_id === "string" ? data.session_id : undefined,
    tool: typeof data.tool_name === "string" ? data.tool_name : undefined,
    input,
    notice: notice === "waiting" || notice === "idle" ? notice : undefined,
    message:
      data.hook_event_name === "Stop" && typeof data.last_assistant_message === "string"
        ? data.last_assistant_message.slice(0, 4000)
        : undefined,
  };
}

/** The film a folder belongs to (the film's own folder or one inside it), or null. */
export async function filmOfFolder(filmsDir: string, cwd: string): Promise<string | null> {
  const path = relative(filmsDir, cwd);
  if (!path || path.startsWith("..") || isAbsolute(path)) return null;
  const first = path.split(/[\\/]/)[0] ?? "";
  if (!first || first.startsWith(".")) return null;
  if (existsSync(join(filmsDir, first, "kairos.json"))) return first;
  // Windows paths may come in another case.
  const entries = await readdir(filmsDir).catch(() => [] as string[]);
  const match = entries.find((entry) => entry.toLowerCase() === first.toLowerCase());
  return match && existsSync(join(filmsDir, match, "kairos.json")) ? match : null;
}

/** Claude at work on films: Kairos' own runs (make the film, an ask) and Claude in your terminal (hooks). */
export function claudeWorkRoutes(
  app: FastifyInstance,
  studio: Studio,
  options: { jobs: ClaudeJobs; activity: ActivityBoard },
): void {
  const { jobs, activity } = options;

  app.get("/api/claude/activity", async () => activity.all());

  // Claude Code's hooks in a film folder. Always answered at once, with no body.
  app.post<{ Querystring: { notice?: string } }>(
    HOOK_PATH,
    { bodyLimit: HOOK_BODY_LIMIT },
    async (request, reply) => {
      const call = hookCall(request.body, request.query.notice);
      const cwd = (request.body as { cwd?: unknown } | null)?.cwd;
      const dir = studio.filmsDir;
      if (call && dir && typeof cwd === "string") {
        const filmId = await filmOfFolder(dir, cwd);
        if (filmId) activity.hook(filmId, call);
      }
      return reply.code(204).send();
    },
  );

  const filmOr404 = async (id: string) => {
    const dir = studio.filmsDir;
    return dir ? readFilm(dir, id) : null;
  };

  app.get<{ Params: { id: string } }>("/api/films/:id/claude", async (request, reply) => {
    const film = await filmOr404(request.params.id);
    if (!film) return sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
    const { history } = await readHistory(film.path);
    // A run left "running" when Kairos closed never finished.
    const live = jobs.running(film.id);
    const answer: FilmClaude = {
      activity: activity.get(film.id),
      turns: [...history.turns]
        .reverse()
        .map((turn) =>
          turn.outcome === "running" && !live
            ? { ...turn, outcome: "stopped", message: "Kairos was closed while Claude worked." }
            : turn,
        ),
      conversation: Boolean(history.session),
    };
    return answer;
  });

  app.post<{ Params: { id: string } }>("/api/films/:id/claude", async (request, reply) => {
    const film = await filmOr404(request.params.id);
    if (!film) return sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
    const ask = ClaudeAskSchema.safeParse(request.body ?? {});
    if (!ask.success) {
      return sendError(reply, 400, "bad-request", ask.error.issues[0]?.message ?? "Bad request.");
    }
    if (ask.data.kind === "make" && !film.hasBrief) {
      return sendError(reply, 409, "no-brief", "This film has no brief to make it from.");
    }
    try {
      return reply.code(202).send(await jobs.start({ id: film.id, dir: film.path }, ask.data));
    } catch (error) {
      if (error instanceof ClaudeJobError) return sendError(reply, 409, "claude", error.message);
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>("/api/films/:id/claude", async (request, reply) => {
    await jobs.stop(request.params.id);
    return reply.code(204).send();
  });
}
