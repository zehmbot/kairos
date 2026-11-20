import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply } from "fastify";
import { isPicture, PICTURE_SECONDS } from "../../shared/clips.ts";
import { nextLane } from "../../shared/lanes.ts";
import { contentTypeOf, mediaKindOf } from "../../shared/media.ts";
import {
  AudioChangeSchema,
  type AudioTrack,
  AudioTrackSchema,
  FromAssetSchema,
  TracksChangeSchema,
  type VideoClip,
  VideoClipSchema,
} from "../../shared/types.ts";
import { assetFile, copyAssetToFilm } from "../assets.ts";
import { changeFilm, type Film, FilmConfigError, readFilm } from "../films.ts";
import { effectsLane, FilmSoundsSchema, noteEffectEdits, syncEffectSounds } from "../fx.ts";
import { makeScript, syncScriptWithTimeline } from "../script.ts";
import { SOUND_NAMES, SOUNDS, soundInFilm, soundWav } from "../sounds.ts";
import type { Studio } from "../studio.ts";
import { checkUploadName, saveUpload, UploadError } from "../uploads.ts";
import { assetsDirOf, resolveInside } from "../workspace.ts";
import { sendError } from "./errors.ts";

interface IdParams {
  id: string;
}

/**
 * A film's timeline: sound tracks (add a sound file or a library sound, change the list) and video clips (add a
 * video or picture, or a library one; save both lists together).
 */
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
    lane?: number,
  ) {
    // A new sound gets its own timeline track, unless it was dropped on one. Dropped on the Effects lane, it is
    // an effect too.
    const onEffects =
      lane !== undefined && film.config.audio.some((track) => track.sfx && track.lane === lane);
    const track = AudioTrackSchema.parse({
      file,
      start: Math.max(0, start),
      lane: lane ?? nextLane(film.config.audio),
      ...(onEffects ? { sfx: true } : {}),
    });
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

  app.post<{ Params: IdParams; Querystring: { name?: string; start?: string; lane?: string } }>(
    "/api/films/:id/sounds",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      return guard(reply, async () => {
        const name = checkUploadName(request.query.name, ["sound"]);
        const saved = await saveUpload(request.body as Readable, join(film.path, "audio"), name);
        const lane = Number(request.query.lane);
        return addTrack(
          reply,
          film,
          `audio/${saved}`,
          Number(request.query.start) || 0,
          Number.isInteger(lane) && lane >= 0 && lane <= 31 ? lane : undefined,
        );
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

  // A sound file of the film, for the timeline's waveforms (the app can't read the film server's files).
  app.get<{ Params: IdParams; Querystring: { path?: string } }>(
    "/api/films/:id/sounds/file",
    async (request, reply) => {
      const films = studio.filmsDir;
      const film = films ? await readFilm(films, request.params.id) : null;
      const path = film && request.query.path ? resolveInside(film.path, request.query.path) : null;
      const info =
        path && mediaKindOf(path) === "sound" ? await stat(path).catch(() => null) : null;
      if (!path || !info?.isFile())
        return sendError(reply, 404, "not-found", "No such sound file.");
      return reply
        .type(contentTypeOf(path))
        .header("content-length", info.size)
        .header("cache-control", "no-store")
        .send(createReadStream(path));
    },
  );

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
      const config = await saveTimeline(film, { audio: input.data.audio });
      return { audio: config.audio };
    });
  });

  /** Every file must be a file inside the film. Returns the first problem, or null. */
  async function missingFile(
    film: Film,
    files: readonly { file: string }[],
    what: string,
  ): Promise<string | null> {
    for (const { file } of files) {
      const path = resolveInside(film.path, file);
      const info = path ? await stat(path).catch(() => null) : null;
      if (!info?.isFile()) return `The ${what} "${file}" isn't in this film's folder.`;
    }
    return null;
  }

  /** Puts a video or picture on the timeline and tells the UI. */
  async function addClip(
    reply: FastifyReply,
    film: Film & { config: NonNullable<Film["config"]> },
    file: string,
    start: number,
    lane?: number,
  ) {
    // A new clip gets its own video track, unless it was dropped on one. A picture shows for a few seconds.
    const clip = VideoClipSchema.parse({
      file,
      start: Math.max(0, start),
      lane: lane ?? nextLane(film.config.video),
      ...(isPicture(file) ? { length: PICTURE_SECONDS } : {}),
    });
    const config = await changeFilm(film.path, {
      audio: film.config.audio,
      video: [...film.config.video, clip],
    });
    studio.events.publish({ type: "films-changed", ids: [film.id] });
    return reply.code(201).send({ clip, video: config.video });
  }

  app.post<{ Params: IdParams; Querystring: { name?: string; start?: string; lane?: string } }>(
    "/api/films/:id/clips",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      return guard(reply, async () => {
        const name = checkUploadName(request.query.name, ["video", "image"]);
        const folder = `assets/${mediaKindOf(name) === "image" ? "images" : "videos"}`;
        const saved = await saveUpload(
          request.body as Readable,
          join(film.path, ...folder.split("/")),
          name,
        );
        const lane = Number(request.query.lane);
        return addClip(
          reply,
          film,
          `${folder}/${saved}`,
          Number(request.query.start) || 0,
          Number.isInteger(lane) && lane >= 0 && lane <= 15 ? lane : undefined,
        );
      });
    },
  );

  app.post<{ Params: IdParams }>("/api/films/:id/clips/from-asset", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = FromAssetSchema.safeParse(request.body);
    const workspace = studio.workspace;
    if (!input.success || !workspace)
      return sendError(reply, 400, "bad-request", "Say which video or picture to add.");
    const assets = assetsDirOf(workspace);
    const kind = assetFile(assets, input.data.asset)?.kind;
    if (kind !== "video" && kind !== "image") {
      return sendError(reply, 400, "bad-file", "Pick a video or a picture from your assets.");
    }
    return guard(reply, async () => {
      const file = await copyAssetToFilm(assets, input.data.asset, film.path);
      return addClip(reply, film, file, input.data.start ?? 0);
    });
  });

  // The timeline: sound tracks and video clips, saved together (one Undo list). Every file must be in the film.
  app.put<{ Params: IdParams }>("/api/films/:id/tracks", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = TracksChangeSchema.safeParse(request.body);
    if (!input.success) {
      return sendError(
        reply,
        400,
        "bad-request",
        input.error.issues[0]?.message ?? "These tracks have a problem.",
      );
    }
    const problem =
      (await missingFile(film, input.data.audio, "sound file")) ??
      (await missingFile(film, input.data.video, "video clip"));
    if (problem) return sendError(reply, 400, "bad-file", problem);
    return guard(reply, async () => {
      const config = await saveTimeline(film, input.data);
      return { audio: config.audio, video: config.video };
    });
  });

  /**
   * Saves the timeline. Effect sounds you moved keep their place, and ones you deleted stay deleted. A voice clip
   * moved or taken out takes its script line along; in a film whose narration is packed, the voices are packed
   * again (in their new order).
   */
  async function saveTimeline(
    film: Film & { config: NonNullable<Film["config"]> },
    change: { audio: AudioTrack[]; video?: VideoClip[] },
  ) {
    const edits = noteEffectEdits(film.config.audio, change.audio);
    const removed = [...new Set([...(film.config.sfxRemoved ?? []), ...edits.removed])];
    let config = await changeFilm(film.path, {
      ...change,
      audio: edits.tracks,
      ...(edits.removed.length > 0 ? { sfxRemoved: removed } : {}),
    });
    const moved = await syncScriptWithTimeline(film.path, film.config.audio, config.audio);
    if (moved && config.narration === "packed") {
      await makeScript(film.path, { voices: config.voices ?? {}, model: "" }).catch(() => null);
      config = (await readFilm(studio.filmsDir ?? "", film.id))?.config ?? config;
    }
    studio.events.publish({ type: "films-changed", ids: [film.id] });
    return config;
  }

  // ---------- Sound effects: Kairos' own sounds, and the ones a film places ----------

  app.get("/api/sounds", async () => SOUNDS);

  app.get<{ Params: { name: string } }>("/api/sounds/:name", async (request, reply) => {
    if (!SOUND_NAMES.includes(request.params.name)) {
      return sendError(reply, 404, "not-found", "There's no such sound.");
    }
    return reply
      .type("audio/wav")
      .header("cache-control", "max-age=3600")
      .send(soundWav(request.params.name));
  });

  // The film says which effect sounds it places (Blocky Story: window.KAIROS_SOUNDS): the Effects lane follows.
  app.put<{ Params: IdParams }>("/api/films/:id/fx", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = FilmSoundsSchema.safeParse((request.body as { sounds?: unknown } | null)?.sounds);
    if (!input.success) return sendError(reply, 400, "bad-request", "These sounds have a problem.");
    return guard(reply, async () => {
      const changed = await syncEffectSounds(film.path, input.data);
      if (changed) studio.events.publish({ type: "films-changed", ids: [film.id] });
      return { changed };
    });
  });

  // You add one of Kairos' sounds to the Effects lane (at the playhead).
  app.post<{ Params: IdParams }>("/api/films/:id/fx", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const body = (request.body ?? {}) as { sound?: unknown; start?: unknown };
    const sound = typeof body.sound === "string" ? body.sound : "";
    if (!SOUND_NAMES.includes(sound)) return sendError(reply, 400, "bad-request", "Pick a sound.");
    const start = Math.max(0, Number(body.start) || 0);
    return guard(reply, async () => {
      const file = await soundInFilm(film.path, sound);
      const track = AudioTrackSchema.parse({
        file,
        start: Math.round(start * 1000) / 1000,
        volume: 0.6,
        lane: effectsLane(film.config.audio),
        sfx: true,
      });
      const config = await changeFilm(film.path, { audio: [...film.config.audio, track] });
      studio.events.publish({ type: "films-changed", ids: [film.id] });
      return { audio: config.audio };
    });
  });
}
