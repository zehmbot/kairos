import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type ExportInfo, type RendersOverview, StartRenderSchema } from "../../shared/types.ts";
import { type Film, readFilm, scanFilms } from "../films.ts";
import { openFolder } from "../open-folder.ts";
import { RenderError, type Renderer } from "../renderer.ts";
import { listRenders, RendersFileError, removeRender, renderPath } from "../renders.ts";
import type { Studio } from "../studio.ts";
import { sendError } from "./errors.ts";

export interface RenderRoutesOptions {
  studio: Studio;
  renderer: Pick<Renderer, "jobs" | "start" | "cancel">;
  exportInfo: () => Promise<ExportInfo>;
  open?: (path: string) => void;
}

interface VideoParams {
  id: string;
  version: string;
}

/** Streams a video file, with Range support so the player can seek. */
async function sendVideo(request: FastifyRequest, reply: FastifyReply, path: string) {
  const size = (await stat(path)).size;
  reply
    .header("accept-ranges", "bytes")
    .header("content-type", "video/mp4")
    .header("cache-control", "no-store");
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
  if (!match) return reply.header("content-length", size).send(createReadStream(path));

  const [, from = "", to = ""] = match;
  // "bytes=-500" means the last 500 bytes.
  const start = from === "" ? Math.max(0, size - Number(to)) : Number(from);
  const end = from !== "" && to !== "" ? Math.min(Number(to), size - 1) : size - 1;
  if (from === "" && to === "")
    return reply.code(416).header("content-range", `bytes */${size}`).send();
  if (start > end || start >= size) {
    return reply.code(416).header("content-range", `bytes */${size}`).send();
  }
  return reply
    .code(206)
    .header("content-range", `bytes ${start}-${end}/${size}`)
    .header("content-length", end - start + 1)
    .send(createReadStream(path, { start, end }));
}

/** Rendering films to video: the queue, the finished videos, and the export tools found. */
export function renderRoutes(app: FastifyInstance, options: RenderRoutesOptions): void {
  const { studio, renderer } = options;
  const open = options.open ?? openFolder;

  async function filmOr404(reply: FastifyReply, id: string): Promise<Film | null> {
    const dir = studio.filmsDir;
    if (!dir) {
      await sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
      return null;
    }
    const film = await readFilm(dir, id);
    if (!film) {
      await sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
      return null;
    }
    return film;
  }

  const noVideo = (reply: FastifyReply) =>
    sendError(reply, 404, "no-video", "This video doesn't exist (any more).");

  /** The video file of `:version`, or null after sending the error. */
  async function videoOr404(request: FastifyRequest<{ Params: VideoParams }>, reply: FastifyReply) {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return null;
    const version = Number(request.params.version);
    const path = Number.isInteger(version)
      ? await renderPath(film.path, version).catch(() => null)
      : null;
    if (!path) {
      await noVideo(reply);
      return null;
    }
    return { film, version, path };
  }

  app.get("/api/export", () => options.exportInfo());

  app.get("/api/renders", async (): Promise<RendersOverview> => {
    const dir = studio.filmsDir;
    const videos: RendersOverview["videos"] = [];
    for (const film of dir ? await scanFilms(dir) : []) {
      const renders = await listRenders(film.path).catch(() => []);
      const title = film.config?.title ?? film.id;
      for (const render of renders) videos.push({ ...render, filmId: film.id, title });
    }
    videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { jobs: renderer.jobs().reverse(), videos };
  });

  app.post<{ Params: { id: string } }>("/api/films/:id/renders", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    const body = StartRenderSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    try {
      return reply.code(202).send(await renderer.start(film.id, body.data));
    } catch (error) {
      if (error instanceof RenderError)
        return sendError(reply, 409, "cannot-render", error.message);
      throw error;
    }
  });

  app.post<{ Params: { job: string } }>("/api/renders/:job/cancel", async (request, reply) => {
    if (!renderer.cancel(request.params.job)) {
      return sendError(reply, 404, "no-job", "This render isn't running or waiting any more.");
    }
    return reply.code(204).send();
  });

  app.get<{ Params: VideoParams }>(
    "/api/films/:id/renders/:version/video",
    async (request, reply) => {
      const video = await videoOr404(request, reply);
      return video ? sendVideo(request, reply, video.path) : reply;
    },
  );

  app.post<{ Params: VideoParams }>(
    "/api/films/:id/renders/:version/open-folder",
    async (request, reply) => {
      const video = await videoOr404(request, reply);
      if (!video) return reply;
      open(dirname(video.path));
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: VideoParams }>("/api/films/:id/renders/:version", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    try {
      if (!(await removeRender(film.path, Number(request.params.version)))) return noVideo(reply);
    } catch (error) {
      if (error instanceof RendersFileError)
        return sendError(reply, 409, "renders-broken", error.message);
      throw error;
    }
    studio.events.publish({ type: "renders-changed", id: film.id });
    return reply.code(204).send();
  });
}
