import { z } from "zod";
import {
  ApiErrorSchema,
  type FilmChange,
  type FilmSummary,
  FilmSummarySchema,
  type Health,
  HealthSchema,
  type Note,
  NoteSchema,
  type NoteStatus,
  type RenderJob,
  RenderJobSchema,
  type RenderQuality,
  type RendersOverview,
  RendersOverviewSchema,
  type Workspace,
  WorkspaceSchema,
} from "../shared/types.ts";

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

  renders() {
    return this.#json(RendersOverviewSchema, "/api/renders");
  }
}
