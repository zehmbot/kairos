import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ApiErrorSchema,
  type BriefAnswers,
  BriefFileSchema,
  CameraSchema,
  ClaudeStatusSchema,
  ExportInfoSchema,
  type FilmChange,
  FilmSummarySchema,
  HealthSchema,
  type NewFilm,
  type NewNote,
  type NewSkill,
  type Note,
  NoteSchema,
  type NoteUpdate,
  PickSkillResultSchema,
  PickWorkspaceResultSchema,
  RenderJobSchema,
  RendersOverviewSchema,
  type SaveTemplate,
  SkillSchema,
  type StartRender,
  type TemplateInput,
  TemplateSummarySchema,
  TrashEntrySchema,
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
  claude: ["claude"],
  skills: ["skills"],
  export: ["export"],
  renders: ["renders"],
  templates: ["templates"],
  // Under "films": every films change refreshes the trash too.
  trash: ["films", "~trash"],
  brief: (id: string) => ["films", id, "brief"],
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

/** Templates for New film: Kairos' own first, then the user's. */
export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => call(z.array(TemplateSummarySchema), "/api/templates"),
  });
}

export const templatePreviewUrl = (id: string) =>
  `/api/templates/${encodeURIComponent(id)}/preview`;

const templateUrl = (id: string) => `/api/templates/${encodeURIComponent(id)}`;

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.templates, id],
    queryFn: () => call(TemplateSummarySchema, templateUrl(id ?? "")),
    enabled: Boolean(id),
  });
}

/** Makes (no id) or changes (id) one of the user's templates. */
export function useSaveTemplateSettings(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateInput) =>
      call(
        TemplateSummarySchema,
        id ? templateUrl(id) : "/api/templates",
        sendJson(id ? "PUT" : "POST", input),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
  });
}

export function useDuplicateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(TemplateSummarySchema, `${templateUrl(id)}/duplicate`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
  });
}

export function useOpenTemplateFolder() {
  return useMutation({
    mutationFn: (id: string) => callNoContent(`${templateUrl(id)}/open-folder`, { method: "POST" }),
  });
}

/** Films and their videos come and go together (delete, restore). */
const refreshFilmsAndRenders = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.films }),
    queryClient.invalidateQueries({ queryKey: queryKeys.renders }),
  ]);

/** Deletes a film: to the trash, or for good. */
export function useDeleteFilm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, forever }: { id: string; forever: boolean }) =>
      callNoContent(`/api/films/${encodeURIComponent(id)}${forever ? "?forever=true" : ""}`, {
        method: "DELETE",
      }),
    // Not awaited: the caller's own onSuccess (leave the film page) must run before the film disappears.
    onSuccess: () => {
      void refreshFilmsAndRenders(queryClient);
    },
  });
}

export function useTrash(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.trash,
    queryFn: () => call(z.array(TrashEntrySchema), "/api/trash"),
    enabled,
  });
}

/** Restores a trashed film, deletes one for good, or empties the trash (no entry). */
export function useTrashAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entry, action }: { entry?: string; action: "restore" | "delete" }) => {
      const url = entry ? `/api/trash/${encodeURIComponent(entry)}` : "/api/trash";
      if (action === "restore") {
        await call(z.object({ id: z.string() }), `${url}/restore`, { method: "POST" });
      } else {
        await callNoContent(url, { method: "DELETE" });
      }
    },
    // Not awaited: the caller's own onSuccess (leave the film page) must run before the film disappears.
    onSuccess: () => {
      void refreshFilmsAndRenders(queryClient);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      callNoContent(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
  });
}

/** A film's card picture; `updatedAt` makes the browser ask again after the film changes. */
export const thumbnailUrl = (film: { id: string; updatedAt: number }) =>
  `/api/films/${encodeURIComponent(film.id)}/thumbnail?v=${film.updatedAt}`;

const briefUrl = (filmId: string) => `/api/films/${encodeURIComponent(filmId)}/brief`;

export function useBrief(filmId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.brief(filmId),
    queryFn: () => call(BriefFileSchema, briefUrl(filmId)),
    enabled,
  });
}

export function useSaveBrief(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: BriefAnswers) =>
      call(BriefFileSchema, briefUrl(filmId), sendJson("PUT", { answers })),
    onSuccess: (brief) => queryClient.setQueryData(queryKeys.brief(filmId), brief),
  });
}

export function useSaveTemplate(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveTemplate) =>
      call(
        TemplateSummarySchema,
        `/api/films/${encodeURIComponent(filmId)}/save-as-template`,
        sendJson("POST", input),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
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

/** Claude Code on this computer, and whether the Kairos tools are added to it. */
export function useClaude() {
  return useQuery({
    queryKey: queryKeys.claude,
    queryFn: () => call(ClaudeStatusSchema, "/api/claude"),
    // Asking `claude` takes a second or two: don't ask again on every visit.
    staleTime: 30_000,
  });
}

/** Connects (`true`) or disconnects (`false`) the Kairos tools in Claude Code. */
export function useConnectClaude() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connect: boolean) =>
      call(ClaudeStatusSchema, `/api/claude/${connect ? "connect" : "disconnect"}`, {
        method: "POST",
      }),
    onSuccess: (status) => queryClient.setQueryData(queryKeys.claude, status),
  });
}

/** Kairos skills and the user's own, with their state in Claude Code. */
export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => call(z.array(SkillSchema), "/api/skills"),
  });
}

/** Every change answers with the new list of skills. */
function useSkillChange<V>(request: (value: V) => [url: string, init: RequestInit]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: V) => call(z.array(SkillSchema), ...request(value)),
    onSuccess: (list) => queryClient.setQueryData(queryKeys.skills, list),
  });
}

const skillUrl = (name: string) => `/api/skills/${encodeURIComponent(name)}`;

/** Turns a skill on, off, or updates Claude's copy. */
export function useSkillSwitch() {
  return useSkillChange(({ name, to }: { name: string; to: "on" | "off" | "update" }) => [
    `${skillUrl(name)}/${to}`,
    { method: "POST" },
  ]);
}

export function useDeleteSkill() {
  return useSkillChange((name: string) => [skillUrl(name), { method: "DELETE" }]);
}

export function useCreateSkill() {
  return useSkillChange((skill: NewSkill) => ["/api/skills", sendJson("POST", skill)]);
}

/** Opens the system folder window to add a skill folder. */
export function usePickSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(PickSkillResultSchema, "/api/skills/pick", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

export function useOpenSkillFolder() {
  return useMutation({
    mutationFn: (name: string) =>
      callNoContent(`${skillUrl(name)}/open-folder`, { method: "POST" }),
  });
}

/** ffmpeg and the encoders that work on this computer. */
export function useExportInfo() {
  return useQuery({
    queryKey: queryKeys.export,
    queryFn: () => call(ExportInfoSchema, "/api/export"),
    staleTime: 60_000,
  });
}

/** The render queue and every finished video. Progress arrives live (see hubEvents.ts). */
export function useRenders() {
  return useQuery({
    queryKey: queryKeys.renders,
    queryFn: () => call(RendersOverviewSchema, "/api/renders"),
  });
}

export function useStartRender(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: StartRender) =>
      call(
        RenderJobSchema,
        `/api/films/${encodeURIComponent(filmId)}/renders`,
        sendJson("POST", options),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.renders }),
  });
}

export function useCancelRender() {
  return useMutation({
    mutationFn: (jobId: string) =>
      callNoContent(`/api/renders/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }),
  });
}

const videoPath = (filmId: string, version: number) =>
  `/api/films/${encodeURIComponent(filmId)}/renders/${version}`;

/** Address of a finished video, for the in-app player. */
export const videoUrl = (filmId: string, version: number) => `${videoPath(filmId, version)}/video`;

export function useDeleteRender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ filmId, version }: { filmId: string; version: number }) =>
      callNoContent(videoPath(filmId, version), { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.renders }),
  });
}

export function useOpenRenderFolder() {
  return useMutation({
    mutationFn: ({ filmId, version }: { filmId: string; version: number }) =>
      callNoContent(`${videoPath(filmId, version)}/open-folder`, { method: "POST" }),
  });
}

/** Opens a terminal with Claude running in the film's folder. */
export function useOpenClaude() {
  return useMutation({
    mutationFn: (id: string) =>
      callNoContent(`/api/films/${encodeURIComponent(id)}/open-claude`, { method: "POST" }),
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
