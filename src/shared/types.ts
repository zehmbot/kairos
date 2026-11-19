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
export const FilmChangeSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "The title can't be empty.")
      .max(80, "Keep the title under 80 letters."),
    fps: FpsSchema,
    duration: z
      .number({ error: "The length must be a number of seconds." })
      .positive("The length must be more than 0 seconds."),
    status: FilmStatusSchema,
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, "Say what to change.");
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

/** GET /api/claude: is Claude Code installed here, and are the Kairos tools added to it? */
export const ClaudeStatusSchema = z.object({
  cli: z.object({ path: z.string(), version: z.string() }).nullable(),
  connected: z.boolean(),
});
export type ClaudeStatus = z.infer<typeof ClaudeStatusSchema>;

/** Skill folder names: what Claude Code shows as `/name`. */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const SkillNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SKILL_NAME_PATTERN, "Use small letters, numbers and dashes, like my-style.")
  .refine(
    (name) => name !== "synced" && !name.startsWith("anthropic-skills"),
    "Claude Code keeps this name for itself. Pick another one.",
  );

/**
 * A skill as the Skills page shows it.
 * - `on`: Kairos copied it into Claude Code's skills folder, and the copy is current.
 * - `off`: not in Claude Code.
 * - `update`: on, but the copy is older than the skill (or was edited in Claude's folder).
 * - `taken`: Claude Code already has a different skill with this name, which Kairos leaves alone.
 */
export const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["kairos", "yours"]),
  state: z.enum(["on", "off", "update", "taken"]),
  /** Folder the skill comes from. */
  path: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

/** POST /api/skills: write a new skill of your own. */
export const NewSkillSchema = z.object({
  name: SkillNameSchema,
  description: z
    .string()
    .trim()
    .min(1, "Say when Claude should use this skill.")
    .max(1000, "Keep the description under 1000 letters."),
  instructions: z
    .string()
    .trim()
    .min(1, "Write what Claude should do.")
    .max(100_000, "That's very long: put details in extra files in the skill's folder."),
});
export type NewSkill = z.infer<typeof NewSkillSchema>;

/** POST /api/skills/pick: the folder window's answer. */
export const PickSkillResultSchema = z.object({
  status: z.enum(["picked", "cancelled", "unsupported"]),
});
export type PickSkillResult = z.infer<typeof PickSkillResultSchema>;

/** "high" looks like the film itself; "small" makes a smaller file. */
export const RenderQualitySchema = z.enum(["high", "small"]);
export type RenderQuality = z.infer<typeof RenderQualitySchema>;

export const RenderEncoderSchema = z.enum(["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]);
export type RenderEncoder = z.infer<typeof RenderEncoderSchema>;

/** GET /api/export: can this computer make videos, and with which encoders? */
export const ExportInfoSchema = z.object({
  ffmpeg: z.object({ path: z.string(), version: z.string() }).nullable(),
  /** The encoders that really work here, fastest first. */
  encoders: z.array(z.object({ id: RenderEncoderSchema, name: z.string(), gpu: z.boolean() })),
});
export type ExportInfo = z.infer<typeof ExportInfoSchema>;

/** POST /api/films/:id/renders */
export const StartRenderSchema = z.object({
  quality: RenderQualitySchema.default("high"),
  /** Use the graphics card when one works (much faster). */
  gpu: z.boolean().default(true),
});
export type StartRender = z.input<typeof StartRenderSchema>;

/** A render in the queue, running, or just ended. */
export const RenderJobSchema = z.object({
  id: z.string(),
  filmId: z.string(),
  title: z.string(),
  state: z.enum(["queued", "running", "joining", "done", "failed", "cancelled"]),
  quality: RenderQualitySchema,
  encoder: RenderEncoderSchema,
  /** Frames drawn so far, of `total`. */
  done: z.number().int(),
  total: z.number().int(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  /** Plain-words reason when the render failed. */
  error: z.string().nullable(),
  /** The version made, once done. */
  version: z.number().int().nullable(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

/** A finished video, as kept in the film's `.kairos/renders.json`. */
export const RenderSchema = z.object({
  version: z.number().int().positive(),
  /** Path inside the film folder, like `renders/my-intro-v3.mp4`. */
  file: z.string(),
  createdAt: z.string(),
  quality: RenderQualitySchema,
  encoder: RenderEncoderSchema,
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  duration: z.number(),
  frames: z.number().int(),
  bytes: z.number().int(),
  /** How long the render took, in seconds. */
  seconds: z.number(),
});
export type Render = z.infer<typeof RenderSchema>;

export const RendersFileSchema = z.object({
  version: z.literal(1),
  renders: z.array(RenderSchema),
});

/** GET /api/renders: what is rendering, and the finished videos of every film (newest first). */
export const RendersOverviewSchema = z.object({
  jobs: z.array(RenderJobSchema),
  videos: z.array(RenderSchema.extend({ filmId: z.string(), title: z.string() })),
});
export type RendersOverview = z.infer<typeof RendersOverviewSchema>;

/** Messages on GET /api/events (Server-Sent Events). */
export const HubEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("films-changed"), ids: z.array(z.string()) }),
  z.object({ type: z.literal("workspace-changed") }),
  z.object({ type: z.literal("notes-changed"), id: z.string() }),
  /** A render moved on (sent at most a few times a second). */
  z.object({ type: z.literal("render-progress"), job: RenderJobSchema }),
  /** A film's list of finished videos changed. */
  z.object({ type: z.literal("renders-changed"), id: z.string() }),
]);
export type HubEvent = z.infer<typeof HubEventSchema>;

/** Body of every error the API sends. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  reason: z.string().optional(),
});
