import type { FastifyInstance, FastifyReply } from "fastify";
import { FilmChangeSchema, type FilmSummary, NewFilmSchema } from "../../shared/types.ts";
import {
  changeFilm,
  createFilm,
  type Film,
  FilmConfigError,
  readFilm,
  scanFilms,
} from "../films.ts";
import { openFolder } from "../open-folder.ts";
import type { Studio } from "../studio.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}

export function filmRoutes(app: FastifyInstance, studio: Studio): void {
  const summary = (film: Film): FilmSummary => ({ ...film, previewPath: studio.previewPath(film) });

  const noWorkspace = (reply: FastifyReply) =>
    sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
  const notFound = (reply: FastifyReply) =>
    sendError(reply, 404, "not-found", "This film doesn't exist (any more).");

  app.get("/api/films", async (_request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    return (await scanFilms(dir)).map(summary);
  });

  app.get<{ Params: IdParams }>("/api/films/:id", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    const film = await readFilm(dir, request.params.id);
    return film ? summary(film) : notFound(reply);
  });

  app.post("/api/films", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    const body = NewFilmSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    const id = await createFilm(dir, studio.templateDir, body.data);
    const film = await readFilm(dir, id);
    if (!film) {
      return sendError(reply, 500, "create-failed", "The film was made but can't be read.");
    }
    return reply.code(201).send(summary(film));
  });

  app.patch<{ Params: IdParams }>("/api/films/:id", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    const body = FilmChangeSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    const film = await readFilm(dir, request.params.id);
    if (!film) return notFound(reply);
    try {
      await changeFilm(film.path, body.data);
    } catch (error) {
      if (error instanceof FilmConfigError) {
        return sendError(reply, 409, "film-config", error.message);
      }
      throw error;
    }
    const changed = await readFilm(dir, film.id);
    return changed ? summary(changed) : notFound(reply);
  });

  app.post<{ Params: IdParams }>("/api/films/:id/open-folder", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return noWorkspace(reply);
    const film = await readFilm(dir, request.params.id);
    if (!film) return notFound(reply);
    openFolder(film.path);
    return reply.code(204).send();
  });
}
