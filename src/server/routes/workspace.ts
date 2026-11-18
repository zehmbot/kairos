import { homedir } from "node:os";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  type PickWorkspaceResult,
  SetWorkspaceSchema,
  type Workspace,
} from "../../shared/types.ts";
import { pickFolder } from "../folder-picker.ts";
import type { Studio } from "../studio.ts";
import { normalizeWorkspacePath, suggestedWorkspace } from "../workspace.ts";
import { sendError } from "./errors.ts";

export const PICKER_TITLE = "Choose your Kairos workspace";

export function workspaceRoutes(
  app: FastifyInstance,
  studio: Studio,
  pick: typeof pickFolder = pickFolder,
): void {
  const describe = (): Workspace => ({ path: studio.workspace, suggested: suggestedWorkspace() });

  /** Switches to `input`. Returns an error reply, or `null` when it worked. */
  async function switchTo(reply: FastifyReply, input: string) {
    const path = normalizeWorkspacePath(input);
    if (!path.ok) return sendError(reply, 400, "bad-path", path.message);
    try {
      await studio.setWorkspace(path.path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "error";
      return sendError(
        reply,
        400,
        "cannot-use-folder",
        `Kairos could not use that folder (${code}). Try another one.`,
      );
    }
    return null;
  }

  app.get("/api/workspace", async () => describe());

  // Typed path: only used when this computer can't show a folder window.
  app.put("/api/workspace", async (request, reply) => {
    const body = SetWorkspaceSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    return (await switchTo(reply, body.data.path)) ?? describe();
  });

  // Opens the system folder window and waits until the user closes it.
  let picking = false;
  app.post("/api/workspace/pick", async (_request, reply) => {
    if (picking) {
      return sendError(
        reply,
        409,
        "busy",
        "The folder window is already open. Look for it on your screen.",
      );
    }
    picking = true;
    try {
      const result = await pick(PICKER_TITLE, studio.workspace ?? homedir());
      if (result.status === "picked") {
        const failed = await switchTo(reply, result.path);
        if (failed) return failed;
      }
      const answer: PickWorkspaceResult = { status: result.status, workspace: describe() };
      return answer;
    } catch (error) {
      return sendError(
        reply,
        500,
        "picker-failed",
        `Kairos could not open the folder window: ${(error as Error).message}`,
      );
    } finally {
      picking = false;
    }
  });
}
