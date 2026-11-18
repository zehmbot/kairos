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

/** Frames per second a film may use, and the one new films start with. */
export const MIN_FPS = 1;
export const MAX_FPS = 120;
export const DEFAULT_FPS = 30;

export const FpsSchema = z
  .number({ error: "The frame rate must be a number." })
  .min(MIN_FPS, `The frame rate must be at least ${MIN_FPS} frame per second.`)
  .max(MAX_FPS, `The frame rate can be at most ${MAX_FPS} frames per second.`);

/**
 * `kairos.json` at the root of every film folder.
 * The film page itself exposes `window.renderOut(t)`, `window.READY` and `window.KAIROS_SCENES`.
 */
export const FilmConfigSchema = z.object({
  title: z.string().min(1),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: FpsSchema.default(DEFAULT_FPS),
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
  fps: FpsSchema.default(DEFAULT_FPS),
});
/** What the client sends (`fps` may be left out). */
export type NewFilm = z.input<typeof NewFilmSchema>;

/** PATCH /api/films/:id: film settings the app can change in `kairos.json`. */
export const FilmChangeSchema = z.object({ fps: FpsSchema });
export type FilmChange = z.infer<typeof FilmChangeSchema>;

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

/** Coordinates of marks, in the film's own pixels. */
const coord = z.number().min(-100_000).max(100_000);

/** One mark drawn on a frame. */
export const NoteShapeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("point"), x: coord, y: coord }),
  z.object({ type: z.literal("box"), x: coord, y: coord, w: coord, h: coord }),
  z.object({ type: z.literal("arrow"), x1: coord, y1: coord, x2: coord, y2: coord }),
  z.object({
    type: z.literal("pen"),
    points: z
      .array(z.tuple([coord, coord]))
      .min(2)
      .max(2000),
  }),
]);
export type NoteShape = z.infer<typeof NoteShapeSchema>;
export type NoteTool = NoteShape["type"];

export const NoteStatusSchema = z.enum(["open", "fixed"]);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

/** `n_` + 6 lowercase letters or digits. */
export const NOTE_ID_PATTERN = /^n_[a-z0-9]{6}$/;

/** A frame note. Times are in seconds, like `renderOut(t)`. */
export const NoteSchema = z.object({
  id: z.string().regex(NOTE_ID_PATTERN),
  text: z.string().max(2000),
  status: NoteStatusSchema,
  /** The frame the note is about (the start, for a range). */
  t: z.number().min(0),
  /** End of a range, or `null` for a single frame. */
  until: z.number().min(0).nullable(),
  shapes: z.array(NoteShapeSchema).max(50),
  /** Picture of the marked frame, relative to the film's `.kairos` folder. */
  image: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Note = z.infer<typeof NoteSchema>;

/** `.kairos/notes.json` in a film folder. */
export const NotesFileSchema = z.object({ version: z.literal(1), notes: z.array(NoteSchema) });

/** POST /api/films/:id/notes */
export const NewNoteSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Write what should change.")
      .max(2000, "Keep the note under 2000 letters."),
    t: z.number().min(0),
    until: z.number().min(0).nullable().default(null),
    shapes: z.array(NoteShapeSchema).max(50, "That's a lot of marks. Use at most 50.").default([]),
  })
  .refine((note) => note.until === null || note.until > note.t, {
    message: "The range must end after it starts.",
    path: ["until"],
  });
export type NewNote = z.input<typeof NewNoteSchema>;

/** PATCH /api/films/:id/notes/:noteId */
export const NoteUpdateSchema = z.object({
  text: z.string().trim().min(1, "Write what should change.").max(2000).optional(),
  status: NoteStatusSchema.optional(),
});
export type NoteUpdate = z.infer<typeof NoteUpdateSchema>;

/** GET /api/camera: the browser that takes pictures of notes, if any. */
export const CameraSchema = z.object({
  browser: z.object({ name: z.string(), path: z.string() }).nullable(),
});
export type CameraInfo = z.infer<typeof CameraSchema>;

/** Messages on GET /api/events (Server-Sent Events). */
export const HubEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("films-changed"), ids: z.array(z.string()) }),
  z.object({ type: z.literal("workspace-changed") }),
  z.object({ type: z.literal("notes-changed"), id: z.string() }),
]);
export type HubEvent = z.infer<typeof HubEventSchema>;

/** Body of every error the API sends. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  reason: z.string().optional(),
});
