import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AudioChangeSchema, AudioTrackSchema, FromAssetSchema } from "../../shared/types.ts";
import { assetFile, copyAssetToFilm } from "../assets.ts";
import { changeFilm, type Film, FilmConfigError, readFilm } from "../films.ts";
import type { Studio } from "../studio.ts";
import { checkUploadName, saveUpload, UploadError } from "../uploads.ts";
import { assetsDirOf, resolveInside } from "../workspace.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}

/** A film's sound tracks: add a sound file (or a library sound), change the list. */
export function soundRoutes(app: FastifyInstance, studio: Studio): void {
  /** The film, ready to change its sound (it must have a readable kairos.json). */
  async function filmOr(
    reply: FastifyReply,
    id: string,
  ): Promise<(Film & { config: NonNullable<Film["config"]> }) | null> {
    const films = studio.filmsDir;
    if (!films) {
      sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
      return null;
    }
    const film = await readFilm(films, id);
    if (!film) {
      sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
      return null;
    }
    if (!film.config || film.problem) {
      sendError(
        reply,
        409,
        "film-problem",
        film.problem ?? "This film's kairos.json can't be read.",
      );
      return null;
    }
    return film as Film & { config: NonNullable<Film["config"]> };
  }

  /** Adds a track and tells the UI. Plain-words problems become answers. */
  async function addTrack(
    reply: FastifyReply,
    film: Film & { config: NonNullable<Film["config"]> },
    file: string,
    start: number,
  ) {
    const track = AudioTrackSchema.parse({ file, start: Math.max(0, start) });
    const config = await changeFilm(film.path, { audio: [...film.config.audio, track] });
    studio.events.publish({ type: "films-changed", ids: [film.id] });
    return reply.code(201).send({ track, audio: config.audio });
  }

  async function guard(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof UploadError) return sendError(reply, 400, "bad-file", error.message);
      if (error instanceof FilmConfigError)
        return sendError(reply, 409, "film-problem", error.message);
      throw error;
    }
  }

  app.post<{ Params: IdParams; Querystring: { name?: string; start?: string } }>(
    "/api/films/:id/sounds",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      return guard(reply, async () => {
        const name = checkUploadName(request.query.name, ["sound"]);
        const saved = await saveUpload(request.body as Readable, join(film.path, "audio"), name);
        return addTrack(reply, film, `audio/${saved}`, Number(request.query.start) || 0);
      });
    },
  );

  app.post<{ Params: IdParams }>("/api/films/:id/sounds/from-asset", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = FromAssetSchema.safeParse(request.body);
    const workspace = studio.workspace;
    if (!input.success || !workspace)
      return sendError(reply, 400, "bad-request", "Say which sound to add.");
    const assets = assetsDirOf(workspace);
    if (assetFile(assets, input.data.asset)?.kind !== "sound") {
      return sendError(reply, 400, "bad-file", "Pick a sound from your assets.");
    }
    return guard(reply, async () => {
      const file = await copyAssetToFilm(assets, input.data.asset, film.path);
      return addTrack(reply, film, file, input.data.start ?? 0);
    });
  });

  // The whole list: start times, volumes, removed tracks. Every file must be inside the film.
  app.put<{ Params: IdParams }>("/api/films/:id/audio", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = AudioChangeSchema.safeParse(request.body);
    if (!input.success) {
      return sendError(
        reply,
        400,
        "bad-request",
        input.error.issues[0]?.message ?? "These sound tracks have a problem.",
      );
    }
    for (const track of input.data.audio) {
      const path = resolveInside(film.path, track.file);
      const info = path ? await stat(path).catch(() => null) : null;
      if (!info?.isFile()) {
        return sendError(
          reply,
          400,
          "bad-file",
          `The sound file "${track.file}" isn't in this film's folder.`,
        );
      }
    }
    return guard(reply, async () => {
      const config = await changeFilm(film.path, { audio: input.data.audio });
      studio.events.publish({ type: "films-changed", ids: [film.id] });
      return { audio: config.audio };
    });
  });
}
