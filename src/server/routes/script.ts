import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CastInputSchema,
  type FilmVoice,
  type FilmVoices,
  ScriptInputSchema,
  type VoiceType,
  VoiceTypeSchema,
  WriteNarrationSchema,
} from "../../shared/types.ts";
import { type CastResult, castVoices, pickVoice } from "../casting.ts";
import { changeFilm, readFilmConfig } from "../films.ts";
import { FishError, type FishOptions, speak } from "../fish.ts";
import { makeScript, readScript, saveScript } from "../script.ts";
import type { Studio } from "../studio.ts";
import { WriterError, type Writers } from "../writer.ts";
import { sendError } from "./errors.ts";
import { type ReadyFilm, type VoiceRoutesOptions, voiceContext } from "./voice-context.ts";

interface IdParams {
  id: string;
}

/** Casting, the script (what the voices say, and when) and the background writer. */
export function scriptRoutes(
  app: FastifyInstance,
  studio: Studio,
  writers: Writers,
  options: VoiceRoutesOptions = {},
): void {
  const { model, keyed, open, fish, filmOr, guard } = voiceContext(studio, options);
  const changed = (id: string) => studio.events.publish({ type: "films-changed", ids: [id] });

  const speakWith = (connection: FishOptions) => (text: string, voice: FilmVoice) =>
    speak(connection, { text, voiceId: voice.id, speed: 1, model: model() });

  /** The film's voices as they are now (kairos.json may have changed since the film was read). */
  const voicesOf = async (film: ReadyFilm): Promise<FilmVoices> =>
    (await readFilmConfig(film.path))?.config?.voices ?? film.config.voices ?? {};

  /** Gives speakers voices, saves them, and keeps each character's voice for the next films. */
  async function cast(
    film: ReadyFilm,
    speakers: readonly { speaker: string; type: VoiceType }[],
    language?: string,
  ): Promise<CastResult> {
    const result = await castVoices(await open(), await voicesOf(film), speakers, {
      language: language ?? (await readScript(film.path))?.language ?? "en",
      remembered: studio.voiceSettings.remembered,
    });
    await changeFilm(film.path, { voices: result.voices });
    for (const [speaker, voice] of Object.entries(result.voices)) {
      if (!studio.voiceSettings.remembered[speaker]) await studio.rememberCharacter(speaker, voice);
    }
    changed(film.id);
    return result;
  }

  // ---------- Casting ----------

  app.post<{ Params: IdParams }>("/api/films/:id/cast", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = CastInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendError(reply, 400, "bad-cast", input.error.issues[0]?.message ?? "Bad cast.");
    }
    return guard(reply, () => cast(film, input.data.speakers, input.data.language));
  });

  /** Another random voice of the same type for one speaker. */
  app.post<{ Params: IdParams & { speaker: string } }>(
    "/api/films/:id/cast/:speaker/another",
    async (request, reply) => {
      const film = await filmOr(reply, request.params.id);
      if (!film) return reply;
      const voices = await voicesOf(film);
      const speaker = request.params.speaker;
      const body = z.object({ type: VoiceTypeSchema.optional() }).safeParse(request.body ?? {});
      const type =
        (body.success ? body.data.type : undefined) ?? voices[speaker]?.type ?? "narrator";
      return guard(reply, async () => {
        const avoid = new Set(Object.values(voices).map((voice) => voice.id));
        const language = (await readScript(film.path))?.language ?? "en";
        const picked = await pickVoice(await open(), type, { language, avoid });
        if (!picked) {
          return sendError(
            reply,
            404,
            "no-voice",
            `No other ${type.replace("-", " ")} voice was found.`,
          );
        }
        const next = { ...voices, [speaker]: picked };
        await changeFilm(film.path, { voices: next });
        await studio.rememberCharacter(speaker, picked);
        changed(film.id);
        return next;
      });
    },
  );

  // ---------- The script ----------

  app.get<{ Params: IdParams }>("/api/films/:id/script", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    return guard(reply, async () => ({ script: await readScript(film.path) }));
  });

  app.put<{ Params: IdParams }>("/api/films/:id/script", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = ScriptInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendError(reply, 400, "bad-script", input.error.issues[0]?.message ?? "Bad script.");
    }
    return guard(reply, async () => {
      const script = await saveScript(film.path, input.data, input.data.writtenBy ?? "you");
      changed(film.id);
      return { script };
    });
  });

  app.post<{ Params: IdParams }>("/api/films/:id/script/make", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const connection = await fish(reply);
    if (!connection) return reply;
    return guard(reply, async () => {
      try {
        const made = await makeScript(film.path, {
          voices: await voicesOf(film),
          model: model(),
          speak: speakWith(connection),
        });
        for (const voice of Object.values(await voicesOf(film))) await studio.rememberVoice(voice);
        return made;
      } finally {
        changed(film.id);
      }
    });
  });

  // ---------- The background writer ----------

  app.get<{ Params: IdParams }>("/api/films/:id/script/writer", async (request) =>
    writers.state(request.params.id),
  );

  app.delete<{ Params: IdParams }>("/api/films/:id/script/writer", async (request) =>
    writers.stop(request.params.id),
  );

  app.post<{ Params: IdParams }>("/api/films/:id/script/writer", async (request, reply) => {
    const film = await filmOr(reply, request.params.id);
    if (!film) return reply;
    const input = WriteNarrationSchema.safeParse(request.body ?? {});
    if (!input.success) {
      return sendError(reply, 400, "bad-request", input.error.issues[0]?.message ?? "Bad request.");
    }
    const ask = input.data;
    const { title, duration, width, height, fps } = film.config;
    try {
      return writers.start(
        {
          id: film.id,
          dir: film.path,
          facts: { title, duration, width, height, fps },
          voices: await voicesOf(film),
        },
        ask,
        async (written, step) => {
          const warnings: string[] = [];
          step("writing", "Saving the script");
          await saveScript(
            film.path,
            {
              style: ask.style,
              language: ask.language,
              note: written.note ?? "",
              lines: written.lines,
            },
            "claude",
          );
          changed(film.id);

          // Everyone who speaks gets a voice (a speaker Claude forgot to type is read as a narrator).
          step("casting", "Choosing voices");
          const types = new Map(written.cast.map((entry) => [entry.speaker, entry.type]));
          const speakers = [...new Set(written.lines.map((line) => line.speaker))].map(
            (speaker) => ({
              speaker,
              type: types.get(speaker) ?? ("narrator" as const),
            }),
          );
          try {
            const result = await cast(film, speakers, ask.language);
            warnings.push(...result.problems);
          } catch (error) {
            warnings.push(error instanceof Error ? error.message : String(error));
          }

          let voiced = "";
          if (ask.make) {
            const connection = await keyed();
            if (!connection) {
              warnings.push(
                "Add your fish.audio key in Settings → Voice, then press Make the voices.",
              );
            } else {
              step("voicing", "Making the voices");
              try {
                const made = await makeScript(film.path, {
                  voices: await voicesOf(film),
                  model: model(),
                  speak: speakWith(connection),
                });
                warnings.push(...made.warnings);
                voiced = ` Made ${made.made} voice${made.made === 1 ? "" : "s"}${made.reused ? `, reused ${made.reused}` : ""}.`;
              } catch (error) {
                warnings.push(
                  error instanceof FishError || error instanceof Error
                    ? error.message
                    : String(error),
                );
              } finally {
                changed(film.id);
              }
            }
          }
          const count = written.lines.length;
          return { message: `Wrote ${count} line${count === 1 ? "" : "s"}.${voiced}`, warnings };
        },
      );
    } catch (error) {
      if (error instanceof WriterError) return sendError(reply, 409, "writer", error.message);
      throw error;
    }
  });
}
