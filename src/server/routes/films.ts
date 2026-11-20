import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  BriefUpdateSchema,
  FilmChangeSchema,
  type FilmSummary,
  NewFilmSchema,
  SaveTemplateSchema,
} from "../../shared/types.ts";
import {
  changeFilm,
  createFilm,
  type Film,
  FilmConfigError,
  readFilm,
  scanFilms,
} from "../films.ts";
import { openFolder } from "../open-folder.ts";
import { saveScript } from "../script.ts";
import type { Studio } from "../studio.ts";
import {
  BriefFileError,
  briefMarkdown,
  checkBrief,
  findTemplate,
  makeBrief,
  readBrief,
  saveAsTemplate,
  summaryOf,
  writeBrief,
} from "../templates.ts";
import { deleteFilmForGood, moveToTrash, TrashError } from "../trash.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}

export interface FilmRoutesOptions {
  /** A picture of the film (for a saved template's card), or null when none can be taken. */
  picture?: (film: Film) => Promise<Buffer | null>;
  /** True while a render of the film is running or waiting (it can't be deleted then). */
  rendering?: (filmId: string) => boolean;
}

export function filmRoutes(
  app: FastifyInstance,
  studio: Studio,
  options: FilmRoutesOptions = {},
): void {
  const summary = (film: Film): FilmSummary => ({ ...film, previewPath: studio.previewPath(film) });

  const noWorkspace = (reply: FastifyReply) =>
    sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
  const notFound = (reply: FastifyReply) =>
    sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
  const badRequest = (reply: FastifyReply, message: string) =>
    sendError(reply, 400, "bad-request", message);

  /** The film, or null after sending the error. */
  async function filmOr404(reply: FastifyReply, id: string): Promise<Film | null> {
    const dir = studio.filmsDir;
    if (!dir) {
      await noWorkspace(reply);
      return null;
    }
    const film = await readFilm(dir, id);
    if (!film) await notFound(reply);
    return film;
  }

  app.get("/api/films", async (_request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    return (await scanFilms(dir)).map(summary);
  });

  app.get<{ Params: IdParams }>("/api/films/:id", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    return film ? summary(film) : reply;
  });

  app.post("/api/films", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    const body = NewFilmSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.issues[0]?.message ?? "Bad request.");
    const input = body.data;

    const template = await findTemplate(
      studio.templatesDir,
      studio.userTemplatesDir,
      input.template,
    );
    if (!template) return badRequest(reply, "This template doesn't exist (any more).");
    if (template.problem)
      return badRequest(reply, `This template can't be used: ${template.problem}`);
    const kind = input.kind
      ? template.kinds.find((entry) => entry.id === input.kind)
      : template.kinds[0];
    if (!kind) return badRequest(reply, "This template doesn't make that kind of film.");
    const checked = checkBrief(kind.fields, input.brief);
    const problem = Object.values(checked.errors)[0];
    if (problem) return badRequest(reply, problem);

    // A brief is kept only when something was asked for: an answer, or voices made with the film.
    const voiced = input.voices === "make";
    const brief =
      Object.keys(checked.answers).length > 0 || voiced
        ? {
            ...makeBrief(template, kind, checked.answers),
            voices: input.voices,
            ...(voiced && input.narrator ? { narrator: input.narrator.name } : {}),
            ...(voiced && input.language ? { language: input.language } : {}),
          }
        : undefined;
    const id = await createFilm(dir, template.dir, input, {
      size: template.defaults.size,
      duration: template.defaults.duration,
      brief,
      briefText: brief ? briefMarkdown(brief, input.title) : undefined,
      // The narrator you chose is the film's before anything is made (Claude keeps it).
      voices:
        voiced && input.narrator
          ? { narrator: { ...input.narrator, type: input.narrator.type ?? "narrator" } }
          : undefined,
    });
    // The language the voices speak: casting and the script use it.
    if (voiced && input.language && input.language !== "en") {
      await saveScript(join(dir, id), { language: input.language, lines: [] }, "you");
    }
    const film = await readFilm(dir, id);
    if (!film)
      return sendError(reply, 500, "create-failed", "The film was made but can't be read.");
    return reply.code(201).send(summary(film));
  });

  app.patch<{ Params: IdParams }>("/api/films/:id", async (request, reply) => {
    const body = FilmChangeSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.issues[0]?.message ?? "Bad request.");
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    try {
      await changeFilm(film.path, body.data);
    } catch (error) {
      if (error instanceof FilmConfigError) {
        return sendError(reply, 409, "film-config", error.message);
      }
      throw error;
    }
    const changed = await readFilm(studio.filmsDir ?? "", film.id);
    return changed ? summary(changed) : notFound(reply);
  });

  // Delete: to the workspace trash (it can be restored), or for good with ?forever=true.
  app.delete<{ Params: IdParams; Querystring: { forever?: string } }>(
    "/api/films/:id",
    async (request, reply) => {
      const film = await filmOr404(reply, request.params.id);
      if (!film) return reply;
      const trash = studio.trashDir;
      const films = studio.filmsDir;
      if (!trash || !films) return noWorkspace(reply);
      if (options.rendering?.(film.id)) {
        return sendError(
          reply,
          409,
          "rendering",
          "A render of this film is running or waiting. Cancel it first, on the Renders page.",
        );
      }
      try {
        if (request.query.forever === "true") await deleteFilmForGood(films, film.id);
        else await moveToTrash(films, trash, film.id);
      } catch (error) {
        if (error instanceof TrashError) return sendError(reply, 409, "trash", error.message);
        throw error;
      }
      studio.events.publish({ type: "films-changed", ids: [film.id] });
      // Its videos went with it.
      studio.events.publish({ type: "renders-changed", id: film.id });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: IdParams }>("/api/films/:id/open-folder", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    openFolder(film.path);
    return reply.code(204).send();
  });

  /** The film's brief, or null after sending the error. */
  async function briefOr404(reply: FastifyReply, film: Film) {
    try {
      const brief = await readBrief(film.path);
      if (!brief) await sendError(reply, 404, "no-brief", "This film was made without a brief.");
      return brief;
    } catch (error) {
      if (!(error instanceof BriefFileError)) throw error;
      await sendError(reply, 409, "brief-broken", error.message);
      return null;
    }
  }

  app.get<{ Params: IdParams }>("/api/films/:id/brief", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    return (await briefOr404(reply, film)) ?? reply;
  });

  app.put<{ Params: IdParams }>("/api/films/:id/brief", async (request, reply) => {
    const body = BriefUpdateSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.issues[0]?.message ?? "Bad request.");
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    const brief = await briefOr404(reply, film);
    if (!brief) return reply;
    const checked = checkBrief(brief.fields, body.data.answers);
    const problem = Object.values(checked.errors)[0];
    if (problem) return badRequest(reply, problem);
    const updated = { ...brief, answers: checked.answers, updatedAt: new Date().toISOString() };
    await writeBrief(film.path, updated, film.config?.title ?? film.id);
    return updated;
  });

  app.post<{ Params: IdParams }>("/api/films/:id/save-as-template", async (request, reply) => {
    const body = SaveTemplateSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, body.error.issues[0]?.message ?? "Bad request.");
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    const userDir = studio.userTemplatesDir;
    if (!userDir) return noWorkspace(reply);
    if (!film.config || film.problem) {
      return sendError(reply, 409, "film-problem", "Fix the film before saving it as a template.");
    }
    const brief = await readBrief(film.path).catch(() => null);
    const picture = (await options.picture?.(film).catch(() => null)) ?? null;
    const id = await saveAsTemplate(
      { path: film.path, config: film.config },
      userDir,
      { name: body.data.name, description: body.data.description },
      brief,
      picture,
    );
    const template = await findTemplate(studio.templatesDir, userDir, id);
    return template ? reply.code(201).send(summaryOf(template)) : notFound(reply);
  });
}
