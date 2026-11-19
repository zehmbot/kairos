import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { TemplateInput } from "../../shared/types.ts";
import { openFolder } from "../open-folder.ts";
import type { Studio } from "../studio.ts";
import {
  createTemplate,
  duplicateTemplate,
  findTemplate,
  listTemplates,
  PREVIEW_FILE,
  removeTemplate,
  summaryOf,
  TemplateError,
  updateTemplate,
} from "../templates.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}

export interface TemplateRoutesOptions {
  open?: (path: string) => void;
}

/** Templates: Kairos' own and the user's. The user's can be made, changed, copied and deleted. */
export function templateRoutes(
  app: FastifyInstance,
  studio: Studio,
  options: TemplateRoutesOptions = {},
): void {
  const open = options.open ?? openFolder;
  const notFound = (reply: FastifyReply) =>
    sendError(reply, 404, "not-found", "This template doesn't exist (any more).");
  const noWorkspace = (reply: FastifyReply) =>
    sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
  const find = (id: string) => findTemplate(studio.templatesDir, studio.userTemplatesDir, id);

  /** Answers with the template (after a change), or the plain-words problem. */
  async function answer(reply: FastifyReply, code: number, action: () => Promise<string>) {
    try {
      const id = await action();
      const template = await find(id);
      return template ? reply.code(code).send(summaryOf(template)) : notFound(reply);
    } catch (error) {
      if (error instanceof TemplateError)
        return sendError(reply, 400, "bad-template", error.message);
      throw error;
    }
  }

  app.get("/api/templates", async () =>
    (await listTemplates(studio.templatesDir, studio.userTemplatesDir)).map(summaryOf),
  );

  app.get<{ Params: IdParams }>("/api/templates/:id", async (request, reply) => {
    const template = await find(request.params.id);
    return template ? summaryOf(template) : notFound(reply);
  });

  app.get<{ Params: IdParams }>("/api/templates/:id/preview", async (request, reply) => {
    const template = await find(request.params.id);
    if (!template?.hasPreview) return notFound(reply);
    const png = await readFile(join(template.dir, PREVIEW_FILE));
    return reply.type("image/png").header("cache-control", "no-store").send(png);
  });

  app.post("/api/templates", async (request, reply) => {
    const userDir = studio.userTemplatesDir;
    if (!userDir) return noWorkspace(reply);
    return answer(reply, 201, () =>
      createTemplate(studio.templatesDir, userDir, (request.body ?? {}) as TemplateInput),
    );
  });

  app.put<{ Params: IdParams }>("/api/templates/:id", async (request, reply) => {
    const userDir = studio.userTemplatesDir;
    const template = await find(request.params.id);
    if (!template || !userDir) return notFound(reply);
    if (template.source === "kairos") {
      return sendError(
        reply,
        409,
        "kairos-template",
        "Kairos' own templates can't be changed. Duplicate it to make your own copy.",
      );
    }
    return answer(reply, 200, async () => {
      await updateTemplate(userDir, template.id, (request.body ?? {}) as TemplateInput);
      return template.id;
    });
  });

  app.post<{ Params: IdParams }>("/api/templates/:id/duplicate", async (request, reply) => {
    const userDir = studio.userTemplatesDir;
    const template = await find(request.params.id);
    if (!template) return notFound(reply);
    if (!userDir) return noWorkspace(reply);
    return answer(reply, 201, () => duplicateTemplate(template, userDir));
  });

  app.post<{ Params: IdParams }>("/api/templates/:id/open-folder", async (request, reply) => {
    const template = await find(request.params.id);
    if (!template) return notFound(reply);
    open(template.dir);
    return reply.code(204).send();
  });

  app.delete<{ Params: IdParams }>("/api/templates/:id", async (request, reply) => {
    const userDir = studio.userTemplatesDir;
    const template = await find(request.params.id);
    if (!template || !userDir) return notFound(reply);
    if (template.source === "kairos") {
      return sendError(reply, 409, "kairos-template", "Kairos' own templates can't be deleted.");
    }
    await removeTemplate(userDir, template.id);
    return reply.code(204).send();
  });
}
