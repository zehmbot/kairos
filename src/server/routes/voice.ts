import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mediaKindOf } from "../../shared/media.ts";
import { AudioTrackSchema, FilmVoicesSchema, NewLinesSchema } from "../../shared/types.ts";
import { changeFilm, readFilm } from "../films.ts";
import { checkKey, FISH_KEY_NAME, FISH_MODELS, listVoices, speak, transcribe } from "../fish.ts";
import { writeSecret } from "../secrets.ts";
import type { Studio } from "../studio.ts";
import { deleteLine, makeLines, readLines, readWords, voiceLane, writeWords } from "../voices.ts";
import { resolveInside } from "../workspace.ts";
import { sendError } from "./errors.ts";
import { type VoiceRoutesOptions, voiceContext } from "./voice-context.ts";

interface IdParams {
  id: string;
}

export type { VoiceRoutesOptions } from "./voice-context.ts";

const round = (t: number) => Math.round(t * 100) / 100;

/** Voices from fish.audio: the key, the library, a film's speakers and lines, and word timings. */
export function voiceRoutes(
  app: FastifyInstance,
  studio: Studio,
  options: VoiceRoutesOptions = {},
): void {
  const { model, status, fish, filmOr, guard } = voiceContext(studio, options);

  // ---------- The key and the model ----------

  app.get("/api/voice/status", async () => status());

  app.put("/api/voice/key", async (request, reply) => {
    const input = z
      .object({
        key: z.string().trim().min(8, "This doesn't look like a fish.audio key.").max(400),
      })
      .safeParse(request.body);
    if (!input.success)
      return sendError(reply, 400, "bad-key", input.error.issues[0]?.message ?? "Bad key.");
    if (/\s/.test(input.data.key))
      return sendError(reply, 400, "bad-key", "A key has no spaces in it.");
    return guard(reply, async () => {
      // Only a key fish.audio accepts is saved.
      await checkKey({ key: input.data.key, baseUrl: options.fishUrl });
      await writeSecret(studio.home, FISH_KEY_NAME, input.data.key);
      return status();
    });
  });

  app.delete("/api/voice/key", async () => {
    await writeSecret(studio.home, FISH_KEY_NAME, null);
    return status();
  });

  app.post("/api/voice/check", async (_request, reply) => {
    const connection = await fish(reply);
    if (!connection) return reply;
    return guard(reply, async () => {
      await checkKey(connection);
      return { ok: true };
    });
  });

  app.put("/api/voice/model", async (request, reply) => {
    const input = z.object({ model: z.enum(FISH_MODELS) }).safeParse(request.body);
    if (!input.success)
      return sendError(reply, 400, "bad-model", "Pick one of the models in the list.");
    await studio.setVoiceModel(input.data.model);
    return status();
  });

  app.get<{ Querystring: { query?: string; mine?: string } }>(
    "/api/voice/library",
    async (request, reply) => {
      const connection = await fish(reply);
      if (!connection) return reply;
      return guard(reply, () =>
        listVoices(connection, {
          query: request.query.query ?? "",
          mine: request.query.mine === "true",
        }),
      );
    },
  );

  // ---------- A film's speakers ----------

  app.get<{ Params: IdParams }>("/api/films/:id/voices", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    return film ? (film.config.voices ?? {}) : reply;
  });

  app.put<{ Params: IdParams }>("/api/films/:id/voices", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = FilmVoicesSchema.safeParse(request.body);
    if (!input.success)
      return sendError(reply, 400, "bad-voices", input.error.issues[0]?.message ?? "Bad voices.");
    return guard(reply, async () => {
      const config = await changeFilm(film.path, { voices: input.data });
      const before = film.config.voices ?? {};
      for (const [speaker, voice] of Object.entries(input.data)) {
        if (before[speaker]?.id === voice.id) continue;
        await studio.rememberVoice(voice);
        // A voice you chose for a character: new films use it too.
        if (!voice.auto) await studio.rememberCharacter(speaker, voice);
      }
      studio.events.publish({ type: "films-changed", ids: [film.id] });
      return config.voices ?? {};
    });
  });

  // ---------- Lines ----------

  app.get<{ Params: IdParams }>("/api/films/:id/lines", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    return guard(reply, () => readLines(film.path));
  });

  app.post<{ Params: IdParams }>("/api/films/:id/lines", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = NewLinesSchema.safeParse(request.body);
    if (!input.success)
      return sendError(reply, 400, "bad-lines", input.error.issues[0]?.message ?? "Bad lines.");
    const { speaker, lines: texts, speed, start, gap } = input.data;
    const voice = film.config.voices?.[speaker];
    if (!voice) {
      return sendError(
        reply,
        409,
        "no-voice",
        `Choose a voice for "${speaker}" first (the Voice tab on the film page).`,
      );
    }
    const connection = await fish(reply);
    if (!connection) return reply;
    return guard(reply, async () => {
      const chosen = model();
      const lines = await makeLines(
        film.path,
        { speaker, voice, texts, speed, model: chosen },
        (text) => speak(connection, { text, voiceId: voice.id, speed, model: chosen }),
      );
      // Place them on the timeline, one after the other, on the voice lane.
      let placed: { file: string; start: number; duration: number }[] = [];
      if (start !== undefined) {
        const fresh =
          (await readFilm(studio.filmsDir ?? "", film.id))?.config?.audio ?? film.config.audio;
        const lane = voiceLane(fresh);
        let t = start;
        placed = lines.map((line) => {
          const at = { file: line.file, start: round(t), duration: line.duration };
          t += line.duration + gap;
          return at;
        });
        const tracks = placed.map((p) =>
          AudioTrackSchema.parse({ file: p.file, start: p.start, lane }),
        );
        await changeFilm(film.path, { audio: [...fresh, ...tracks] });
      }
      await studio.rememberVoice(voice);
      studio.events.publish({ type: "films-changed", ids: [film.id] });
      return reply.code(201).send({ lines, placed });
    });
  });

  app.delete<{ Params: IdParams & { line: string } }>(
    "/api/films/:id/lines/:line",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      return guard(reply, async () => {
        const line = await deleteLine(film.path, request.params.line);
        if (!line) return sendError(reply, 404, "not-found", "This line doesn't exist (any more).");
        // Its clips leave the timeline too.
        const audio = film.config.audio.filter((track) => track.file !== line.file);
        if (audio.length !== film.config.audio.length) await changeFilm(film.path, { audio });
        studio.events.publish({ type: "films-changed", ids: [film.id] });
        return reply.code(204).send();
      });
    },
  );

  // ---------- Word timings for any sound in the film ----------

  app.get<{ Params: IdParams; Querystring: { file?: string } }>(
    "/api/films/:id/words",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      // No file: the timings of every sound on the timeline that has them (one answer for the app).
      if (!request.query.file) {
        const all: Record<string, Awaited<ReturnType<typeof readWords>>> = {};
        for (const file of new Set(film.config.audio.map((track) => track.file))) {
          const words = await readWords(film.path, file);
          if (words) all[file] = words;
        }
        return all;
      }
      const words = await readWords(film.path, request.query.file);
      return words ?? sendError(reply, 404, "no-words", "This sound has no word timings yet.");
    },
  );

  app.post<{ Params: IdParams }>("/api/films/:id/words", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = z
      .object({ file: z.string().min(1), language: z.string().max(10).optional() })
      .safeParse(request.body);
    const path = input.success ? resolveInside(film.path, input.data.file) : null;
    const info = path && mediaKindOf(path) === "sound" ? await stat(path).catch(() => null) : null;
    if (!input.success || !path || !info?.isFile()) {
      return sendError(reply, 400, "bad-file", "Pick a sound file of this film.");
    }
    const known = await readWords(film.path, input.data.file);
    if (known) return known;
    const connection = await fish(reply);
    if (!connection) return reply;
    return guard(reply, async () => {
      const heard = await transcribe(connection, {
        audio: await readFile(path),
        name: basename(path),
        language: input.data.language,
      });
      await writeWords(film.path, input.data.file, {
        text: heard.text,
        duration: heard.duration,
        words: heard.words,
        source: "transcript",
      });
      return readWords(film.path, input.data.file);
    });
  });
}
