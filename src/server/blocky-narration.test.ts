import { describe, expect, it } from "vitest";
import {
  effectSounds,
  FX_NAMES,
  FX_SOUNDS,
  FX_VOLUME,
  normalizeFx,
  planEffects,
} from "../../templates/blocky-cinema/blocky/fx.js";
import {
  effectTime,
  LEAD,
  matchShots,
  planStory,
  spokenWords,
  TAIL,
} from "../../templates/blocky-cinema/blocky/timing.js";
import { DUCK, duckExpression, duckGain, talkSpans, voiceSpans } from "../shared/duck.ts";
import { AudioTrackSchema } from "../shared/types.ts";
import { joinArgs, mixFilter } from "./ffmpeg.ts";
import { EFFECT_VOLUME, noteEffectEdits, withEffectSounds } from "./fx.ts";
import { SOUND_NAMES, SOUNDS, soundLength, soundSamples, soundWav } from "./sounds.ts";

/** A voice line with one word every 0.4 s. */
const line = (speaker: string, text: string, start: number) => {
  const words = text.split(" ").map((word, i) => ({
    text: word,
    start: start + i * 0.4,
    end: start + i * 0.4 + 0.32,
  }));
  return { speaker, start, end: words.at(-1)?.end ?? start, words };
};

describe("Blocky Cinema: the narration never stops", () => {
  const shots = [
    { say: "Every Sunday, Grandpa Bo" },
    { say: "told the same joke." },
    { beat: true, seconds: 0.5 },
    { say: "And *nobody* laughed." },
  ];

  it("cuts each shot on its first word, with no gaps", () => {
    const lines = [
      line("narrator", "Every Sunday, Grandpa Bo told the same joke.", 0.1),
      line("narrator", "And nobody laughed.", 3.5),
    ];
    const plan = planStory(shots, lines);
    const [first, second, beat, last] = plan.entries;
    expect(first?.start).toBe(0);
    expect(second?.start).toBeCloseTo(0.1 + 4 * 0.4 - LEAD, 5);
    // The beat sits right before the next spoken shot, under the voice.
    expect(beat?.start).toBeCloseTo(3.5 - LEAD - 0.5, 5);
    expect(last?.start).toBeCloseTo(3.5 - LEAD, 5);
    for (const [i, entry] of plan.entries.entries()) {
      const next = plan.entries[i + 1];
      expect(entry.start + entry.seconds).toBeCloseTo(next ? next.start : plan.duration, 5);
    }
    expect(plan.duration).toBeCloseTo(3.5 + 2 * 0.4 + 0.32 + TAIL, 3);
    // The shot's words carry its *key* marks and their speaker.
    expect(
      last?.words.map((w: { text: string; key: boolean; speaker: string }) => [
        w.text,
        w.key,
        w.speaker,
      ]),
    ).toEqual([
      ["And", false, "narrator"],
      ["nobody", true, "narrator"],
      ["laughed.", false, "narrator"],
    ]);
  });

  it("finds a shot's words a little ahead, and gives extra words to the last shot", () => {
    const stream = spokenWords([{ say: "so then every Sunday it happened again" }]);
    const ranges = matchShots([{ say: "Every Sunday" }, { say: "it happened" }], stream);
    expect(ranges).toEqual([
      [2, 4],
      [4, 7],
    ]);
  });

  it("spreads the words at a speaking rate without voices, still with no gaps", () => {
    const plan = planStory(shots, []);
    const words = plan.words;
    expect(words.length).toBe(11);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].start - words[i - 1].end).toBeLessThan(0.3);
    }
    expect(plan.duration).toBeGreaterThan(3);
  });

  it("times an effect on its word, or a moment into the shot", () => {
    const plan = planStory(
      [{ say: "and made me swear to forget it." }],
      [line("narrator", "and made me swear to forget it.", 1)],
    );
    const [entry] = plan.entries;
    if (!entry) throw new Error("no entry");
    expect(effectTime(entry, "swear")).toBeCloseTo(1 + 3 * 0.4, 5);
    expect(effectTime(entry, "nope")).toBeCloseTo(entry.start + 0.12, 5);
  });
});

describe("Blocky Cinema effects", () => {
  it("reads effects in their short and long forms", () => {
    expect(normalizeFx("notes")).toEqual({ type: "notes", value: true });
    expect(normalizeFx({ magic: "zee", appear: true, at: "appeared" })).toEqual({
      type: "magic",
      value: "zee",
      appear: true,
      at: "appeared",
    });
    expect(normalizeFx({ sparkle: true })).toBeNull();
  });

  it("gives each effect its sound, with keys that stay the same", () => {
    const shots = [
      { say: "I sang it", who: ["milo"], fx: [{ notes: "milo" }, { punch: true, at: "sang" }] },
      { say: "three times.", fx: [{ shake: true, sound: false }, { confetti: true }], whip: true },
    ];
    const events = planEffects(planStory(shots, []).entries);
    const sounds = effectSounds(events);
    expect(sounds.map((s: { sound: string }) => s.sound)).toEqual([
      "chime",
      "swish",
      "party",
      "whoosh",
    ]);
    expect(new Set(sounds.map((s: { key: string }) => s.key)).size).toBe(4);
    // All at 65%, unless an effect says.
    expect(FX_VOLUME).toBe(0.65);
    expect(EFFECT_VOLUME).toBe(0.65);
    expect(sounds.map((s: { volume: number }) => s.volume)).toEqual([0.65, 0.65, 0.65, 0.65]);
    const soft = effectSounds(
      planEffects(planStory([{ say: "hi", fx: [{ dust: true, volume: 0.3 }] }], []).entries),
    );
    expect(soft.map((s: { volume: number }) => s.volume)).toEqual([0.3]);
    expect(effectSounds(planEffects(planStory(shots, []).entries))).toEqual(sounds);
    // Every effect's sound is one Kairos makes.
    expect([...FX_SOUNDS].sort()).toEqual([...SOUND_NAMES].sort());
    expect(FX_NAMES).toContain("magic");
  });
});

describe("Kairos' sound effects", () => {
  it("makes every sound, the same each time, never clipping", () => {
    for (const { name } of SOUNDS) {
      const wav = soundWav(name);
      expect(wav.subarray(0, 4).toString()).toBe("RIFF");
      expect(soundWav(name).equals(wav)).toBe(true);
      let peak = 0;
      for (const value of soundSamples(name)) peak = Math.max(peak, Math.abs(value));
      expect(peak).toBeCloseTo(0.8, 2);
      expect(soundLength(name)).toBeGreaterThan(0.1);
      expect(soundLength(name)).toBeLessThan(1.5);
    }
  });
});

describe("effect sounds on the timeline", () => {
  const track = (file: string, start: number, extra: object = {}) =>
    AudioTrackSchema.parse({ file, start, ...extra });
  const fileOf = (name: string) => `audio/fx/${name}.wav`;

  it("adds new ones, moves and removes the film's, and leaves yours alone", () => {
    const tracks = [
      track("voice/narrator-1.mp3", 0, { lane: 0 }),
      track("audio/fx/pop.wav", 1, { lane: 1, sfx: true, key: "a-pop" }),
      track("audio/fx/thud.wav", 2, { lane: 1, sfx: true, key: "b-shake", moved: true }),
      track("audio/fx/boing.wav", 3, { lane: 1, sfx: true, key: "gone" }),
      track("audio/fx/ding.wav", 4, { lane: 1, sfx: true }),
    ];
    const next = withEffectSounds(
      tracks,
      [
        { key: "a-pop", sound: "pop", t: 1.5, volume: 0.6 },
        { key: "b-shake", sound: "thud", t: 9, volume: 0.7 },
        { key: "new", sound: "whoosh", t: 5, volume: 0.6 },
        { key: "deleted", sound: "ding", t: 6, volume: 0.6 },
        { key: "odd", sound: "nope", t: 7, volume: 0.6 },
      ],
      ["deleted"],
      fileOf,
    );
    expect(next.map((t) => [t.file, t.start, t.key ?? null])).toEqual([
      ["voice/narrator-1.mp3", 0, null],
      ["audio/fx/pop.wav", 1.5, "a-pop"],
      // You moved it: it keeps its place.
      ["audio/fx/thud.wav", 2, "b-shake"],
      // Yours (no key): never touched.
      ["audio/fx/ding.wav", 4, null],
      ["audio/fx/whoosh.wav", 5, "new"],
    ]);
    expect(next.at(-1)).toMatchObject({ sfx: true, lane: 1 });
  });

  it("notes the sounds you moved and deleted", () => {
    const before = [
      track("audio/fx/pop.wav", 1, { sfx: true, key: "a" }),
      track("audio/fx/thud.wav", 2, { sfx: true, key: "b" }),
    ];
    const after = [track("audio/fx/pop.wav", 1.6, { sfx: true, key: "a" })];
    const { tracks, removed } = noteEffectEdits(before, after);
    expect(tracks[0]).toMatchObject({ start: 1.6, moved: true });
    expect(tracks[0]?.tuned).toBeUndefined();
    expect(removed).toEqual(["b"]);
  });

  it("keeps a volume you set, and follows the film's otherwise", () => {
    const before = [
      track("audio/fx/pop.wav", 1, { sfx: true, key: "a", volume: 0.6 }),
      track("audio/fx/thud.wav", 2, { sfx: true, key: "b", volume: 0.6 }),
    ];
    const { tracks } = noteEffectEdits(before, [
      before[0] as never,
      { ...before[1], volume: 1.2 } as never,
    ]);
    expect(tracks[1]).toMatchObject({ volume: 1.2, tuned: true });
    expect(tracks[1]?.moved).toBeUndefined();
    const next = withEffectSounds(
      tracks,
      [
        { key: "a", sound: "pop", t: 1, volume: 0.65 },
        { key: "b", sound: "thud", t: 2, volume: 0.65 },
      ],
      [],
      fileOf,
    );
    expect(next.map((t) => t.volume)).toEqual([0.65, 1.2]);
  });
});

describe("music under the voice", () => {
  it("is quieter while voices talk, with ramps, the same in preview and render", () => {
    const spans = talkSpans(
      voiceSpans(
        [
          AudioTrackSchema.parse({ file: "voice/a.mp3", start: 1, length: 2 }),
          AudioTrackSchema.parse({ file: "voice/b.mp3", start: 3.3 }),
          AudioTrackSchema.parse({ file: "voice/c.mp3", start: 10, length: 1, muted: true }),
          AudioTrackSchema.parse({ file: "audio/music.mp3", start: 0 }),
        ],
        [{ file: "voice/b.mp3", duration: 1.5 }],
      ),
    );
    // The two lines are 0.3 s apart: one stretch. The muted one doesn't count.
    expect(spans).toEqual([[1, 4.8]]);
    expect(duckGain(spans, 0)).toBe(1);
    expect(duckGain(spans, 2)).toBeCloseTo(DUCK.level, 5);
    expect(duckGain(spans, 1 - DUCK.ramp / 2)).toBeCloseTo((1 + DUCK.level) / 2, 5);
    expect(duckGain(spans, 6)).toBe(1);
    expect(duckExpression(spans)).toBe("1-0.7*clip(min((t-0.75)/0.25,(5.05-t)/0.25),0,1)");
    expect(duckExpression([])).toBe("1");
  });

  it("loops and ducks in the render's mix", () => {
    const tracks = [
      { path: "voice.mp3", start: 1, volume: 1 },
      { path: "music.mp3", start: 0, volume: 0.4, loop: true, duck: "1-0.7*t" },
    ];
    const filter = mixFilter(tracks, 12);
    expect(filter).toContain("[2:a]aresample=48000,volume=0.4,volume='1-0.7*t':eval=frame[a1]");
    const args = joinArgs("list.txt", "out.mp4", { tracks, duration: 12 });
    const music = args.indexOf("music.mp3");
    // The looping input stops at the film's length, so the join always ends.
    expect(args.slice(music - 5, music + 1)).toEqual([
      "-stream_loop",
      "-1",
      "-t",
      "12",
      "-i",
      "music.mp3",
    ]);
  });
});
