import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ApiErrorSchema,
  CameraSchema,
  type FilmChange,
  FilmSummarySchema,
  HealthSchema,
  type NewFilm,
  type NewNote,
  type Note,
  NoteSchema,
  type NoteUpdate,
  PickWorkspaceResultSchema,
  WorkspaceSchema,
} from "../shared/types.ts";

/** Calls the hub and checks the answer with `schema`. Errors carry the hub's plain-words message. */
async function call<S extends z.ZodType>(
  schema: S,
  url: string,
  init?: RequestInit,
): Promise<z.output<S>> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(body);
    const message = error.success ? (error.data.message ?? error.data.reason) : undefined;
    throw new Error(message ?? `The hub answered ${response.status}.`);
  }
  return schema.parse(body);
}

/** Calls the hub for an answer with no body (204). */
async function callNoContent(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new Error(
      (error.success ? (error.data.message ?? error.data.reason) : undefined) ??
        `The hub answered ${response.status}.`,
    );
  }
}

function sendJson(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export const queryKeys = {
  health: ["health"],
  workspace: ["workspace"],
  films: ["films"],
  film: (id: string) => ["films", id],
  notes: (id: string) => ["films", id, "notes"],
  camera: ["camera"],
} as const;

const notesUrl = (filmId: string) => `/api/films/${encodeURIComponent(filmId)}/notes`;

/** Address of a note's picture. `updatedAt` makes the browser fetch a new picture after changes. */
export function noteImageUrl(filmId: string, note: Note): string {
  return `${notesUrl(filmId)}/${note.id}/image?v=${encodeURIComponent(note.updatedAt)}`;
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => call(HealthSchema, "/api/health"),
    refetchInterval: 5000,
    retry: false,
  });
}

export function useWorkspace() {
  return useQuery({
    queryKey: queryKeys.workspace,
    queryFn: () => call(WorkspaceSchema, "/api/workspace"),
  });
}

export function useSetWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      call(WorkspaceSchema, "/api/workspace", sendJson("PUT", { path })),
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKeys.workspace, workspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.films });
    },
  });
}

/** Opens the system folder window on this computer and switches to the folder chosen there. */
export function usePickWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(PickWorkspaceResultSchema, "/api/workspace/pick", { method: "POST" }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.workspace, result.workspace);
      if (result.status === "picked") queryClient.invalidateQueries({ queryKey: queryKeys.films });
    },
  });
}

export function useFilms(enabled = true) {
  return useQuery({
    queryKey: queryKeys.films,
    queryFn: () => call(z.array(FilmSummarySchema), "/api/films"),
    enabled,
  });
}

export function useFilm(id: string) {
  return useQuery({
    queryKey: queryKeys.film(id),
    queryFn: () => call(FilmSummarySchema, `/api/films/${encodeURIComponent(id)}`),
    retry: false,
  });
}

export function useCreateFilm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (film: NewFilm) => call(FilmSummarySchema, "/api/films", sendJson("POST", film)),
    onSuccess: (film) => {
      queryClient.setQueryData(queryKeys.film(film.id), film);
      queryClient.invalidateQueries({ queryKey: queryKeys.films, exact: true });
    },
  });
}

/** Changes settings in a film's `kairos.json` (the frame rate). The preview reloads by itself. */
export function useChangeFilm(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: FilmChange) =>
      call(
        FilmSummarySchema,
        `/api/films/${encodeURIComponent(filmId)}`,
        sendJson("PATCH", change),
      ),
    onSuccess: (film) => {
      queryClient.setQueryData(queryKeys.film(film.id), film);
      queryClient.invalidateQueries({ queryKey: queryKeys.films, exact: true });
    },
  });
}

export function useNotes(filmId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notes(filmId),
    queryFn: () => call(z.array(NoteSchema), notesUrl(filmId)),
    enabled,
  });
}

export function useAddNote(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: NewNote) => call(NoteSchema, notesUrl(filmId), sendJson("POST", note)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notes(filmId) }),
  });
}

export function useUpdateNote(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, change }: { noteId: string; change: NoteUpdate }) =>
      call(NoteSchema, `${notesUrl(filmId)}/${noteId}`, sendJson("PATCH", change)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notes(filmId) }),
  });
}

export function useDeleteNote(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      callNoContent(`${notesUrl(filmId)}/${noteId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notes(filmId) }),
  });
}

export function useCamera() {
  return useQuery({
    queryKey: queryKeys.camera,
    queryFn: () => call(CameraSchema, "/api/camera"),
  });
}

export function useOpenFilmFolder() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/films/${encodeURIComponent(id)}/open-folder`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Kairos could not open the folder.");
    },
  });
}
