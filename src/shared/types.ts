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

/** One sound file on the film's timeline (music, a voice, effects...). */
export const AudioTrackSchema = z.object({
  /** The sound file, inside the film folder, like `audio/music.mp3`. */
  file: z.string().min(1, "Each audio track needs a file."),
  /** When it starts on the film's timeline, in seconds. */
  start: z.number().min(0, "An audio track can't start before the film.").default(0),
  /** 1 is the file as it is, 0.5 half as loud, 2 twice as loud. */
  volume: z
    .number()
    .min(0, "An audio track's volume goes from 0 to 2.")
    .max(2, "An audio track's volume goes from 0 to 2.")
    .default(1),
  /** Where in the file it starts playing, in seconds (a trimmed start). */
  from: z.number().min(0, "An audio track's `from` can't be negative.").default(0),
  /** How long it plays, in seconds (a trimmed end). Left out: to the end of the file. */
  length: z.number().positive("An audio track's `length` must be more than 0.").optional(),
  /** Which timeline track it sits on (0 = the first). Left out: one track each, in order. */
  lane: z.number().int().min(0).max(31).optional(),
  /** Muted tracks stay in the film but make no sound (preview and video). */
  muted: z.boolean().default(false),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

/** A track as written in kairos.json: the defaults (`from: 0`, `muted: false`) are left out. */
export function compactTrack(track: AudioTrack): z.input<typeof AudioTrackSchema> {
  const { from, muted, length, lane, ...rest } = track;
  return {
    ...rest,
    ...(from > 0 ? { from } : {}),
    ...(length !== undefined ? { length } : {}),
    ...(lane !== undefined ? { lane } : {}),
    ...(muted ? { muted } : {}),
  };
}

/** `"audio": "file.mp3"` (one track) or a list of tracks. Always read as a list. */
/**
 * A video or a picture on the film's timeline, drawn by Kairos over the film (preview, pictures and the video).
 * Its box has the film's shape: `size` of the film's width, centered at `x`, `y` (0 to 1 across the frame).
 */
export const VideoClipSchema = z.object({
  /** The video or picture, inside the film folder, like `assets/videos/intro.mp4`. */
  file: z.string().min(1, "Each video clip needs a file."),
  /** When it starts on the film's timeline, in seconds. */
  start: z.number().min(0, "A video clip can't start before the film.").default(0),
  /** Where in the video it starts playing, in seconds (a trimmed start). */
  from: z.number().min(0, "A video clip's `from` can't be negative.").default(0),
  /** How long it shows, in seconds. Left out: to the end of the video (a picture needs one). */
  length: z.number().positive("A video clip's `length` must be more than 0.").optional(),
  /** Which video track it sits on (0 = the lowest; higher tracks draw over lower ones). */
  lane: z.number().int().min(0).max(15).optional(),
  /** "fill": covers its box (cropped); "fit": the whole picture shows, the film around it. */
  fit: z.enum(["fill", "fit"]).default("fill"),
  /** Its box's width, as a share of the film's width (1 = the whole frame). */
  size: z.number().min(0.05, "A clip's size goes from 0.05 to 1.").max(1).default(1),
  /** The middle of its box, from 0 to 1 across and down the frame. */
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
  /** 1 = solid, 0 = invisible. */
  opacity: z.number().min(0).max(1).default(1),
  /** Fades in at its start and out at its end, in seconds (0 = none). */
  fade: z.number().min(0).max(5).default(0),
  /** Its own sound (videos): 0 to 2, and muted. */
  volume: z.number().min(0).max(2).default(1),
  muted: z.boolean().default(false),
});
export type VideoClip = z.infer<typeof VideoClipSchema>;

/** A clip as written in kairos.json: the default values are left out. */
export function compactClip(clip: VideoClip): z.input<typeof VideoClipSchema> {
  const defaults = VideoClipSchema.parse({ file: clip.file });
  const short: Record<string, unknown> = { file: clip.file, start: clip.start };
  for (const [key, value] of Object.entries(clip)) {
    if (key === "file" || key === "start" || value === undefined) continue;
    if (defaults[key as keyof VideoClip] !== value) short[key] = value;
  }
  return short as z.input<typeof VideoClipSchema>;
}

const AudioSchema = z
  .union([z.string().min(1), z.array(AudioTrackSchema)])
  .transform((audio) =>
    typeof audio === "string" ? [AudioTrackSchema.parse({ file: audio })] : audio,
  );

// ---------- Voices (fish.audio) ----------

/** A spoken word and when it is said, in seconds from the start of its sound file. */
export const WordSchema = z.object({ text: z.string(), start: z.number(), end: z.number() });
export type Word = z.infer<typeof WordSchema>;

/** A voice in the fish.audio library (or one of the user's own). */
export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  author: z.string().nullable(),
  description: z.string(),
  languages: z.array(z.string()),
  /** Picture and sample addresses on fish.audio (https), when it has them. */
  cover: z.string().nullable(),
  sample: z.string().nullable(),
});
export type VoiceInfo = z.infer<typeof VoiceInfoSchema>;

/** Who speaks in a film: a speaker name ("narrator", "ruby") and its fish.audio voice. */
export const SPEAKER_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
/** Who a speaker is, so Kairos can cast a fitting voice. */
export const VOICE_TYPES = [
  "narrator",
  "woman",
  "man",
  "girl",
  "boy",
  "old-woman",
  "old-man",
] as const;
export const VoiceTypeSchema = z.enum(VOICE_TYPES);
export type VoiceType = z.infer<typeof VoiceTypeSchema>;

export const FilmVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** Who the speaker is (cast by type). */
  type: VoiceTypeSchema.optional(),
  /** Picked by Kairos (not by you). */
  auto: z.boolean().optional(),
  /** A sample to listen to, on fish.audio (https). */
  sample: z.string().startsWith("https://").optional(),
});
export type FilmVoice = z.infer<typeof FilmVoiceSchema>;
export const FilmVoicesSchema = z.record(
  z.string().regex(SPEAKER_PATTERN, "Speaker names use small letters, numbers and dashes."),
  FilmVoiceSchema,
);
export type FilmVoices = z.infer<typeof FilmVoicesSchema>;

/** A line of speech made for a film (`voice/lines.json`). */
export const VoiceLineSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  voiceId: z.string(),
  voiceName: z.string(),
  text: z.string(),
  speed: z.number(),
  model: z.string(),
  /** The sound file in the film folder, and its word timings next to it (`.words.json`). */
  file: z.string(),
  duration: z.number(),
  words: z.array(WordSchema),
  createdAt: z.string(),
});
export type VoiceLine = z.infer<typeof VoiceLineSchema>;

/** POST /api/films/:id/lines: make lines (and place them on the timeline). */
export const NewLinesSchema = z.object({
  speaker: z.string().regex(SPEAKER_PATTERN).default("narrator"),
  lines: z
    .array(
      z
        .string()
        .trim()
        .min(1, "A line needs some words.")
        .max(2000, "Keep a line under 2000 letters."),
    )
    .min(1)
    .max(60),
  speed: z.number().min(0.5).max(2).default(1),
  /** Where the first line starts on the film (seconds); the others follow it. Left out: not placed. */
  start: z.number().min(0).optional(),
  /** Silence between lines placed back-to-back, in seconds. */
  gap: z.number().min(0).max(10).default(0.3),
  /** Who wrote them (placed lines join the script with it). */
  by: z.enum(["claude", "you"]).default("you"),
});
export type NewLines = z.input<typeof NewLinesSchema>;

/** Is fish.audio ready: is there a key (and where from), which model. The key itself never leaves the hub. */
export const VoiceStatusSchema = z.object({
  key: z.enum(["settings", "environment"]).nullable(),
  hint: z.string().nullable(),
  model: z.string(),
  models: z.array(z.string()),
  recent: z.array(FilmVoiceSchema),
});
export type VoiceStatus = z.infer<typeof VoiceStatusSchema>;

/** Languages offered for narration (fish.audio codes). */
export const NARRATION_LANGUAGES = [
  ["en", "English"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["ar", "Arabic"],
  ["ja", "Japanese"],
  ["zh", "Chinese"],
  ["ko", "Korean"],
] as const;

/** A script line's id: a short key (a Blocky shot names its line with it). */
export const LINE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** One planned line of the film's narration or dialogue (`voice/script.json`). */
export const ScriptLineSchema = z.object({
  id: z.string().min(1).max(40),
  speaker: z
    .string()
    .regex(SPEAKER_PATTERN, "Speaker names use small letters, numbers and dashes."),
  text: z
    .string()
    .trim()
    .min(1, "A line needs some words.")
    .max(2000, "Keep a line under 2000 letters."),
  /** When it starts on the film, in seconds. */
  start: z.number().min(0),
  /** The voice line made from it (an id in `voice/lines.json`), once made. */
  line: z.string().optional(),
  /** Who wrote the words: Claude, or you (a line of Claude's you edit becomes yours). */
  by: z.enum(["claude", "you"]).default("you"),
  /** How fast it is said (1 = normal). */
  speed: z.number().min(0.5).max(2).default(1),
});
export type ScriptLine = z.infer<typeof ScriptLineSchema>;

/** What the voices say, planned before they are made. */
export const ScriptSchema = z.object({
  version: z.literal(1),
  style: z.string().max(200).default(""),
  /** fish.audio language code. */
  language: z.string().max(10).default("en"),
  /** Who wrote it last. */
  writtenBy: z.enum(["claude", "you"]).default("you"),
  /** Claude's note about it (for example: the story needs 4 more seconds). */
  note: z.string().max(1000).default(""),
  lines: z.array(ScriptLineSchema).max(200),
  /** The voice lines the script made last time (their clips are replaced when it is made again). */
  made: z.array(z.string()).default([]),
  updatedAt: z.string().optional(),
});
export type Script = z.infer<typeof ScriptSchema>;

/** PUT /api/films/:id/script: the lines (ids are added when missing). */
export const ScriptInputSchema = z.object({
  /** Who wrote it (Claude, through its tools; you, in the app). */
  writtenBy: z.enum(["claude", "you"]).optional(),
  style: z.string().max(200).optional(),
  language: z.string().max(10).optional(),
  note: z.string().max(1000).optional(),
  lines: z
    .array(
      ScriptLineSchema.extend({
        id: z.string().min(1).max(40).optional(),
        /** Left out: whoever is saving the script (writtenBy). */
        by: z.enum(["claude", "you"]).optional(),
      }),
    )
    .max(200),
});
export type ScriptInput = z.input<typeof ScriptInputSchema>;

/** POST /api/films/:id/cast: speakers and who they are; Kairos picks voices for the ones without one. */
export const CastInputSchema = z.object({
  speakers: z
    .array(
      z.object({
        speaker: z
          .string()
          .regex(SPEAKER_PATTERN, "Speaker names use small letters, numbers and dashes."),
        type: VoiceTypeSchema,
      }),
    )
    .min(1)
    .max(20),
  language: z.string().max(10).optional(),
});

/** POST /api/films/:id/script/make: everything that changed, or only some lines (a new take). */
export const MakeScriptInputSchema = z.object({
  /** Script line ids to make; left out: every line. */
  lines: z.array(z.string().min(1).max(40)).max(200).optional(),
  /** A new take even when nothing changed. */
  fresh: z.boolean().default(false),
});
export type MakeScriptInput = z.input<typeof MakeScriptInputSchema>;

/** POST /api/voice/pick: a random fitting voice, before there is a film (New film's narrator). */
export const VoicePickSchema = z.object({
  type: VoiceTypeSchema.default("narrator"),
  language: z.string().max(10).default("en"),
  /** Voices not to pick again (the one shown now). */
  avoid: z.array(z.string().max(100)).max(50).default([]),
});

/** "Write the narration": what you ask Claude for. */
export const WriteNarrationSchema = z.object({
  style: z.string().trim().max(200).default("storyteller"),
  speakers: z.enum(["narrator", "both", "characters"]).default("narrator"),
  language: z.string().max(10).default("en"),
  note: z.string().trim().max(500).default(""),
  /** Make the voices as soon as the script is written. */
  make: z.boolean().default(true),
});
export type WriteNarration = z.input<typeof WriteNarrationSchema>;

/** The background writer of a film. */
export const WriterStateSchema = z.object({
  state: z.enum(["idle", "running", "done", "failed", "stopped"]),
  stage: z.enum(["starting", "watching", "writing", "casting", "voicing"]).optional(),
  /** What Claude is doing now ("Looking at 4.2 s"). */
  detail: z.string().optional(),
  /** The result or the problem, in plain words. */
  message: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  startedAt: z.string().optional(),
});
export type WriterState = z.infer<typeof WriterStateSchema>;

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
  /** Sound: one file, or tracks with a start and a volume (mixed together in the render). */
  audio: AudioSchema.default([]),
  /** Videos and pictures over the film, on the timeline's video tracks. */
  video: z.array(VideoClipSchema).max(200).default([]),
  /** Who speaks in the film and with which fish.audio voice. */
  voices: FilmVoicesSchema.optional(),
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

/** Folder names of templates (like skills: small letters, numbers, dashes). */
export const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Answers to a template's form, by field id. */
export const BriefAnswersSchema = z.record(z.string(), z.union([z.string(), z.number()]));
export type BriefAnswers = z.infer<typeof BriefAnswersSchema>;

/** One question in a template's form. */
export const TemplateFieldSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, "Field ids use small letters, numbers and _."),
    label: z
      .string()
      .trim()
      .min(1, "Each question needs its text.")
      .max(120, "Keep each question under 120 letters."),
    /** `longtext` is for scripts and longer answers. */
    type: z.enum(["text", "longtext", "choice", "number"]),
    required: z.boolean().default(false),
    placeholder: z.string().max(500).optional(),
    hint: z.string().max(300).optional(),
    /** The choices of a `choice` field. */
    options: z.array(z.string().min(1)).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.union([z.string(), z.number()]).optional(),
  })
  .refine((field) => field.type !== "choice" || (field.options?.length ?? 0) > 0, {
    message: "A choice question needs at least one choice.",
  });
export type TemplateField = z.infer<typeof TemplateFieldSchema>;

/**
 * Kairos' `starter` template is the blank film: New film's "Blank film", and the files new templates start
 * from. It isn't shown as a template card.
 */
export const BLANK_TEMPLATE_ID = "starter";

/** A kind of film a template makes (Story, Educational...), with its own form. */
export const TemplateKindSchema = z.object({
  id: z.string().regex(TEMPLATE_ID_PATTERN, "Kind ids use small letters, numbers and dashes."),
  name: z.string().trim().min(1, "Each kind needs a name.").max(60),
  description: z.string().max(300).default(""),
  fields: z
    .array(TemplateFieldSchema)
    .default([])
    .refine(
      (fields) => new Set(fields.map((field) => field.id)).size === fields.length,
      "Two questions have the same id.",
    ),
});
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

/** A template's settings for new films. `size` replaces the shape choice. */
export const TemplateDefaultsSchema = z.object({
  shape: FilmShapeSchema.default("wide"),
  fps: FpsSchema.default(DEFAULT_FPS),
  duration: z.number().positive().default(5),
  size: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .optional(),
});

/** `template.json` in a template folder. */
export const TemplateFileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(60, "Keep the name under 60 letters."),
  description: z.string().max(300, "Keep the description under 300 letters.").default(""),
  defaults: TemplateDefaultsSchema.prefault({}),
  kinds: z
    .array(TemplateKindSchema)
    .default([])
    .refine(
      (kinds) => new Set(kinds.map((kind) => kind.id)).size === kinds.length,
      "Two kinds have the same id.",
    ),
});
/** POST /api/templates and PUT /api/templates/:id: a template's settings and questions. */
export type TemplateInput = z.input<typeof TemplateFileSchema>;

/** A film in the workspace trash (`<workspace>/.trash/`), which can be restored. */
export const TrashEntrySchema = z.object({
  /** Folder name in the trash: `<deleted at, ms>-<film id>`. */
  entry: z.string(),
  /** The film's id before it was deleted. */
  id: z.string(),
  title: z.string(),
  deletedAt: z.string(),
});
export type TrashEntry = z.infer<typeof TrashEntrySchema>;
export type TemplateFile = z.infer<typeof TemplateFileSchema>;

/** GET /api/templates: one template, ready for the New film dialog. */
export const TemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.enum(["kairos", "yours"]),
  defaults: TemplateDefaultsSchema,
  /** At least one: a template without kinds gets one with no questions. */
  kinds: z.array(TemplateKindSchema),
  hasPreview: z.boolean(),
  /** Why the template can't be used (a broken template.json), or null. */
  problem: z.string().nullable(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

/** `.kairos/brief.json`: what the user asked for, kept so the form can be edited later. */
export const BriefFileSchema = z.object({
  version: z.literal(1),
  template: z.string(),
  templateName: z.string(),
  kind: z.string(),
  kindName: z.string(),
  /** The questions as they were when the film was made (the template may change or go away). */
  fields: z.array(TemplateFieldSchema),
  answers: BriefAnswersSchema,
  /** Make the voices with the film (New film's Voices choice). */
  voices: z.enum(["make", "none"]).optional(),
  /** The narrator's voice chosen in New film (its name), and the language the voices speak. */
  narrator: z.string().optional(),
  language: z.string().optional(),
  updatedAt: z.string(),
});
export type BriefFile = z.infer<typeof BriefFileSchema>;

/** PUT /api/films/:id/brief */
export const BriefUpdateSchema = z.object({ answers: BriefAnswersSchema });

/** POST /api/films/:id/save-as-template */
export const SaveTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(60, "Keep the name under 60 letters."),
  description: z.string().trim().max(300, "Keep the description under 300 letters.").default(""),
});
export type SaveTemplate = z.input<typeof SaveTemplateSchema>;

/** POST /api/films */
export const NewFilmSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your film a name.")
    .max(80, "Keep the name under 80 letters."),
  shape: FilmShapeSchema,
  fps: FpsSchema.default(DEFAULT_FPS),
  /** The template to start from (its folder name). */
  template: z.string().default(BLANK_TEMPLATE_ID),
  /** The template's kind; the first one when left out. */
  kind: z.string().optional(),
  /** Answers to the kind's form. */
  brief: BriefAnswersSchema.default({}),
  /** Make the voices (narration and characters) while the film is built. */
  voices: z.enum(["make", "none"]).default("none"),
  /** The narrator's voice, chosen before anything is made (with voices: "make"). */
  narrator: FilmVoiceSchema.optional(),
  /** The language the voices speak (fish.audio code). */
  language: z.string().max(10).optional(),
});
/** What the client sends (`fps`, `template` and `brief` may be left out). */
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

/** PUT /api/films/:id/audio: the whole list of sound tracks of a film. */
export const AudioChangeSchema = z.object({ audio: z.array(AudioTrackSchema) });

/** PUT /api/films/:id/tracks: the timeline's sound tracks and video clips, saved together. */
export const TracksChangeSchema = z.object({
  audio: z.array(AudioTrackSchema),
  video: z.array(VideoClipSchema).max(200),
});

const MediaKindSchema = z.enum(["image", "video", "sound", "font"]);

/** A file in the asset library (`<workspace>/assets/<kind folder>/<name>`). */
export const AssetSchema = z.object({
  /** "sounds/rain.mp3": the kind folder and the file name. */
  id: z.string(),
  kind: MediaKindSchema,
  name: z.string(),
  size: z.number(),
  addedAt: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

/** POST /api/films/:id/sounds/from-asset and /references/from-asset. */
export const FromAssetSchema = z.object({
  asset: z.string().min(1),
  start: z.number().min(0).optional(),
});

/** What Kairos found in a reference video. Times in seconds. */
export const ReferenceInfoSchema = z.object({
  duration: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number().nullable(),
  /** When each shot starts (the first is 0). */
  shots: z.array(z.number()),
  /** Typical, shortest and longest shot. */
  medianShot: z.number(),
  shortestShot: z.number(),
  longestShot: z.number(),
  /** Which shots are on the sheets (numbers from 1), in reading order. */
  pictured: z.array(z.number()),
});
export type ReferenceInfo = z.infer<typeof ReferenceInfoSchema>;

/** A reference video or picture added to a film, for Claude to look at. */
export const ReferenceSchema = z.object({
  id: z.string(),
  /** Inside the film folder: "references/clip.mp4". */
  file: z.string(),
  kind: z.enum(["video", "image"]),
  /** What Claude should take from it (the user's words). */
  note: z.string(),
  addedAt: z.string(),
  status: z.enum(["processing", "ready", "failed"]),
  problem: z.string().nullable(),
  info: ReferenceInfoSchema.nullable(),
  /** How many sheet pictures there are. */
  sheets: z.number(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceNoteSchema = z.object({
  note: z.string().max(1000, "Keep the note under 1000 letters."),
});

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
  /** The film was made with a brief (`brief.md` + `.kairos/brief.json`). */
  hasBrief: z.boolean(),
  /** The film has sheets (Blocky): its characters, poses, faces, props and places on pictures. */
  hasSheets: z.boolean().default(false),
});
export type FilmSummary = z.infer<typeof FilmSummarySchema>;

/** `~/.kairos/config.json` */
export const AppConfigSchema = z.object({
  /** Folder that holds `films/`. Not set until the user picks one. */
  workspace: z.string().optional(),
  /** fish.audio: the speech model, and voices used lately (newest first). The key is in `.env`, not here. */
  voice: z
    .object({
      model: z.string().optional(),
      recent: z.array(FilmVoiceSchema).default([]),
      /** Characters keep their voice from film to film: speaker name → voice. */
      remembered: z.record(z.string(), FilmVoiceSchema).default({}),
    })
    .optional(),
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
  z.object({ type: z.literal("references-changed"), id: z.string() }),
  z.object({ type: z.literal("assets-changed") }),
  /** A render moved on (sent at most a few times a second). */
  z.object({ type: z.literal("render-progress"), job: RenderJobSchema }),
  /** A film's list of finished videos changed. */
  z.object({ type: z.literal("renders-changed"), id: z.string() }),
  z.object({ type: z.literal("writer-progress"), id: z.string(), writer: WriterStateSchema }),
]);
export type HubEvent = z.infer<typeof HubEventSchema>;

/** Body of every error the API sends. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  reason: z.string().optional(),
});
