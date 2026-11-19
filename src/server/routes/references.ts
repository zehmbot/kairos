import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply } from "fastify";
import { mediaKindOf } from "../../shared/media.ts";
import { FromAssetSchema, type Reference, ReferenceNoteSchema } from "../../shared/types.ts";
import { assetFile } from "../assets.ts";
import { type Film, readFilm } from "../films.ts";
import {
  addReference,
  deleteReference,
  looseReferenceFiles,
  processReference,
  REFERENCES_FOLDER,
  ReferencesFileError,
  readReferences,
  resumeProcessing,
  sheetPath,
  updateReference,
} from "../references.ts";
import type { Studio } from "../studio.ts";
import { checkUploadName, freeName, oneAtATime, saveUpload, UploadError } from "../uploads.ts";
import { assetsDirOf } from "../workspace.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}
interface RefParams extends IdParams {
  ref: string;
}

export interface ReferenceRoutesOptions {
  /** Where ffmpeg is (null when it isn't installed). */
  ffmpeg: () => Promise<string | null>;
}

/** A film's references: videos and pictures for Claude to look at. */
export function referenceRoutes(
  app: FastifyInstance,
  studio: Studio,
  options: ReferenceRoutesOptions,
): void {
  async function filmOr(reply: FastifyReply, id: string): Promise<Film | null> {
    const films = studio.filmsDir;
    if (!films) {
      sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
      return null;
    }
    const film = await readFilm(films, id);
    if (!film) sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
    return film;
  }

  const changed = (film: Film) => () =>
    studio.events.publish({ type: "references-changed", id: film.id });

  /** Starts looking inside a new reference, in the background. */
  async function start(film: Film, reference: Reference) {
    void processReference(film.path, reference, await options.ffmpeg(), changed(film));
    changed(film)();
  }

  async function guard(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof UploadError) return sendError(reply, 400, "bad-file", error.message);
      if (error instanceof ReferencesFileError)
        return sendError(reply, 409, "references", error.message);
      throw error;
    }
  }

  app.get<{ Params: IdParams }>("/api/films/:id/references", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    return guard(reply, async () => {
      let items = await readReferences(film.path);
      // Files put in references/ by hand become references too.
      const loose = await looseReferenceFiles(film.path, items);
      for (const name of loose) {
        const kind = mediaKindOf(name);
        if (kind !== "video" && kind !== "image") continue;
        await addReference(film.path, `${REFERENCES_FOLDER}/${name}`, kind);
      }
      if (loose.length) items = await readReferences(film.path);
      resumeProcessing(film.path, items, await options.ffmpeg(), changed(film));
      return items;
    });
  });

  app.post<{ Params: IdParams; Querystring: { name?: string } }>(
    "/api/films/:id/references",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      return guard(reply, async () => {
        const name = checkUploadName(request.query.name, ["video", "image"]);
        if (name.endsWith(".svg"))
          throw new UploadError("Add the picture as PNG or JPG: Claude can't look at SVG files.");
        const saved = await saveUpload(
          request.body as Readable,
          join(film.path, REFERENCES_FOLDER),
          name,
        );
        const reference = await addReference(
          film.path,
          `${REFERENCES_FOLDER}/${saved}`,
          mediaKindOf(saved) as "video" | "image",
        );
        await start(film, reference);
        return reply.code(201).send(reference);
      });
    },
  );

  app.post<{ Params: IdParams }>("/api/films/:id/references/from-asset", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = FromAssetSchema.safeParse(request.body);
    const workspace = studio.workspace;
    const file =
      input.success && workspace ? assetFile(assetsDirOf(workspace), input.data.asset) : null;
    if (!file || (file.kind !== "video" && file.kind !== "image") || file.name.endsWith(".svg")) {
      return sendError(reply, 400, "bad-file", "Pick a video or a picture from your assets.");
    }
    return guard(reply, async () => {
      const dir = join(film.path, REFERENCES_FOLDER);
      await mkdir(dir, { recursive: true });
      const saved = await oneAtATime(dir, async () => {
        const name = await freeName(dir, file.name);
        await copyFile(file.path, join(dir, name));
        return name;
      });
      const reference = await addReference(
        film.path,
        `${REFERENCES_FOLDER}/${saved}`,
        file.kind as "video" | "image",
      );
      await start(film, reference);
      return reply.code(201).send(reference);
    });
  });

  app.patch<{ Params: RefParams }>("/api/films/:id/references/:ref", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = ReferenceNoteSchema.safeParse(request.body);
    if (!input.success)
      return sendError(reply, 400, "bad-request", input.error.issues[0]?.message ?? "Bad note.");
    return guard(reply, async () => {
      const updated = await updateReference(film.path, request.params.ref, {
        note: input.data.note,
      });
      if (!updated)
        return sendError(reply, 404, "not-found", "This reference doesn't exist (any more).");
      changed(film)();
      return updated;
    });
  });

  app.delete<{ Params: RefParams }>("/api/films/:id/references/:ref", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    return guard(reply, async () => {
      if (!(await deleteReference(film.path, request.params.ref))) {
        return sendError(reply, 404, "not-found", "This reference doesn't exist (any more).");
      }
      changed(film)();
      return reply.code(204).send();
    });
  });

  app.get<{ Params: RefParams & { n: string } }>(
    "/api/films/:id/references/:ref/sheets/:n",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      const path = sheetPath(film.path, request.params.ref, Number(request.params.n));
      const jpeg = path ? await readFile(path).catch(() => null) : null;
      if (!jpeg) return sendError(reply, 404, "not-found", "No such sheet.");
      return reply.type("image/jpeg").header("cache-control", "no-store").send(jpeg);
    },
  );
}
