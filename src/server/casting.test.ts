import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { VoiceType } from "../shared/types.ts";
import { castVoices, forgetPools, isPlain, pickVoice, plainTitle } from "./casting.ts";
import { type FakeFish, startFakeFish } from "./fake-fish.ts";
import { FishError } from "./fish.ts";

let fake: FakeFish;
// The voice library is public: casting needs no key.
const options = () => ({ key: null, baseUrl: fake.url });

beforeAll(async () => {
  fake = await startFakeFish();
});
afterAll(() => fake.close());
beforeEach(() => forgetPools());

/** Every voice a type can get, trying the whole range of random numbers. */
async function everyPick(type: VoiceType): Promise<string[]> {
  const names = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const voice = await pickVoice(options(), type, { random: () => i / 20 });
    if (voice) names.add(voice.name);
  }
  return [...names].sort();
}

describe("casting", () => {
  it("tells plain names from copies", () => {
    expect(plainTitle("Sarah")).toBe(true);
    expect(plainTitle("Friendly Women")).toBe(true);
    expect(plainTitle("Taylor Swift")).toBe(false);
    expect(plainTitle("Roblox")).toBe(false);
    expect(plainTitle("Rusty (Bluey)")).toBe(false);
    expect(plainTitle("Mario")).toBe(false);
    expect(plainTitle("Voice 2")).toBe(false);
  });

  it("picks plain voices of the right type, skipping copies", async () => {
    expect(await everyPick("woman")).toEqual(["Friendly Women", "Laura", "Paula", "Sarah"]);
    expect(await everyPick("man")).toEqual(["Adrian", "Ethan"]);
    expect(await everyPick("old-man")).toEqual(["Jordan"]);
    expect(await everyPick("narrator")).toEqual(["Adrian", "Ethan", "Jordan", "Sarah"]);
    const voice = await pickVoice(options(), "woman", { random: () => 0 });
    expect(voice).toEqual({
      id: "v-sarah",
      name: "Sarah",
      type: "woman",
      auto: true,
      sample: "https://example.test/v-sarah.mp3",
    });
  });

  it("falls back when a type has no plain voice: kids get a light young woman's voice", async () => {
    // No plain old woman: a warm middle-aged one.
    expect(await everyPick("old-woman")).toEqual(["Laura"]);
    // The only kid voices are copies or unknown: a bright young woman's voice.
    expect(await everyPick("girl")).toEqual(["Friendly Women", "Sarah"]);
    expect(await everyPick("boy")).toEqual(["Friendly Women", "Sarah"]);
  });

  it("casts a film: keeps voices, remembers characters, never repeats a voice", async () => {
    const result = await castVoices(
      options(),
      { narrator: { id: "v-adrian", name: "Adrian" } },
      [
        { speaker: "narrator", type: "narrator" },
        { speaker: "milo", type: "boy" },
        { speaker: "ruby", type: "girl" },
        { speaker: "mom", type: "woman" },
      ],
      { remembered: { milo: { id: "v-paula", name: "Paula" } }, random: () => 0 },
    );
    expect(result.problems).toEqual([]);
    expect(result.voices.narrator).toEqual({ id: "v-adrian", name: "Adrian", type: "narrator" });
    expect(result.voices.milo).toEqual({ id: "v-paula", name: "Paula", type: "boy" });
    // Sarah is the best-liked young voice; Ruby gets her, Mom then gets the next one.
    expect(result.voices.ruby).toMatchObject({ name: "Sarah", type: "girl", auto: true });
    expect(result.voices.mom?.name).not.toBe("Sarah");
    const ids = Object.values(result.voices).map((voice) => voice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says when no voice fits, and when fish.audio can't be reached", async () => {
    const none = await castVoices(options(), {}, [{ speaker: "anna", type: "woman" }], {
      language: "xx",
    });
    expect(none.problems[0]).toContain("No woman voice was found for anna");
    const offline = pickVoice({ key: null, baseUrl: "http://127.0.0.1:9" }, "man");
    await expect(offline).rejects.toBeInstanceOf(FishError);
  });

  it("only takes liked voices whose description agrees with their tags", () => {
    const base = {
      id: "x",
      author: null,
      languages: ["en"],
      cover: null,
      sample: "https://example.test/x.mp3",
      uses: 1000,
    };
    const voice = {
      ...base,
      name: "Grace",
      tags: ["female", "young"],
      likes: 400,
      description: "",
    };
    expect(isPlain(voice)).toBe(true);
    expect(isPlain({ ...voice, description: "A deep male voice." })).toBe(false);
    expect(isPlain({ ...voice, likes: 3 })).toBe(false);
    expect(isPlain({ ...voice, tags: ["female", "anime"] })).toBe(false);
    expect(isPlain({ ...voice, description: "grace voice" })).toBe(false);
  });
});
