import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { shapeOf } from "../../shared/export.ts";
import { srtToVtt } from "../../shared/subtitles.ts";
import {
  type ExportInfo,
  type FilmShape,
  type Picture,
  type RendersOverview,
  SavePictureSchema,
  StartRenderSchema,
} from "../../shared/types.ts";
import { CannotReshape } from "../camera.ts";
import { type Film, readFilm, scanFilms } from "../films.ts";
import { openFolder } from "../open-folder.ts";
import { RenderError, type Renderer } from "../renderer.ts";
import {
  addPicture,
  listPictures,
  listRenders,
  nextPictureNumber,
  pictureName,
  picturePath,
  RENDERS_DIR,
  RendersFileError,
  removePicture,
  removeRender,
  renderPath,
} from "../renders.ts";
import type { Studio } from "../studio.ts";
import { resolveInside } from "../workspace.ts";
import { sendError } from "./errors.ts";

export interface RenderRoutesOptions {
  studio: Studio;
  renderer: Pick<Renderer, "jobs" | "start" | "cancel">;
  exportInfo: () => Promise<ExportInfo>;
  open?: (path: string) => void;
  /**
   * A full-size picture of the film's frame at `t`, in another shape when asked (routes/frames.ts `framePicture`).
   * Missing: there is no browser to take pictures with.
   */
  picture?: (
    film: Film,
    t: number,
    shape?: FilmShape,
  ) => Promise<{ png: Buffer; width: number; height: number }>;
}

interface PictureParams {
  id: string;
  number: string;
}

/** Leaves room for float rounding on the very last frame. */
const TIME_SLACK = 0.001;

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
    const pictures: RendersOverview["pictures"] = [];
    for (const film of dir ? await scanFilms(dir) : []) {
      const title = film.config?.title ?? film.id;
      for (const render of await listRenders(film.path).catch(() => [])) {
        videos.push({ ...render, filmId: film.id, title });
      }
      for (const picture of await listPictures(film.path).catch(() => [])) {
        pictures.push({ ...picture, filmId: film.id, title });
      }
    }
    videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    pictures.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { jobs: renderer.jobs().reverse(), videos, pictures };
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

  // The video's subtitles as WebVTT, for the app's player (the file next to the video stays SRT).
  app.get<{ Params: VideoParams }>(
    "/api/films/:id/renders/:version/subtitles.vtt",
    async (request, reply) => {
      const film = await filmOr404(reply, request.params.id);
      if (!film) return reply;
      const version = Number(request.params.version);
      const render = (await listRenders(film.path).catch(() => [])).find(
        (entry) => entry.version === version,
      );
      const path = render?.subtitles ? resolveInside(film.path, render.subtitles) : null;
      const srt = path ? await readFile(path, "utf8").catch(() => null) : null;
      if (srt === null) {
        return sendError(reply, 404, "no-subtitles", "This video has no subtitles.");
      }
      return reply
        .type("text/vtt; charset=utf-8")
        .header("cache-control", "no-store")
        .send(srtToVtt(srt));
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

  // ---------- Saved pictures: a frame at full size, for a cover or a thumbnail ----------

  const noPicture = (reply: FastifyReply) =>
    sendError(reply, 404, "no-picture", "This picture doesn't exist (any more).");

  /** The file of `:number`, or null after sending the error. */
  async function pictureOr404(
    request: FastifyRequest<{ Params: PictureParams }>,
    reply: FastifyReply,
  ) {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return null;
    const number = Number(request.params.number);
    const path = Number.isInteger(number)
      ? await picturePath(film.path, number).catch(() => null)
      : null;
    if (!path) {
      await noPicture(reply);
      return null;
    }
    return { film, number, path };
  }

  app.post<{ Params: { id: string } }>("/api/films/:id/pictures", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    const config = film.config;
    if (!config || film.problem) {
      return sendError(reply, 409, "film-problem", film.problem ?? "This film can't be shown yet.");
    }
    const body = SavePictureSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    const { t, shape } = body.data;
    if (t > config.duration + TIME_SLACK) {
      return sendError(
        reply,
        400,
        "bad-request",
        `t is after the end of the film (it lasts ${config.duration} s).`,
      );
    }
    if (!options.picture) {
      return sendError(
        reply,
        409,
        "no-camera",
        "Kairos could not find Chrome or Edge to take pictures.",
      );
    }
    let shot: { png: Buffer; width: number; height: number };
    try {
      shot = await options.picture(film, Math.min(t, config.duration), shape);
    } catch (error) {
      if (error instanceof CannotReshape) {
        return sendError(reply, 409, "cannot-reshape", error.message);
      }
      return sendError(reply, 422, "frame-failed", (error as Error).message);
    }
    try {
      const number = await nextPictureNumber(film.path, film.id);
      const name = pictureName(film.id, number);
      await mkdir(join(film.path, RENDERS_DIR), { recursive: true });
      await writeFile(join(film.path, RENDERS_DIR, name), shot.png);
      const picture: Picture = {
        number,
        file: `${RENDERS_DIR}/${name}`,
        createdAt: new Date().toISOString(),
        t: Math.round(t * 1000) / 1000,
        width: shot.width,
        height: shot.height,
        shape: shapeOf(shot),
        bytes: shot.png.length,
      };
      await addPicture(film.path, picture);
      studio.events.publish({ type: "renders-changed", id: film.id });
      return reply.code(201).send(picture);
    } catch (error) {
      if (error instanceof RendersFileError)
        return sendError(reply, 409, "renders-broken", error.message);
      throw error;
    }
  });

  app.get<{ Params: PictureParams }>(
    "/api/films/:id/pictures/:number/image",
    async (request, reply) => {
      const picture = await pictureOr404(request, reply);
      if (!picture) return reply;
      return reply
        .type("image/png")
        .header("cache-control", "no-store")
        .send(createReadStream(picture.path));
    },
  );

  app.post<{ Params: PictureParams }>(
    "/api/films/:id/pictures/:number/open-folder",
    async (request, reply) => {
      const picture = await pictureOr404(request, reply);
      if (!picture) return reply;
      open(dirname(picture.path));
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: PictureParams }>(
    "/api/films/:id/pictures/:number",
    async (request, reply) => {
      const film = await filmOr404(reply, request.params.id);
      if (!film) return reply;
      try {
        if (!(await removePicture(film.path, Number(request.params.number))))
          return noPicture(reply);
      } catch (error) {
        if (error instanceof RendersFileError)
          return sendError(reply, 409, "renders-broken", error.message);
        throw error;
      }
      studio.events.publish({ type: "renders-changed", id: film.id });
      return reply.code(204).send();
    },
  );
}
