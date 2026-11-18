import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import { type CameraInfo, NewNoteSchema, type Note, NoteUpdateSchema } from "../../shared/types.ts";
import type { Camera } from "../camera.ts";
import { type Film, readFilm } from "../films.ts";
import {
  addNote,
  isNoteId,
  listNotes,
  NotesFileError,
  noteImagePath,
  removeNote,
  saveNoteImage,
  updateNote,
} from "../notes.ts";
import type { Studio } from "../studio.ts";
import { sendError } from "./errors.ts";

export interface NoteRoutesOptions {
  studio: Studio;
  camera: Pick<Camera, "browser" | "capture">;
  /** Address of the film server, like `http://127.0.0.1:7342`, for the camera. */
  filmServerUrl: string;
}

interface FilmParams {
  id: string;
}
interface NoteParams extends FilmParams {
  noteId: string;
}

/** Leaves room for float rounding when a note sits on the very last frame. */
const TIME_SLACK = 0.001;

export function noteRoutes(app: FastifyInstance, options: NoteRoutesOptions): void {
  app.register(async (scope) => noteRoutesIn(scope, options));
}

function noteRoutesIn(app: FastifyInstance, options: NoteRoutesOptions): void {
  const { studio, camera } = options;

  const changed = (filmId: string) => studio.events.publish({ type: "notes-changed", id: filmId });

  /** Finds the film, or sends the right error and returns `null`. */
  async function filmOr404(reply: FastifyReply, id: string): Promise<Film | null> {
    const dir = studio.filmsDir;
    if (!dir) {
      await sendError(reply, 409, "no-workspace", "Choose a workspace folder first.");
      return null;
    }
    const film = await readFilm(dir, id);
    if (!film) {
      await sendError(reply, 404, "not-found", "This film doesn't exist (any more).");
      return null;
    }
    return film;
  }

  const noteNotFound = (reply: FastifyReply) =>
    sendError(reply, 404, "note-not-found", "This note doesn't exist (any more).");

  // A hand-broken notes.json: explain it instead of failing with a 500. Other errors go to Fastify.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof NotesFileError)
      return sendError(reply, 409, "notes-broken", error.message);
    throw error;
  });

  /** Takes the note's picture in the background, then tells the UI. Failures only cost the picture. */
  async function takePicture(film: Film, note: Note): Promise<void> {
    const path = studio.previewPath(film);
    if (!camera.browser || !film.config || !path) return;
    try {
      const png = await camera.capture({
        url: `${options.filmServerUrl}${path}`,
        width: film.config.width,
        height: film.config.height,
        t: note.t,
        shapes: note.shapes,
      });
      if (await saveNoteImage(film.path, note.id, png)) changed(film.id);
    } catch (error) {
      console.warn(`No picture for note ${note.id} of "${film.id}": ${(error as Error).message}`);
    }
  }

  app.get("/api/camera", async (): Promise<CameraInfo> => ({ browser: camera.browser }));

  app.get<{ Params: FilmParams }>("/api/films/:id/notes", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    return listNotes(film.path);
  });

  app.post<{ Params: FilmParams }>("/api/films/:id/notes", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    if (!film.config) {
      return sendError(
        reply,
        409,
        "film-broken",
        "Fix this film's kairos.json before adding notes.",
      );
    }
    const body = NewNoteSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    const end = film.config.duration + TIME_SLACK;
    if (body.data.t > end || (body.data.until !== null && body.data.until > end)) {
      return sendError(reply, 400, "bad-time", "That time is past the end of the film.");
    }

    const note = await addNote(film.path, body.data);
    changed(film.id);
    void takePicture(film, note);
    return reply.code(201).send(note);
  });

  app.patch<{ Params: NoteParams }>("/api/films/:id/notes/:noteId", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    const body = NoteUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    const note = await updateNote(film.path, request.params.noteId, body.data);
    if (!note) return noteNotFound(reply);
    changed(film.id);
    return note;
  });

  app.delete<{ Params: NoteParams }>("/api/films/:id/notes/:noteId", async (request, reply) => {
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    if (!(await removeNote(film.path, request.params.noteId))) return noteNotFound(reply);
    changed(film.id);
    return reply.code(204).send();
  });

  app.get<{ Params: NoteParams }>("/api/films/:id/notes/:noteId/image", async (request, reply) => {
    const { noteId } = request.params;
    if (!isNoteId(noteId)) return noteNotFound(reply);
    const film = await filmOr404(reply, request.params.id);
    if (!film) return reply;
    const png = await readFile(noteImagePath(film.path, noteId)).catch(() => null);
    if (!png) return sendError(reply, 404, "no-picture", "This note has no picture yet.");
    return reply.type("image/png").header("cache-control", "no-store").send(png);
  });
}
