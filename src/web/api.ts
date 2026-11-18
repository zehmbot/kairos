import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ApiErrorSchema,
  FilmSummarySchema,
  HealthSchema,
  type NewFilm,
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

function sendJson(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export const queryKeys = {
  health: ["health"],
  workspace: ["workspace"],
  films: ["films"],
  film: (id: string) => ["films", id],
} as const;

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
