import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { STORY_LENGTH_HEADER } from "../../shared/film-protocol.ts";
import type { Camera } from "../camera.ts";
import { type Film, readFilm } from "../films.ts";
import type { Studio } from "../studio.ts";
import { filmThumbnail, thumbnailTime } from "../thumbnails.ts";
import { sendError } from "./errors.ts";

export interface FrameRoutesOptions {
  studio: Studio;
  camera: Pick<Camera, "browser" | "capture" | "captureFrame">;
  /** Address of the film server, like `http://127.0.0.1:7342`, for the camera. */
  filmServerUrl: string;
}

const FrameQuerySchema = z.object({
  t: z.coerce
    .number({ error: "Say which moment to show: t, in seconds." })
    .min(0, "t can't be before the start of the film."),
});

/** Leaves room for float rounding on the very last frame. */
const TIME_SLACK = 0.001;

/** Card pictures are small: the longest side in pixels. */
const THUMB_SIDE = 480;

/**
 * The film's card picture (cached in `.kairos/thumb.png`), or null when there's no browser or the film
 * can't be shown. Also used as a saved template's picture.
 */
export function filmPicture(options: FrameRoutesOptions) {
  return async (film: Film): Promise<Buffer | null> => {
    const path = options.studio.previewPath(film);
    const config = film.config;
    if (!options.camera.browser || !config || !path) return null;
    return filmThumbnail(film, () =>
      options.camera.capture({
        url: `${options.filmServerUrl}${path}`,
        width: config.width,
        height: config.height,
        t: thumbnailTime(config.duration),
        maxSide: THUMB_SIDE,
      }),
    );
  };
}

/** GET /api/films/:id/frame?t=2.5: a fresh PNG picture of one frame (Claude uses it to check its work). */
export function frameRoutes(app: FastifyInstance, options: FrameRoutesOptions): void {
  const { studio, camera } = options;
  const picture = filmPicture(options);

  // A film card's picture. No picture (no browser, a broken film) is a quiet 404: the card keeps its icon.
  app.get<{ Params: { id: string } }>("/api/films/:id/thumbnail", async (request, reply) => {
    const dir = studio.filmsDir;
    const film = dir ? await readFilm(dir, request.params.id) : null;
    const png = film ? await picture(film).catch(() => null) : null;
    if (!png) return sendError(reply, 404, "no-picture", "No picture of this film yet.");
    return reply.type("image/png").header("cache-control", "no-store").send(png);
  });

  app.get<{ Params: { id: string } }>("/api/films/:id/frame", async (request, reply) => {
    const dir = studio.filmsDir;
    if (!dir) return sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
    const film = await readFilm(dir, request.params.id);
    if (!film) return sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
    const path = studio.previewPath(film);
    if (!film.config || !path) {
      return sendError(reply, 409, "film-problem", film.problem ?? "This film can't be shown yet.");
    }
    const query = FrameQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, 400, "bad-request", query.error.issues[0]?.message ?? "Bad request.");
    }
    const { t } = query.data;
    if (t > film.config.duration + TIME_SLACK) {
      return sendError(
        reply,
        400,
        "bad-request",
        `t is after the end of the film (it lasts ${film.config.duration} s).`,
      );
    }
    if (!camera.browser) {
      return sendError(
        reply,
        409,
        "no-camera",
        "Kairos could not find Chrome or Edge to take pictures.",
      );
    }
    try {
      const { png, length } = await camera.captureFrame({
        url: `${options.filmServerUrl}${path}`,
        width: film.config.width,
        height: film.config.height,
        t: Math.min(t, film.config.duration),
      });
      // How long the film says its story lasts (Blocky follows its voices), for Claude to fit the length.
      if (length !== null)
        reply.header(STORY_LENGTH_HEADER, String(Math.round(length * 1000) / 1000));
      return reply.type("image/png").header("cache-control", "no-store").send(png);
    } catch (error) {
      // "The film could not draw this frame: ..." is the film's own error: Claude needs to read it.
      return sendError(reply, 422, "frame-failed", (error as Error).message);
    }
  });
}
