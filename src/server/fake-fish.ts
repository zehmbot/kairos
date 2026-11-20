/**
 * A fake fish.audio for tests and local checks: the same addresses and answers, no account needed.
 * Key "good-key" works; a line containing "no credit" answers 402, "busy" answers 429.
 */
import Fastify, { type FastifyInstance } from "fastify";

const GOOD_KEY = "good-key-1234";

export interface FakeFish {
  url: string;
  /** How many speech requests it answered (to check reuse). */
  speechCalls: () => number;
  close: () => Promise<void>;
}

/** Words of a text, 0.4 s each, in two chunks (the second starts at 1.5 s), like fish.audio's stream. */
function speechEvents(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  const chunks = [words.slice(0, half), words.slice(half)].filter((chunk) => chunk.length);
  const events: object[] = [];
  let offset = 0;
  chunks.forEach((chunk, seq) => {
    const segments = chunk.map((word, i) => ({ text: word, start: i * 0.4, end: i * 0.4 + 0.35 }));
    // A first, partial snapshot, then the full one (only the latest counts).
    events.push({
      audio_base64: Buffer.from(`audio-${seq}-a|`).toString("base64"),
      content: chunk.join(" "),
      alignment: { segments: segments.slice(0, 1), audio_duration: 0.4 },
      chunk_seq: seq,
      chunk_audio_offset_sec: offset,
    });
    events.push({
      audio_base64: Buffer.from(`audio-${seq}-b|`).toString("base64"),
      content: chunk.join(" "),
      alignment: { segments, audio_duration: chunk.length * 0.4 },
      chunk_seq: seq,
      chunk_audio_offset_sec: offset,
    });
    offset = 1.5;
  });
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

const castVoice = (
  id: string,
  title: string,
  tags: string[],
  likes: number,
  description = "A clear voice.",
) => ({
  _id: id,
  type: "tts",
  title,
  description,
  tags,
  languages: ["en"],
  like_count: likes,
  task_count: likes * 100,
  state: "trained",
  visibility: "public",
  dmca_taken_down: false,
  author: { nickname: "Tests" },
  samples: [{ title: "s", text: "Hi", task_id: "t", audio: `https://example.test/${id}.mp3` }],
});

/** Library voices with tags, for casting: plain ones and copies the automatic pick must skip. */
export const CAST_VOICES = [
  castVoice("v-sarah", "Sarah", ["female", "young", "narration", "soft"], 9000),
  castVoice("v-paula", "Paula", ["female", "middle-aged", "educational"], 1800),
  castVoice("v-laura", "Laura", ["female", "middle-aged", "warm", "calm"], 1700),
  castVoice("v-friendly", "Friendly Women", ["female", "young", "cheerful", "bright"], 500),
  castVoice("v-adrian", "Adrian", ["male", "middle-aged", "narration", "deep"], 4100),
  castVoice("v-ethan", "Ethan", ["male", "middle-aged", "educational", "narration"], 3300),
  castVoice("v-jordan", "Jordan", ["male", "old", "narration"], 900),
  // Copies and doubtful voices:
  castVoice("c-singer", "Taylor Swift", ["female", "middle-aged", "narration"], 5000),
  castVoice("c-brand", "Roblox", ["female", "young"], 8000),
  castVoice("c-cartoon", "Lola Loud", ["the loud house", "female", "child", "girl"], 300),
  castVoice("c-bluey", "Rusty (Bluey)", ["male", "cartoon", "child"], 300),
  castVoice("c-player", "ronaldo", ["male", "middle-aged"], 2000, "ronaldo voice"),
  castVoice("c-mislabeled", "Grace", ["female", "young"], 2500, "A youthful male voice."),
  castVoice("c-unknown", "Tim", ["neutral", "young", "child"], 0),
];

export async function startFakeFish(): Promise<FakeFish> {
  const app: FastifyInstance = Fastify();
  let speech = 0;
  app.addContentTypeParser(/^multipart\/form-data/, { parseAs: "buffer" }, (_request, body, done) =>
    done(null, body),
  );
  app.addHook("onRequest", async (request, reply) => {
    // The voice library is public (your own voices are not).
    const query = request.query as { tag?: string; self?: string };
    const publicList =
      request.url.startsWith("/model") && query.tag !== undefined && !request.headers.authorization;
    if (publicList) return;
    if (request.headers.authorization !== `Bearer ${GOOD_KEY}`) {
      return reply.code(401).send({ status: 401, message: "Invalid token" });
    }
  });

  app.get("/model", async (request) => {
    const query = request.query as {
      self?: string;
      title?: string;
      tag?: string;
      page_number?: string;
      language?: string;
    };
    if (query.tag !== undefined) {
      // Casting: tagged voices, most used first; only one page.
      if (query.page_number && query.page_number !== "1") return { total: 0, items: [] };
      const items = CAST_VOICES.filter(
        (voice) =>
          voice.tags.includes(query.tag ?? "") &&
          (!query.language || voice.languages.includes(query.language)),
      );
      return { total: items.length, items };
    }
    const items = [
      {
        _id: "voice-calm",
        type: "tts",
        title: "Calm Narrator",
        description: "Warm and slow",
        languages: ["en"],
        author: { _id: "a1", nickname: "Kairos tests", avatar: "" },
        cover_image: "https://example.test/cover.png",
        samples: [
          { title: "s", text: "Hello", task_id: "t", audio: "https://example.test/sample.mp3" },
        ],
      },
      {
        _id: "voice-kid",
        type: "tts",
        title: "Kid Voice",
        languages: ["en"],
        author: { nickname: "Tests" },
      },
      { _id: "svc-x", type: "svc", title: "Not for speech" },
    ];
    const mine = query.self === "true" ? items.slice(1, 2) : items;
    const title = query.title?.toLowerCase();
    return {
      total: mine.length,
      items: title ? mine.filter((i) => i.title.toLowerCase().includes(title)) : mine,
    };
  });

  app.post("/v1/tts/stream/with-timestamp", async (request, reply) => {
    const body = request.body as { text: string; reference_id: string };
    if (body.text.includes("no credit"))
      return reply.code(402).send({ status: 402, message: "Payment required" });
    if (body.text.includes("busy"))
      return reply.code(429).send({ status: 429, message: "Too many" });
    speech++;
    return reply.type("text/event-stream").send(speechEvents(body.text));
  });

  app.post("/v1/asr", async (request, reply) => {
    const raw = (request.body as Buffer).toString("latin1");
    if (
      !raw.includes('name="ignore_timestamps"') ||
      !/name="ignore_timestamps"\r\n\r\nfalse/.test(raw)
    ) {
      return reply.code(400).send({ message: "expected ignore_timestamps=false" });
    }
    if (request.headers.model !== "transcribe-1-pro")
      return reply.code(400).send({ message: "model" });
    return {
      text: "hello from a recording",
      duration: 2,
      segments: [
        { text: "hello", start: 0.1, end: 0.5 },
        { text: "from", start: 0.6, end: 0.8 },
        { text: "a", start: 0.85, end: 0.9 },
        { text: "recording", start: 0.95, end: 1.6 },
      ],
    };
  });

  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return { url: address, speechCalls: () => speech, close: () => app.close() };
}

export const FAKE_FISH_KEY = GOOD_KEY;
