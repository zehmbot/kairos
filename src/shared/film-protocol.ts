import { z } from "zod";

/**
 * Messages between the Kairos player (parent page) and the bridge script inside a film page
 * (`src/film/bridge.js`). Every message carries `kairos: 1`.
 */

export const FilmSceneSchema = z.object({
  name: z.string(),
  start: z.number(),
  end: z.number().optional(),
});
export type FilmScene = z.infer<typeof FilmSceneSchema>;

/** One effect sound a film places: Kairos puts it on the timeline's Effects lane. */
export const FilmSoundSchema = z.object({
  key: z.string().min(1).max(120),
  sound: z.string().min(1).max(40),
  t: z.number().min(0),
  volume: z.number().min(0).max(2).optional(),
});
export type FilmSound = z.infer<typeof FilmSoundSchema>;

/** What a film can do for an export, from its `ready` message (src/shared/export.ts). */
export interface FilmAbilities {
  /** It draws itself at any size: it can go out in other shapes, and the player can show them. */
  reshape: boolean;
  /** It gives the captions it shows, and leaves them out when asked. */
  captions: boolean;
}

export const NO_ABILITIES: FilmAbilities = Object.freeze({ reshape: false, captions: false });

/** Film -> player. */
export const FilmMessageSchema = z.discriminatedUnion("type", [
  /** The page has loaded and `window.READY` has settled. */
  z.object({
    kairos: z.literal(1),
    type: z.literal("ready"),
    hasRenderOut: z.boolean(),
    scenes: z.array(FilmSceneSchema),
    /** How long the film's story lasts (`window.KAIROS_LENGTH`), when the film says. */
    length: z.number().positive().optional(),
    /** The effect sounds the film places (`window.KAIROS_SOUNDS`), when it says. */
    sounds: z.array(FilmSoundSchema).max(2000).optional(),
    /** The places the film's engine can show (`window.KAIROS_PLACES`), when it says. */
    places: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/))
      .max(60)
      .optional(),
    /** The film draws itself at any size it's asked (`window.KAIROS_RESHAPE`): it can go out in other shapes. */
    reshape: z.boolean().optional(),
    /** The film gives the captions it shows (`window.KAIROS_CAPTIONS`) and leaves them out when asked. */
    captions: z.boolean().optional(),
  }),
  /** Answer to a `seek`: the frame is drawn (or `error` says why not). */
  z.object({
    kairos: z.literal(1),
    type: z.literal("frame"),
    id: z.number(),
    t: z.number(),
    ms: z.number(),
    error: z.string().optional(),
  }),
  /** Something went wrong in the page outside `renderOut` (a script error, a missing file...). */
  z.object({
    kairos: z.literal(1),
    type: z.literal("error"),
    message: z.string(),
    source: z.string().optional(),
    line: z.number().optional(),
  }),
]);
export type FilmMessage = z.infer<typeof FilmMessageSchema>;

/** Player -> film. */
export type PlayerMessage =
  | { kairos: 1; type: "hello" }
  | { kairos: 1; type: "seek"; id: number; t: number };

/** The frame route's answer header: how long the film says its story lasts (`window.KAIROS_LENGTH`). */
export const STORY_LENGTH_HEADER = "x-kairos-story-length";

/** The sheet route's answer header: the problems the sheet's checks found (JSON, URI-encoded). */
export const CHECKS_HEADER = "x-kairos-checks";
