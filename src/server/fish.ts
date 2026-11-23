/**
 * fish.audio: the only code that talks to it. Voices (`GET /model`), speech with word timings
 * (`POST /v1/tts/stream/with-timestamp`, an SSE stream), speech-to-text (`POST /v1/asr`).
 * Every problem becomes a FishError with a plain-words message. The key is sent only to fish.audio.
 */
import type { VoiceInfo, Word } from "../shared/types.ts";

export const FISH_KEY_NAME = "FISH_AUDIO_API_KEY";
/** The free model: new installs start there (Settings → Voice changes it). */
export const DEFAULT_FISH_MODEL = "s2.1-pro-free";
export const FISH_MODELS = ["s2.1-pro", "s2.1-pro-free", "s2-pro", "s1"] as const;

/** A fish.audio problem, said plainly. */
export class FishError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

export interface FishOptions {
  /** The API key; null for public lists (the voice library needs none). */
  key: string | null;
  /** fish.audio's address (tests point it at a fake server). */
  baseUrl?: string;
}

const base = (options: FishOptions) =>
  (options.baseUrl ?? process.env.FISH_AUDIO_URL ?? "https://api.fish.audio").replace(/\/$/, "");

/** Turns a failed answer into a plain-words FishError. */
async function problem(response: Response): Promise<FishError> {
  let detail = "";
  try {
    const body = (await response.json()) as { message?: string; reason?: string };
    detail = body.message ?? body.reason ?? "";
  } catch {}
  const status = response.status;
  if (status === 401 || status === 403) {
    return new FishError(
      "fish.audio didn't accept this key. Check it in Settings → Voice.",
      status,
    );
  }
  if (status === 402) {
    return new FishError(
      "Your fish.audio account has no credit for this. Top it up on fish.audio, or choose the free model in Settings → Voice.",
      status,
    );
  }
  if (status === 429) {
    return new FishError(
      "fish.audio is busy right now (too many requests). Try again in a moment.",
      status,
    );
  }
  if (status >= 500) {
    return new FishError(
      `fish.audio is having trouble right now (${status}). Try again later.`,
      status,
    );
  }
  return new FishError(
    `fish.audio couldn't do this${detail ? `: ${detail}` : ` (${status})`}.`,
    status,
  );
}

async function call(options: FishOptions, path: string, init: RequestInit, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(`${base(options)}${path}`, {
      ...init,
      headers: {
        ...(options.key ? { authorization: `Bearer ${options.key}` } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new FishError("fish.audio took too long to answer. Try again.");
    }
    throw new FishError("Kairos can't reach fish.audio. Check your internet connection.");
  }
  if (!response.ok) throw await problem(response);
  return response;
}

/** Checks a key with the smallest request there is (your own voices, one item). */
export async function checkKey(options: FishOptions): Promise<void> {
  await call(options, "/model?self=true&page_size=1", { method: "GET" }, 20_000);
}

const absolute = (value: unknown) =>
  typeof value === "string" && /^https:\/\//.test(value) ? value : null;

/** Voices from the fish.audio library (`query` searches titles) or your own (`mine`). */
export async function listVoices(
  options: FishOptions,
  {
    query = "",
    mine = false,
    pageSize = 20,
  }: { query?: string; mine?: boolean; pageSize?: number } = {},
): Promise<VoiceInfo[]> {
  const params = new URLSearchParams({ page_size: String(pageSize), sort_by: "score" });
  if (mine) params.set("self", "true");
  if (query.trim()) params.set("title", query.trim());
  const response = await call(options, `/model?${params}`, { method: "GET" }, 20_000);
  const body = (await response.json()) as { items?: Record<string, unknown>[] };
  return (body.items ?? [])
    .filter((item) => item.type === undefined || item.type === "tts")
    .map((item) => {
      const author = item.author as { nickname?: string } | undefined;
      const samples = (item.samples as { audio?: string }[] | undefined) ?? [];
      return {
        id: String(item._id ?? ""),
        name: String(item.title ?? "Voice"),
        author: author?.nickname ?? null,
        description: typeof item.description === "string" ? item.description.slice(0, 300) : "",
        languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
        cover: absolute(item.cover_image),
        sample: absolute(samples[0]?.audio),
      };
    })
    .filter((voice) => voice.id);
}

/** A library voice with what casting needs: its tags and how much it is used. */
export interface VoiceCandidate extends VoiceInfo {
  tags: string[];
  uses: number;
  likes: number;
}

/** Library voices with one tag (fish.audio reads several tags as "any of"), most used first. Public. */
export async function voiceCandidates(
  options: FishOptions,
  {
    tag,
    language,
    pageSize = 100,
    page = 1,
  }: { tag: string; language?: string; pageSize?: number; page?: number },
): Promise<VoiceCandidate[]> {
  const params = new URLSearchParams({
    page_size: String(pageSize),
    page_number: String(page),
    sort_by: "task_count",
    tag,
  });
  if (language) params.set("language", language);
  const response = await call(options, `/model?${params}`, { method: "GET" }, 30_000);
  const body = (await response.json()) as { items?: Record<string, unknown>[] };
  return (body.items ?? [])
    .filter(
      (item) =>
        (item.type === undefined || item.type === "tts") &&
        item.dmca_taken_down !== true &&
        (item.state === undefined || item.state === "trained") &&
        (item.visibility === undefined || item.visibility === "public"),
    )
    .map((item) => {
      const author = item.author as { nickname?: string } | undefined;
      const samples = (item.samples as { audio?: string }[] | undefined) ?? [];
      return {
        id: String(item._id ?? ""),
        name: String(item.title ?? "Voice"),
        author: author?.nickname ?? null,
        description: typeof item.description === "string" ? item.description.slice(0, 300) : "",
        languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
        cover: absolute(item.cover_image),
        sample: absolute(samples[0]?.audio),
        tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [],
        uses: typeof item.task_count === "number" ? item.task_count : 0,
        likes: typeof item.like_count === "number" ? item.like_count : 0,
      };
    })
    .filter((voice) => voice.id);
}

interface Alignment {
  segments: { text: string; start: number; end: number }[];
  audio_duration?: number;
}

const round3 = (t: number) => Math.round(t * 1000) / 1000;

/**
 * Reads fish.audio's timestamped speech stream: the audio chunks joined in order, and the words from the latest
 * alignment of each text chunk, moved to the full audio's time (`chunk_audio_offset_sec`).
 */
export function readSpeechEvents(events: readonly unknown[]): {
  audio: Buffer;
  words: Word[];
  duration: number;
} {
  const audio: Buffer[] = [];
  const chunks = new Map<number, { offset: number; alignment: Alignment }>();
  for (const raw of events) {
    const event = raw as {
      audio_base64?: string;
      alignment?: Alignment | null;
      chunk_seq?: number;
      chunk_audio_offset_sec?: number;
    };
    if (event.audio_base64) audio.push(Buffer.from(event.audio_base64, "base64"));
    if (event.alignment && typeof event.chunk_seq === "number") {
      chunks.set(event.chunk_seq, {
        offset: event.chunk_audio_offset_sec ?? 0,
        alignment: event.alignment,
      });
    }
  }
  const words: Word[] = [];
  let duration = 0;
  for (const [, { offset, alignment }] of [...chunks].sort((a, b) => a[0] - b[0])) {
    for (const segment of alignment.segments ?? []) {
      const text = String(segment.text ?? "").trim();
      if (!text) continue;
      words.push({
        text,
        start: round3(offset + segment.start),
        end: round3(offset + segment.end),
      });
    }
    duration = Math.max(duration, offset + (alignment.audio_duration ?? 0));
  }
  return { audio: Buffer.concat(audio), words, duration: round3(duration) };
}

/** Splits an SSE body into its `data:` JSON objects. */
export function parseSse(text: string): unknown[] {
  const events: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      throw new FishError("fish.audio sent an answer Kairos can't read.");
    }
  }
  return events;
}

/** Speech for `text` in a voice, with each word's start and end (seconds). MP3. */
export async function speak(
  options: FishOptions,
  {
    text,
    voiceId,
    speed = 1,
    model = DEFAULT_FISH_MODEL,
  }: { text: string; voiceId: string; speed?: number; model?: string },
): Promise<{ audio: Buffer; words: Word[]; duration: number }> {
  const response = await call(
    options,
    "/v1/tts/stream/with-timestamp",
    {
      method: "POST",
      headers: { "content-type": "application/json", model },
      body: JSON.stringify({
        text,
        reference_id: voiceId,
        format: "mp3",
        mp3_bitrate: 128,
        latency: "normal",
        normalize: true,
        prosody: { speed, normalize_loudness: true },
      }),
    },
    180_000,
  );
  const result = readSpeechEvents(parseSse(await response.text()));
  if (result.audio.length === 0)
    throw new FishError("fish.audio sent back no sound for this line.");
  return result;
}

/** The words of a recording, with their times (speech-to-text). */
export async function transcribe(
  options: FishOptions,
  { audio, name, language }: { audio: Buffer; name: string; language?: string },
): Promise<{ text: string; duration: number; words: Word[] }> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)]), name);
  form.append("ignore_timestamps", "false");
  if (language) form.append("language", language);
  const response = await call(
    options,
    "/v1/asr",
    { method: "POST", headers: { model: "transcribe-1-pro" }, body: form },
    600_000,
  );
  const body = (await response.json()) as {
    text?: string;
    duration?: number;
    segments?: { text: string; start: number; end: number }[];
  };
  return {
    text: body.text ?? "",
    duration: body.duration ?? 0,
    words: (body.segments ?? [])
      .map((segment) => ({
        text: String(segment.text ?? "").trim(),
        start: round3(segment.start),
        end: round3(segment.end),
      }))
      .filter((word) => word.text),
  };
}
