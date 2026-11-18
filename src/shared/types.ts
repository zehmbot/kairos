import { z } from "zod";

/** GET /api/health */
export const HealthSchema = z.object({
  ok: z.literal(true),
  name: z.literal("kairos"),
  version: z.string(),
  url: z.string(),
  dev: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;

export const FilmStatusSchema = z.enum(["draft", "review", "approved", "published", "archived"]);
export type FilmStatus = z.infer<typeof FilmStatusSchema>;

/**
 * `kairos.json` at the root of every film folder.
 * The film page itself exposes `window.renderOut(t)`, `window.READY` and `window.KAIROS_SCENES`.
 */
export const FilmConfigSchema = z.object({
  title: z.string().min(1),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().positive().default(30),
  /** Length in seconds. */
  duration: z.number().positive(),
  status: FilmStatusSchema.default("draft"),
  /** Film page, relative to the film folder. */
  page: z.string().default("index.html"),
  /** Optional soundtrack, relative to the film folder. */
  audio: z.string().optional(),
});
export type FilmConfig = z.infer<typeof FilmConfigSchema>;
