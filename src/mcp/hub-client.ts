import { z } from "zod";
import {
  ApiErrorSchema,
  type Asset,
  AssetSchema,
  type FilmChange,
  type FilmSummary,
  FilmSummarySchema,
  type FilmVoices,
  FilmVoicesSchema,
  type Health,
  HealthSchema,
  type NewLines,
  type Note,
  NoteSchema,
  type NoteStatus,
  type Reference,
  ReferenceSchema,
  type RenderJob,
  RenderJobSchema,
  type RenderQuality,
  type RendersOverview,
  RendersOverviewSchema,
  type Script,
  type ScriptInput,
  ScriptSchema,
  type VoiceInfo,
  VoiceInfoSchema,
  type VoiceLine,
  VoiceLineSchema,
  type VoiceType,
  type Word,
  WordSchema,
  type Workspace,
  WorkspaceSchema,
} from "../shared/types.ts";

/** What making the script's voices did. */
const MadeScriptSchema = z.object({
  made: z.number(),
  reused: z.number(),
  placed: z.array(
    z.object({
      id: z.string(),
      speaker: z.string(),
      file: z.string(),
      start: z.number(),
      duration: z.number(),
      words: z.array(WordSchema),
    }),
  ),
  warnings: z.array(z.string()),
});
export type MadeScript = z.infer<typeof MadeScriptSchema>;

/** Word timings saved next to a sound file. */
const WordsAnswerSchema = z.object({
  text: z.string(),
  duration: z.number(),
  words: z.array(WordSchema),
  source: z.enum(["speech", "transcript"]),
});
export type WordsAnswer = {
  text: string;
  duration: number;
  words: Word[];
  source: "speech" | "transcript";
};

/** The hub isn't running (nothing answers on its port). */
export class HubOfflineError extends Error {}

/** The hub answered with an error. `message` is its plain-words explanation. */
export class HubError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** What the Kairos tools need from the hub. Tests pass a fake. */
export interface Hub {
  health(): Promise<Health>;
  workspace(): Promise<Workspace>;
  films(): Promise<FilmSummary[]>;
  film(id: string): Promise<FilmSummary>;
  notes(id: string): Promise<Note[]>;
  noteImage(id: string, note: Note): Promise<Buffer>;
  updateNote(id: string, noteId: string, status: NoteStatus): Promise<Note>;
  /** A fresh PNG of the frame at `t` seconds. */
  frame(id: string, t: number): Promise<Buffer>;
  changeFilm(id: string, change: FilmChange): Promise<FilmSummary>;
  startRender(id: string, quality: RenderQuality): Promise<RenderJob>;
  renders(): Promise<RendersOverview>;
  /** The asset library. */
  assets(): Promise<Asset[]>;
  /** Copies an asset into a film (a sound becomes a track). Returns its path inside the film. */
  useAsset(asset: string, film: string, start?: number): Promise<string>;
  references(id: string): Promise<Reference[]>;
  /** Sheet `n` (from 1) of a reference: a PNG. */
  referenceSheet(id: string, ref: string, n: number): Promise<Buffer>;
  filmVoices(id: string): Promise<FilmVoices>;
  setFilmVoices(id: string, voices: FilmVoices): Promise<FilmVoices>;
  voiceLibrary(query: string, mine: boolean): Promise<VoiceInfo[]>;
  lines(id: string): Promise<VoiceLine[]>;
  makeLines(
    id: string,
    input: NewLines,
  ): Promise<{ lines: VoiceLine[]; placed: { file: string; start: number; duration: number }[] }>;
  /** Word timings of a sound; with `transcribe`, asks fish.audio when there are none yet. */
  words(id: string, file: string, transcribe: boolean): Promise<WordsAnswer>;
  cast(
    id: string,
    speakers: { speaker: string; type: VoiceType }[],
  ): Promise<{ voices: FilmVoices; problems: string[] }>;
  script(id: string): Promise<Script | null>;
  saveScript(id: string, input: ScriptInput): Promise<Script>;
  makeScript(id: string): Promise<MadeScript>;
}

/** Calls the Kairos hub over HTTP (it only listens on 127.0.0.1). */
export class HubClient implements Hub {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async #fetch(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch {
      throw new HubOfflineError(`Nothing answers at ${this.baseUrl}.`);
    }
    if (!response.ok) {
      const body = ApiErrorSchema.safeParse(await response.json().catch(() => null));
      const message = body.success ? (body.data.message ?? body.data.reason) : undefined;
      throw new HubError(message ?? `The hub answered ${response.status}.`, response.status);
    }
    return response;
  }

  async #json<S extends z.ZodType>(schema: S, path: string, init?: RequestInit) {
    return schema.parse(await (await this.#fetch(path, init)).json()) as z.output<S>;
  }

  async #bytes(path: string): Promise<Buffer> {
    return Buffer.from(await (await this.#fetch(path)).arrayBuffer());
  }

  #send(method: string, body: unknown): RequestInit {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  }

  health() {
    return this.#json(HealthSchema, "/api/health");
  }

  workspace() {
    return this.#json(WorkspaceSchema, "/api/workspace");
  }

  films() {
    return this.#json(z.array(FilmSummarySchema), "/api/films");
  }

  film(id: string) {
    return this.#json(FilmSummarySchema, `/api/films/${encodeURIComponent(id)}`);
  }

  notes(id: string) {
    return this.#json(z.array(NoteSchema), `/api/films/${encodeURIComponent(id)}/notes`);
  }

  noteImage(id: string, note: Note) {
    return this.#bytes(
      `/api/films/${encodeURIComponent(id)}/notes/${encodeURIComponent(note.id)}/image`,
    );
  }

  updateNote(id: string, noteId: string, status: NoteStatus) {
    return this.#json(
      NoteSchema,
      `/api/films/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      this.#send("PATCH", { status }),
    );
  }

  frame(id: string, t: number) {
    return this.#bytes(`/api/films/${encodeURIComponent(id)}/frame?t=${t}`);
  }

  changeFilm(id: string, change: FilmChange) {
    return this.#json(
      FilmSummarySchema,
      `/api/films/${encodeURIComponent(id)}`,
      this.#send("PATCH", change),
    );
  }

  startRender(id: string, quality: RenderQuality) {
    return this.#json(
      RenderJobSchema,
      `/api/films/${encodeURIComponent(id)}/renders`,
      this.#send("POST", { quality }),
    );
  }

  assets() {
    return this.#json(z.array(AssetSchema), "/api/assets");
  }

  async useAsset(asset: string, film: string, start?: number) {
    const path = asset.split("/").map(encodeURIComponent).join("/");
    const answer = await this.#json(
      z.object({ path: z.string() }),
      `/api/assets/${path}/use`,
      this.#send("POST", { film, start }),
    );
    return answer.path;
  }

  references(id: string) {
    return this.#json(z.array(ReferenceSchema), `/api/films/${encodeURIComponent(id)}/references`);
  }

  referenceSheet(id: string, ref: string, n: number) {
    return this.#bytes(
      `/api/films/${encodeURIComponent(id)}/references/${encodeURIComponent(ref)}/sheets/${n}`,
    );
  }

  filmVoices(id: string) {
    return this.#json(FilmVoicesSchema, `/api/films/${encodeURIComponent(id)}/voices`);
  }

  setFilmVoices(id: string, voices: FilmVoices) {
    return this.#json(
      FilmVoicesSchema,
      `/api/films/${encodeURIComponent(id)}/voices`,
      this.#send("PUT", voices),
    );
  }

  voiceLibrary(query: string, mine: boolean) {
    const params = new URLSearchParams({ query, mine: String(mine) });
    return this.#json(z.array(VoiceInfoSchema), `/api/voice/library?${params}`);
  }

  lines(id: string) {
    return this.#json(z.array(VoiceLineSchema), `/api/films/${encodeURIComponent(id)}/lines`);
  }

  makeLines(id: string, input: NewLines) {
    return this.#json(
      z.object({
        lines: z.array(VoiceLineSchema),
        placed: z.array(z.object({ file: z.string(), start: z.number(), duration: z.number() })),
      }),
      `/api/films/${encodeURIComponent(id)}/lines`,
      this.#send("POST", input),
    );
  }

  async words(id: string, file: string, transcribe: boolean) {
    const film = `/api/films/${encodeURIComponent(id)}/words`;
    try {
      return await this.#json(WordsAnswerSchema, `${film}?file=${encodeURIComponent(file)}`);
    } catch (error) {
      if (!(error instanceof HubError) || error.status !== 404 || !transcribe) throw error;
      return this.#json(WordsAnswerSchema, film, this.#send("POST", { file }));
    }
  }

  cast(id: string, speakers: { speaker: string; type: VoiceType }[]) {
    return this.#json(
      z.object({ voices: FilmVoicesSchema, problems: z.array(z.string()) }),
      `/api/films/${encodeURIComponent(id)}/cast`,
      this.#send("POST", { speakers }),
    );
  }

  async script(id: string) {
    const answer = await this.#json(
      z.object({ script: ScriptSchema.nullable() }),
      `/api/films/${encodeURIComponent(id)}/script`,
    );
    return answer.script;
  }

  async saveScript(id: string, input: ScriptInput) {
    const answer = await this.#json(
      z.object({ script: ScriptSchema }),
      `/api/films/${encodeURIComponent(id)}/script`,
      this.#send("PUT", input),
    );
    return answer.script;
  }

  makeScript(id: string) {
    return this.#json(
      MadeScriptSchema,
      `/api/films/${encodeURIComponent(id)}/script/make`,
      this.#send("POST", {}),
    );
  }

  renders() {
    return this.#json(RendersOverviewSchema, "/api/renders");
  }
}
