import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply } from "fastify";
import { contentTypeOf } from "../../shared/media.ts";
import { AudioTrackSchema } from "../../shared/types.ts";
import { assetFile, copyAssetToFilm, deleteAsset, importAsset, listAssets } from "../assets.ts";
import { changeFilm, FilmConfigError, readFilm } from "../films.ts";
import { openFolder } from "../open-folder.ts";
import type { Studio } from "../studio.ts";
import { UploadError } from "../uploads.ts";
import { assetsDirOf } from "../workspace.ts";
import { sendError } from "./errors.ts";

interface AssetParams {
  kind: string;
  name: string;
}

export interface AssetRoutesOptions {
  open?: (path: string) => void;
}

/** The asset library: list, import, preview, use in a film, delete. */
export function assetRoutes(
  app: FastifyInstance,
  studio: Studio,
  options: AssetRoutesOptions = {},
): void {
  const open = options.open ?? openFolder;
  const noWorkspace = (reply: FastifyReply) =>
    sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
  const dir = () => (studio.workspace ? assetsDirOf(studio.workspace) : null);
  const changed = () => studio.events.publish({ type: "assets-changed" });

  async function guard<T>(reply: FastifyReply, action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof UploadError) return sendError(reply, 400, "bad-file", error.message);
      if (error instanceof FilmConfigError)
        return sendError(reply, 409, "film-problem", error.message);
      throw error;
    }
  }

  app.get("/api/assets", async (_request, reply) => {
    const assets = dir();
    return assets ? listAssets(assets) : noWorkspace(reply);
  });

  app.post<{ Querystring: { name?: string } }>("/api/assets", async (request, reply) => {
    const assets = dir();
    if (!assets) return noWorkspace(reply);
    return guard(reply, async () => {
      const asset = await importAsset(assets, request.body as Readable, request.query.name);
      changed();
      return reply.code(201).send(asset);
    });
  });

  app.get<{ Params: AssetParams }>("/api/assets/:kind/:name/file", async (request, reply) => {
    const assets = dir();
    const file = assets ? assetFile(assets, `${request.params.kind}/${request.params.name}`) : null;
    const info = file ? await stat(file.path).catch(() => null) : null;
    if (!file || !info?.isFile())
      return sendError(reply, 404, "not-found", "This asset doesn't exist (any more).");
    return reply
      .type(contentTypeOf(file.name))
      .header("content-length", info.size)
      .header("cache-control", "no-store")
      .send(createReadStream(file.path));
  });

  // Use in a film: copy it in; a sound also becomes a sound track (starting at `start`).
  app.post<{ Params: AssetParams; Body: { film?: string; start?: number } }>(
    "/api/assets/:kind/:name/use",
    async (request, reply) => {
      const assets = dir();
      const films = studio.filmsDir;
      if (!assets || !films) return noWorkspace(reply);
      const film = await readFilm(films, String(request.body?.film ?? ""));
      if (!film) return sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
      return guard(reply, async () => {
        const id = `${request.params.kind}/${request.params.name}`;
        const path = await copyAssetToFilm(assets, id, film.path);
        if (assetFile(assets, id)?.kind === "sound" && film.config) {
          const track = AudioTrackSchema.parse({
            file: path,
            start: Math.max(0, Number(request.body?.start) || 0),
          });
          await changeFilm(film.path, { audio: [...film.config.audio, track] });
        }
        studio.events.publish({ type: "films-changed", ids: [film.id] });
        return { path };
      });
    },
  );

  app.delete<{ Params: AssetParams }>("/api/assets/:kind/:name", async (request, reply) => {
    const assets = dir();
    if (!assets) return noWorkspace(reply);
    return guard(reply, async () => {
      await deleteAsset(assets, `${request.params.kind}/${request.params.name}`);
      changed();
      return reply.code(204).send();
    });
  });

  app.post("/api/assets/open-folder", async (_request, reply) => {
    const assets = dir();
    if (!assets) return noWorkspace(reply);
    await mkdir(assets, { recursive: true });
    open(assets);
    return reply.code(204).send();
  });
}
