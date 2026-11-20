import { describe, expect, it } from "vitest";
import {
  BREATH,
  LEAD,
  lineAt,
  linkLines,
  planShots,
} from "../../templates/blocky/blocky/timing.js";
import { voiceLinesFrom } from "../../templates/blocky/blocky/voice.js";

/** A voice line in film time, for the tests. */
const line = (id: string, text: string, start: number, end: number, speaker = "narrator") => ({
  id,
  speaker,
  text,
  said: text,
  start,
  end,
  words: [],
});

const round = (n: number) => Math.round(n * 1000) / 1000;
const times = (plan: { entries: { start: number; seconds: number }[]; duration: number }) => ({
  starts: plan.entries.map((e) => round(e.start)),
  lengths: plan.entries.map((e) => round(e.seconds)),
  duration: round(plan.duration),
});

describe("Blocky shots follow their voices", () => {
  const shots = [
    { say: "Every Sunday, Grandpa Bo", seconds: 2 },
    { say: "told the same old joke.", seconds: 2, line: "joke" },
    { say: "Made you look!", seconds: 1.5 },
  ];

  it("plays every shot's own seconds without voices", () => {
    expect(times(planShots(shots))).toEqual({
      starts: [0, 2, 4],
      lengths: [2, 2, 1.5],
      duration: 5.5,
    });
  });

  it("starts spoken shots just before their lines, and a long line stretches its shot", () => {
    const lines = [
      line("a", "Every Sunday, Grandpa Bo", 0, 1.6),
      line("joke", "told the same old joke", 2.5, 4.4),
      line("c", "*Made* you look", 5, 7.6, "bo"),
    ];
    const plan = planShots(shots, lines);
    expect(plan.entries.map((e: { line: { id: string } | null }) => e.line?.id)).toEqual([
      "a",
      "joke",
      "c",
    ]);
    expect(times(plan)).toEqual({
      starts: [0, 2.5 - LEAD, 5 - LEAD],
      lengths: [2.5 - LEAD, 2.5, round(7.6 + BREATH - (5 - LEAD))],
      duration: round(7.6 + BREATH),
    });
  });

  it("moves a shot with its line, and silent shots share the time until the next voice", () => {
    const story = [
      { say: "Hello", seconds: 1 },
      { seconds: 1 },
      { seconds: 1 },
      { say: "Goodbye", seconds: 1 },
    ];
    // Plenty of time: the silent shots keep their length, the last one holds until the voice.
    const far = planShots(story, [line("h", "hello", 0, 0.8), line("g", "goodbye", 6, 7)]);
    expect(times(far).starts).toEqual([0, 1.05, 2.05, 6 - LEAD]);
    // Little time: they shrink.
    const near = planShots(story, [line("h", "hello", 0, 0.8), line("g", "goodbye", 2, 3)]);
    expect(times(near).starts[3]).toBe(round(2 - LEAD));
    expect(near.entries[1]?.seconds).toBeLessThan(1);
    expect(near.entries[1]?.seconds).toBeGreaterThanOrEqual(0.3);
  });

  it("links by line key first, then by words, in time order", () => {
    const lines = [line("x", "hi there", 0, 1), line("y", "Hi there!", 2, 3)];
    expect(linkLines([{ say: "Hi *there*" }, { say: "Hi there", line: "x" }], lines)).toEqual([
      null,
      lines[0],
    ]);
    expect(linkLines([{ say: "Hi there" }, { say: "Hi there" }], lines).map((l) => l?.id)).toEqual([
      "x",
      "y",
    ]);
  });

  it("finds the line being said, and keeps it a moment after", () => {
    const lines = [line("a", "one", 1, 2), line("b", "two", 3, 4)];
    expect(lineAt(lines, 0.5)).toBeNull();
    expect(lineAt(lines, 1.5)?.id).toBe("a");
    expect(lineAt(lines, 2.2)).toBeNull();
    expect(lineAt(lines, 2.2, 0.3)?.id).toBe("a");
  });
});

describe("Blocky reads the film's voices", () => {
  const made = [
    {
      id: "v1",
      file: "voice/narrator-1.mp3",
      text: "Once upon a time",
      duration: 2,
      words: [
        { text: "Once", start: 0.1, end: 0.4 },
        { text: "upon", start: 0.5, end: 0.8 },
        { text: "a", start: 0.9, end: 1 },
        { text: "time", start: 1.2, end: 1.8 },
      ],
    },
    { id: "v2", file: "voice/ruby-1.mp3", text: "Wait", duration: 1, words: [] },
  ];
  const script = {
    lines: [
      { id: "s1", speaker: "narrator", text: "Once upon a time", start: 3, line: "v1" },
      { id: "s2", speaker: "ruby", text: "Wait", start: 0, line: "v2" },
      { id: "s3", speaker: "ruby", text: "Not made", start: 5 },
    ],
  };

  it("places each line where its clip is, with the words that play", () => {
    const config = {
      audio: [{ file: "voice/narrator-1.mp3", start: 3, from: 0.45, length: 1 }],
    };
    expect(voiceLinesFrom(config, script, made)).toEqual([
      {
        id: "s1",
        speaker: "narrator",
        text: "Once upon a time",
        said: "Once upon a time",
        start: 3,
        end: 4,
        words: [
          { text: "upon", start: 3.05, end: 3.35 },
          { text: "a", start: 3.45, end: 3.55 },
          { text: "time", start: 3.75, end: 4 },
        ],
      },
    ]);
  });

  it("leaves out lines not on the timeline, and reads a single file name as a track", () => {
    expect(voiceLinesFrom({ audio: "voice/ruby-1.mp3" }, script, made).map((l) => l.id)).toEqual([
      "s2",
    ]);
    expect(voiceLinesFrom({}, script, made)).toEqual([]);
  });
});
