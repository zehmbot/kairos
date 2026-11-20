import type { FastifyReply } from "fastify";
import type { VoiceStatus } from "../../shared/types.ts";
import { type Film, FilmConfigError, readFilm } from "../films.ts";
import {
  DEFAULT_FISH_MODEL,
  FISH_KEY_NAME,
  FISH_MODELS,
  FishError,
  type FishOptions,
} from "../fish.ts";
import { ScriptFileError } from "../script.ts";
import { keyHint, readSecret, secretSource } from "../secrets.ts";
import type { Studio } from "../studio.ts";
import { LinesFileError } from "../voices.ts";
import { sendError } from "./errors.ts";

export interface VoiceRoutesOptions {
  /** fish.audio's address (tests use a fake server). */
  fishUrl?: string;
}

export type ReadyFilm = Film & { config: NonNullable<Film["config"]> };

/** What the voice, cast and script routes share: fish.audio, the film, and plain-words errors. */
export function voiceContext(studio: Studio, options: VoiceRoutesOptions) {
  const model = () => studio.voiceSettings.model ?? DEFAULT_FISH_MODEL;

  /** fish.audio with the key, or null when there is none. */
  async function keyed(): Promise<FishOptions | null> {
    const key = await readSecret(studio.home, FISH_KEY_NAME);
    return key ? { key, baseUrl: options.fishUrl } : null;
  }

  return {
    model,
    keyed,

    /** fish.audio for public lists: with the key when there is one, else without. */
    async open(): Promise<FishOptions> {
      return (await keyed()) ?? { key: null, baseUrl: options.fishUrl };
    },

    async status(): Promise<VoiceStatus> {
      const key = await readSecret(studio.home, FISH_KEY_NAME);
      return {
        key: await secretSource(studio.home, FISH_KEY_NAME),
        hint: key ? keyHint(key) : null,
        model: model(),
        models: [...FISH_MODELS],
        recent: studio.voiceSettings.recent,
      };
    },

    /** The fish.audio connection, or a plain-words answer when there is no key. */
    async fish(reply: FastifyReply): Promise<FishOptions | null> {
      const connection = await keyed();
      if (!connection) {
        sendError(reply, 409, "no-key", "Add your fish.audio key first, in Settings → Voice.");
      }
      return connection;
    },

    async filmOr(reply: FastifyReply, id: string): Promise<ReadyFilm | null> {
      const films = studio.filmsDir;
      const film = films ? await readFilm(films, id) : null;
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
      return film as ReadyFilm;
    },

    async guard(reply: FastifyReply, action: () => Promise<unknown>) {
      try {
        return await action();
      } catch (error) {
        if (error instanceof FishError) return sendError(reply, 502, "fish-audio", error.message);
        if (
          error instanceof LinesFileError ||
          error instanceof ScriptFileError ||
          error instanceof FilmConfigError
        ) {
          return sendError(reply, 409, "film-problem", error.message);
        }
        throw error;
      }
    },
  };
}
