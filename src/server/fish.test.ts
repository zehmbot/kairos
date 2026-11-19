import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAKE_FISH_KEY, type FakeFish, startFakeFish } from "./fake-fish.ts";
import {
  checkKey,
  FishError,
  listVoices,
  parseSse,
  readSpeechEvents,
  speak,
  transcribe,
} from "./fish.ts";

let fake: FakeFish;
const options = () => ({ key: FAKE_FISH_KEY, baseUrl: fake.url });

beforeAll(async () => {
  fake = await startFakeFish();
});

afterAll(() => fake.close());

describe("fish.audio", () => {
  it("reads the speech stream: audio joined, latest words per chunk, moved by the chunk's offset", () => {
    const events = parseSse(
      'data: {"audio_base64":"YQ==","alignment":{"segments":[{"text":"Hi","start":0,"end":0.3}],"audio_duration":0.3},"chunk_seq":0,"chunk_audio_offset_sec":0}\n\n' +
        'data: {"audio_base64":"Yg==","alignment":{"segments":[{"text":"Hi","start":0,"end":0.3},{"text":"there","start":0.3,"end":0.7}],"audio_duration":0.7},"chunk_seq":0,"chunk_audio_offset_sec":0}\n\n' +
        'data: {"audio_base64":"Yw==","alignment":null,"chunk_seq":1,"chunk_audio_offset_sec":0.7}\n\n' +
        'data: {"audio_base64":"","alignment":{"segments":[{"text":"friend","start":0.1,"end":0.5}],"audio_duration":0.6},"chunk_seq":1,"chunk_audio_offset_sec":0.7}\n\n',
    );
    const result = readSpeechEvents(events);
    expect(result.audio.toString()).toBe("abc");
    expect(result.words).toEqual([
      { text: "Hi", start: 0, end: 0.3 },
      { text: "there", start: 0.3, end: 0.7 },
      { text: "friend", start: 0.8, end: 1.2 },
    ]);
    expect(result.duration).toBe(1.3);
  });

  it("checks keys and lists voices (speech voices only)", async () => {
    await expect(checkKey(options())).resolves.toBeUndefined();
    await expect(checkKey({ key: "wrong-key-0000", baseUrl: fake.url })).rejects.toThrow(
      "didn't accept this key",
    );
    const voices = await listVoices(options());
    expect(voices.map((v) => v.id)).toEqual(["voice-calm", "voice-kid"]);
    expect(voices[0]).toMatchObject({
      name: "Calm Narrator",
      author: "Kairos tests",
      languages: ["en"],
      sample: "https://example.test/sample.mp3",
    });
    expect((await listVoices(options(), { query: "kid" })).map((v) => v.id)).toEqual(["voice-kid"]);
    expect((await listVoices(options(), { mine: true })).map((v) => v.id)).toEqual(["voice-kid"]);
  });

  it("makes speech with word timings", async () => {
    const spoken = await speak(options(), { text: "one two three four", voiceId: "voice-calm" });
    expect(spoken.audio.toString()).toBe("audio-0-a|audio-0-b|audio-1-a|audio-1-b|");
    expect(spoken.words.map((w) => [w.text, w.start])).toEqual([
      ["one", 0],
      ["two", 0.4],
      ["three", 1.5],
      ["four", 1.9],
    ]);
  });

  it("transcribes a recording with word times", async () => {
    const heard = await transcribe(options(), { audio: Buffer.from("fake"), name: "take.wav" });
    expect(heard.text).toBe("hello from a recording");
    expect(heard.words[3]).toEqual({ text: "recording", start: 0.95, end: 1.6 });
  });

  it("explains problems in plain words", async () => {
    const credit = speak(options(), { text: "no credit please", voiceId: "voice-calm" });
    await expect(credit).rejects.toThrow("no credit");
    await expect(speak(options(), { text: "busy now", voiceId: "voice-calm" })).rejects.toThrow(
      "busy right now",
    );
    const offline = speak(
      { key: FAKE_FISH_KEY, baseUrl: "http://127.0.0.1:9" },
      { text: "hi", voiceId: "v" },
    );
    await expect(offline).rejects.toBeInstanceOf(FishError);
    await expect(offline).rejects.toThrow("can't reach fish.audio");
  });
});
