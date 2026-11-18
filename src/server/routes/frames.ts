import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Camera } from "../camera.ts";
import { readFilm } from "../films.ts";
import type { Studio } from "../studio.ts";
import { sendError } from "./errors.ts";

export interface FrameRoutesOptions {
  studio: Studio;
  camera: Pick<Camera, "browser" | "capture">;
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

/** GET /api/films/:id/frame?t=2.5: a fresh PNG picture of one frame (Claude uses it to check its work). */
export function frameRoutes(app: FastifyInstance, options: FrameRoutesOptions): void {
  const { studio, camera } = options;

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
      const png = await camera.capture({
        url: `${options.filmServerUrl}${path}`,
        width: film.config.width,
        height: film.config.height,
        t: Math.min(t, film.config.duration),
      });
      return reply.type("image/png").header("cache-control", "no-store").send(png);
    } catch (error) {
      // "The film could not draw this frame: ..." is the film's own error: Claude needs to read it.
      return sendError(reply, 422, "frame-failed", (error as Error).message);
    }
  });
}
