import type { FastifyInstance, FastifyReply } from "fastify";
import type { ClaudeStatus } from "../../shared/types.ts";
import { ClaudeCliError, type ClaudeTools } from "../claude-cli.ts";
import { readFilm } from "../films.ts";
import type { Studio } from "../studio.ts";
import { sendError } from "./errors.ts";

/** Claude Code on this computer: status, connect/disconnect the Kairos tools, open Claude in a film. */
export function claudeRoutes(app: FastifyInstance, studio: Studio, claude: ClaudeTools): void {
  const handle = async (reply: FastifyReply, action: () => Promise<ClaudeStatus | undefined>) => {
    try {
      const result = await action();
      return result ?? reply.code(204).send();
    } catch (error) {
      if (error instanceof ClaudeCliError) return sendError(reply, 409, "claude", error.message);
      throw error;
    }
  };

  app.get("/api/claude", (_request, reply) => handle(reply, () => claude.status()));
  app.post("/api/claude/connect", (_request, reply) => handle(reply, () => claude.connect()));
  app.post("/api/claude/disconnect", (_request, reply) => handle(reply, () => claude.disconnect()));

  app.post<{ Params: { id: string } }>("/api/films/:id/open-claude", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
    const film = await readFilm(dir, request.params.id);
    if (!film) return sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
    return handle(reply, async () => {
      await claude.openHere(film.path);
      return undefined;
    });
  });
}
