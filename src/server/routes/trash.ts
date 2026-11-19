import type { FastifyInstance, FastifyReply } from "fastify";
import type { Studio } from "../studio.ts";
import { deleteFromTrash, emptyTrash, listTrash, restoreFromTrash, TrashError } from "../trash.ts";
import { sendError } from "./errors.ts";

/** The workspace trash: deleted films that can be restored, or deleted for good. */
export function trashRoutes(app: FastifyInstance, studio: Studio): void {
  const noWorkspace = (reply: FastifyReply) =>
    sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");

  /** Runs a trash change, then tells the UI. Trash problems become plain-words answers. */
  async function change<T>(
    reply: FastifyReply,
    action: () => Promise<T>,
    after: (result: T) => void,
  ): Promise<T | FastifyReply> {
    try {
      const result = await action();
      after(result);
      return result;
    } catch (error) {
      if (error instanceof TrashError) return sendError(reply, 409, "trash", error.message);
      throw error;
    }
  }

  // The trash is shown with the films, so a change to it is a films change.
  const trashChanged = () => studio.events.publish({ type: "films-changed", ids: [] });

  app.get("/api/trash", async (_request, reply) => {
    const trash = studio.trashDir;
    return trash ? listTrash(trash) : noWorkspace(reply);
  });

  app.post<{ Params: { entry: string } }>("/api/trash/:entry/restore", async (request, reply) => {
    const trash = studio.trashDir;
    const films = studio.filmsDir;
    if (!trash || !films) return noWorkspace(reply);
    return change(
      reply,
      async () => ({ id: await restoreFromTrash(films, trash, request.params.entry) }),
      ({ id }) => {
        studio.events.publish({ type: "films-changed", ids: [id] });
        // Its videos are back too.
        studio.events.publish({ type: "renders-changed", id });
      },
    );
  });

  app.delete<{ Params: { entry: string } }>("/api/trash/:entry", async (request, reply) => {
    const trash = studio.trashDir;
    if (!trash) return noWorkspace(reply);
    const result = await change(
      reply,
      () => deleteFromTrash(trash, request.params.entry),
      trashChanged,
    );
    return reply.sent ? result : reply.code(204).send();
  });

  app.delete("/api/trash", async (_request, reply) => {
    const trash = studio.trashDir;
    if (!trash) return noWorkspace(reply);
    const result = await change(reply, () => emptyTrash(trash), trashChanged);
    return reply.sent ? result : reply.code(204).send();
  });
}
