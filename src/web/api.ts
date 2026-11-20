import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ApiErrorSchema,
  AssetSchema,
  type AudioTrack,
  type BriefAnswers,
  BriefFileSchema,
  CameraSchema,
  ClaudeStatusSchema,
  ExportInfoSchema,
  type FilmChange,
  FilmSummarySchema,
  FilmVoiceSchema,
  type FilmVoices,
  FilmVoicesSchema,
  HealthSchema,
  type MakeScriptInput,
  type NewFilm,
  type NewLines,
  type NewNote,
  type NewSkill,
  type Note,
  NoteSchema,
  type NoteUpdate,
  PickSkillResultSchema,
  PickWorkspaceResultSchema,
  ReferenceSchema,
  RenderJobSchema,
  RendersOverviewSchema,
  type SaveTemplate,
  type ScriptInput,
  ScriptSchema,
  SkillSchema,
  type StartRender,
  type TemplateInput,
  TemplateSummarySchema,
  TrashEntrySchema,
  VoiceInfoSchema,
  VoiceLineSchema,
  VoiceStatusSchema,
  type VoiceType,
  WordSchema,
  WorkspaceSchema,
  type WriteNarration,
  WriterStateSchema,
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
  references: (id: string) => ["films", id, "references"],
  assets: ["assets"],
  voice: ["voice"],
  filmVoices: (id: string) => ["films", id, "voices"],
  lines: (id: string) => ["films", id, "lines"],
  words: (id: string) => ["films", id, "words"],
  script: (id: string) => ["films", id, "script"],
  writer: (id: string) => ["writer", id],
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

// ---------- Files: uploads, assets, sounds, references ----------

/**
 * Sends a file to the hub as it is (the body is the file), reporting progress from 0 to 1.
 * Resolves with the hub's JSON answer; rejects with its plain-words message.
 */
export function uploadFile(
  url: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("content-type", "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {}
      if (request.status >= 400) {
        const error = ApiErrorSchema.safeParse(body);
        reject(
          new Error(
            (error.success ? (error.data.message ?? error.data.reason) : undefined) ??
              `The hub answered ${request.status}.`,
          ),
        );
      } else resolve(body);
    };
    request.onerror = () =>
      reject(new Error("Kairos could not send the file. Is the hub running?"));
    request.send(file);
  });
}

export const assetFileUrl = (id: string) =>
  `/api/assets/${id.split("/").map(encodeURIComponent).join("/")}/file`;

export function useAssets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.assets,
    queryFn: () => call(z.array(AssetSchema), "/api/assets"),
    enabled,
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callNoContent(`/api/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assets }),
  });
}

/** Copies an asset into a film (a sound becomes a sound track, starting at `start`). */
export function useUseAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, film, start }: { id: string; film: string; start?: number }) =>
      call(
        z.object({ path: z.string() }),
        `/api/assets/${id}/use`,
        sendJson("POST", { film, start }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.films }),
  });
}

export function useOpenAssetsFolder() {
  return useMutation({
    mutationFn: () => callNoContent("/api/assets/open-folder", { method: "POST" }),
  });
}

const filmUrl = (filmId: string) => `/api/films/${encodeURIComponent(filmId)}`;

/** Adds a library sound to a film as a track. */
export function useAddSoundFromAsset(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { asset: string; start: number }) =>
      call(z.unknown(), `${filmUrl(filmId)}/sounds/from-asset`, sendJson("POST", input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId) }),
  });
}

/** Saves a film's whole list of sound tracks. */
export function useSaveAudio(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (audio: AudioTrack[]) =>
      call(z.unknown(), `${filmUrl(filmId)}/audio`, sendJson("PUT", { audio })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId) }),
  });
}

export function useReferences(filmId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.references(filmId),
    queryFn: () => call(z.array(ReferenceSchema), `${filmUrl(filmId)}/references`),
    enabled,
  });
}

export const referenceSheetUrl = (filmId: string, ref: string, n: number, version: string) =>
  `${filmUrl(filmId)}/references/${ref}/sheets/${n}?v=${encodeURIComponent(version)}`;

export function useAddReferenceFromAsset(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asset: string) =>
      call(
        ReferenceSchema,
        `${filmUrl(filmId)}/references/from-asset`,
        sendJson("POST", { asset }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.references(filmId) }),
  });
}

export function useReferenceNote(filmId: string) {
  return useMutation({
    mutationFn: ({ ref, note }: { ref: string; note: string }) =>
      call(ReferenceSchema, `${filmUrl(filmId)}/references/${ref}`, sendJson("PATCH", { note })),
  });
}

export function useDeleteReference(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      callNoContent(`${filmUrl(filmId)}/references/${ref}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.references(filmId) }),
  });
}

// ---------- Voices (fish.audio) ----------

export function useVoiceStatus() {
  return useQuery({
    queryKey: queryKeys.voice,
    queryFn: () => call(VoiceStatusSchema, "/api/voice/status"),
  });
}

/** Saves a fish.audio key (the hub checks it with fish.audio first), or removes it (null). */
export function useVoiceKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string | null) =>
      key === null
        ? call(VoiceStatusSchema, "/api/voice/key", { method: "DELETE" })
        : call(VoiceStatusSchema, "/api/voice/key", sendJson("PUT", { key })),
    onSuccess: (status) => queryClient.setQueryData(queryKeys.voice, status),
  });
}

export function useVoiceModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (model: string) =>
      call(VoiceStatusSchema, "/api/voice/model", sendJson("PUT", { model })),
    onSuccess: (status) => queryClient.setQueryData(queryKeys.voice, status),
  });
}

export function useVoiceLibrary(query: string, mine: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ["voice-library", query, mine],
    queryFn: () =>
      call(
        z.array(VoiceInfoSchema),
        `/api/voice/library?${new URLSearchParams({ query, mine: String(mine) })}`,
      ),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useFilmVoices(filmId: string) {
  return useQuery({
    queryKey: queryKeys.filmVoices(filmId),
    queryFn: () => call(FilmVoicesSchema, `${filmUrl(filmId)}/voices`),
  });
}

export function useSetFilmVoices(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (voices: FilmVoices) =>
      call(FilmVoicesSchema, `${filmUrl(filmId)}/voices`, sendJson("PUT", voices)),
    onSuccess: (voices) => {
      queryClient.setQueryData(queryKeys.filmVoices(filmId), voices);
      void queryClient.invalidateQueries({ queryKey: queryKeys.voice });
    },
  });
}

export function useLines(filmId: string) {
  return useQuery({
    queryKey: queryKeys.lines(filmId),
    queryFn: () => call(z.array(VoiceLineSchema), `${filmUrl(filmId)}/lines`),
  });
}

export function useMakeLines(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewLines) =>
      call(z.unknown(), `${filmUrl(filmId)}/lines`, sendJson("POST", input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lines(filmId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId), exact: true });
    },
  });
}

export function useDeleteLine(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (line: string) =>
      callNoContent(`${filmUrl(filmId)}/lines/${line}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lines(filmId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId), exact: true });
    },
  });
}

const WordsAnswerSchema = z.object({
  text: z.string(),
  duration: z.number(),
  words: z.array(WordSchema),
  source: z.enum(["speech", "transcript"]),
});

export type WordsAnswer = z.infer<typeof WordsAnswerSchema>;

/** Word timings of the film's sounds that have them, by file. */
export function useFilmWords(filmId: string) {
  return useQuery({
    queryKey: queryKeys.words(filmId),
    queryFn: () => call(z.record(z.string(), WordsAnswerSchema), `${filmUrl(filmId)}/words`),
    staleTime: 30_000,
  });
}

/** Asks fish.audio for the word timings of a recording (speech-to-text). */
export function useTranscribe(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: string) =>
      call(WordsAnswerSchema, `${filmUrl(filmId)}/words`, sendJson("POST", { file })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.words(filmId) }),
  });
}

// ---------- Casting, the script and the writer ----------

/** Gives speakers voices by type (Kairos picks fitting ones). */
export function useCast(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (speakers: { speaker: string; type: VoiceType }[]) =>
      call(
        z.object({ voices: FilmVoicesSchema, problems: z.array(z.string()) }),
        `${filmUrl(filmId)}/cast`,
        sendJson("POST", { speakers }),
      ),
    onSuccess: (result) => queryClient.setQueryData(queryKeys.filmVoices(filmId), result.voices),
  });
}

/** Another random voice of the same type for a speaker. */
export function useAnotherVoice(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (speaker: string) =>
      call(
        FilmVoicesSchema,
        `${filmUrl(filmId)}/cast/${encodeURIComponent(speaker)}/another`,
        sendJson("POST", {}),
      ),
    onSuccess: (voices) => queryClient.setQueryData(queryKeys.filmVoices(filmId), voices),
  });
}

export function useScript(filmId: string) {
  return useQuery({
    queryKey: queryKeys.script(filmId),
    queryFn: async () =>
      (await call(z.object({ script: ScriptSchema.nullable() }), `${filmUrl(filmId)}/script`))
        .script,
  });
}

export function useSaveScript(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScriptInput) =>
      call(
        z.object({ script: ScriptSchema, warnings: z.array(z.string()).default([]) }),
        `${filmUrl(filmId)}/script`,
        sendJson("PUT", input),
      ),
    onSuccess: ({ script }) => queryClient.setQueryData(queryKeys.script(filmId), script),
  });
}

const MadeScriptSchema = z.object({
  made: z.number(),
  reused: z.number(),
  warnings: z.array(z.string()),
});

/** Makes the script's voices (all that changed, or some lines: a new take) and places them. */
export function useMakeScript(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MakeScriptInput = {}) =>
      call(MadeScriptSchema, `${filmUrl(filmId)}/script/make`, sendJson("POST", input)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.film(filmId) }),
  });
}

/** A random fitting voice before there is a film (New film's narrator). Free: no key needed. */
export function usePickVoice() {
  return useMutation({
    mutationFn: (input: { type?: VoiceType; language?: string; avoid?: string[] }) =>
      call(FilmVoiceSchema, "/api/voice/pick", sendJson("POST", input)),
  });
}

/** The background writer of a film (kept up to date by `writer-progress` events). */
export function useWriter(filmId: string) {
  return useQuery({
    queryKey: queryKeys.writer(filmId),
    queryFn: () => call(WriterStateSchema, `${filmUrl(filmId)}/script/writer`),
  });
}

export function useStartWriter(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WriteNarration) =>
      call(WriterStateSchema, `${filmUrl(filmId)}/script/writer`, sendJson("POST", input)),
    onSuccess: (state) => queryClient.setQueryData(queryKeys.writer(filmId), state),
  });
}

export function useStopWriter(filmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call(WriterStateSchema, `${filmUrl(filmId)}/script/writer`, { method: "DELETE" }),
    onSuccess: (state) => queryClient.setQueryData(queryKeys.writer(filmId), state),
  });
}
