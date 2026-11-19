import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Studio } from "../studio.ts";
import {
  findTemplate,
  listTemplates,
  PREVIEW_FILE,
  removeTemplate,
  summaryOf,
} from "../templates.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}

/** Templates for the New film dialog: Kairos' own and the user's. */
export function templateRoutes(app: FastifyInstance, studio: Studio): void {
  const notFound = (reply: FastifyReply) =>
    sendError(reply, 404, "not-found", "This template doesn't exist (any more).");

  app.get("/api/templates", async () =>
    (await listTemplates(studio.templatesDir, studio.userTemplatesDir)).map(summaryOf),
  );

  app.get<{ Params: IdParams }>("/api/templates/:id/preview", async (request, reply) => {
    const template = await findTemplate(
      studio.templatesDir,
      studio.userTemplatesDir,
      request.params.id,
    );
    if (!template?.hasPreview) return notFound(reply);
    const png = await readFile(join(template.dir, PREVIEW_FILE));
    return reply.type("image/png").header("cache-control", "no-store").send(png);
  });

  app.delete<{ Params: IdParams }>("/api/templates/:id", async (request, reply) => {
    const userDir = studio.userTemplatesDir;
    const template = await findTemplate(studio.templatesDir, userDir, request.params.id);
    if (!template || !userDir) return notFound(reply);
    if (template.source === "kairos") {
      return sendError(reply, 409, "kairos-template", "Kairos' own templates can't be deleted.");
    }
    await removeTemplate(userDir, template.id);
    return reply.code(204).send();
  });
}
