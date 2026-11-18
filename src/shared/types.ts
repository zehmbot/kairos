import { z } from "zod";

/** GET /api/health */
export const HealthSchema = z.object({
  ok: z.literal(true),
  name: z.literal("kairos"),
  version: z.string(),
  url: z.string(),
  dev: z.boolean(),
  /** Port of the film server. The UI pairs it with its own host name. */
  filmPort: z.number(),
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

/** The three shapes offered when making a new film. */
export const FilmShapeSchema = z.enum(["wide", "tall", "square"]);
export type FilmShape = z.infer<typeof FilmShapeSchema>;

export const FILM_SHAPES: Record<
  FilmShape,
  { label: string; ratio: string; width: number; height: number }
> = {
  wide: { label: "Wide", ratio: "16:9", width: 1920, height: 1080 },
  tall: { label: "Tall", ratio: "9:16", width: 1080, height: 1920 },
  square: { label: "Square", ratio: "1:1", width: 1080, height: 1080 },
};

/** POST /api/films */
export const NewFilmSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your film a name.")
    .max(80, "Keep the name under 80 letters."),
  shape: FilmShapeSchema,
});
export type NewFilm = z.infer<typeof NewFilmSchema>;

/** One film folder, as the hub sees it. */
export const FilmSummarySchema = z.object({
  /** Folder name inside `<workspace>/films`. */
  id: z.string(),
  /** Absolute path of the film folder. */
  path: z.string(),
  /** `null` when kairos.json can't be read; `problem` then says why. */
  config: FilmConfigSchema.nullable(),
  /** Plain-words description of what needs fixing, or `null`. */
  problem: z.string().nullable(),
  /** Path of the film page on the film server (`/my-intro/index.html`), or `null` when it can't be previewed. */
  previewPath: z.string().nullable(),
  /** Last change to the folder's top-level files, in ms since 1970. */
  updatedAt: z.number(),
});
export type FilmSummary = z.infer<typeof FilmSummarySchema>;

/** `~/.kairos/config.json` */
export const AppConfigSchema = z.object({
  /** Folder that holds `films/`. Not set until the user picks one. */
  workspace: z.string().optional(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

/** GET/PUT /api/workspace */
export const WorkspaceSchema = z.object({
  path: z.string().nullable(),
  suggested: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** POST /api/workspace/pick: the folder window closed. `unsupported`: this computer has no folder window. */
export const PickWorkspaceResultSchema = z.object({
  status: z.enum(["picked", "cancelled", "unsupported"]),
  workspace: WorkspaceSchema,
});
export type PickWorkspaceResult = z.infer<typeof PickWorkspaceResultSchema>;

export const SetWorkspaceSchema = z.object({
  path: z.string().trim().min(1, "Type a folder path."),
});

/** Messages on GET /api/events (Server-Sent Events). */
export const HubEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("films-changed"), ids: z.array(z.string()) }),
  z.object({ type: z.literal("workspace-changed") }),
]);
export type HubEvent = z.infer<typeof HubEventSchema>;

/** Body of every error the API sends. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  reason: z.string().optional(),
});
