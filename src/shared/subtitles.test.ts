import { describe, expect, it } from "vitest";
import {
  cueLines,
  srtTime,
  subtitleCues,
  type TimedWord,
  timelineWords,
  toSrt,
} from "./subtitles.ts";

/** Words spoken one after another, `step` seconds each, from `start`. */
function spoken(text: string, start = 0, step = 0.3): TimedWord[] {
  return text.split(" ").map((word, i) => ({
    text: word,
    start: start + i * step,
    end: start + (i + 1) * step - 0.02,
  }));
}

describe("subtitles", () => {
  it("puts the voice clips' words on the film's clock, without what a trim cuts off", () => {
    const words = {
      "voice/narrator-1.mp3": spoken("Once upon a time"),
      "voice/zee-2.mp3": spoken("Hi there friend", 0.5),
      "audio/music.mp3": spoken("la la"),
      "audio/fx/pop.wav": spoken("pop"),
    } as Record<string, TimedWord[]>;
    const placed = timelineWords(
      [
        { file: "voice/narrator-1.mp3", start: 2 },
        // Trimmed: from 0.8 s in the file, for 0.3 s ("there" only: "friend" starts at 1.1 s).
        { file: "voice/zee-2.mp3", start: 10, from: 0.8, length: 0.3 },
        { file: "audio/music.mp3", start: 0, muted: true },
        { file: "audio/fx/pop.wav", start: 1, sfx: true },
        { file: "voice/none.mp3", start: 0 },
      ],
      (file) => words[file],
    );
    expect(placed.map((w) => [w.text, Number(w.start.toFixed(2))])).toEqual([
      ["Once", 2],
      ["upon", 2.3],
      ["a", 2.6],
      ["time", 2.9],
      ["there", 10],
    ]);
  });

  it("splits a long cue into two even lines of at most 42 letters", () => {
    expect(cueLines(["A", "short", "line."])).toEqual(["A short line."]);
    const words = "The fox ran all the way to the old red barn before the sun came up".split(" ");
    const lines = cueLines(words);
    expect(lines).toHaveLength(2);
    for (const line of lines ?? []) expect(line.length).toBeLessThanOrEqual(42);
    const [a = "", b = ""] = lines ?? [];
    expect(Math.abs(a.length - b.length)).toBeLessThan(12);
    // More than two lines' worth doesn't fit in one cue.
    expect(cueLines(`${words.join(" ")} and then it went home again`.split(" "))).toBeNull();
  });

  it("makes cues of whole sentences, breaking at pauses and long ones at commas", () => {
    const words = [
      ...spoken("Zee found a ball."),
      ...spoken("It was red.", 1.2),
      // A pause of a second, then a long sentence with a comma.
      ...spoken(
        "Then everyone in the whole park came running over, laughing and shouting his name.",
        3,
      ),
    ];
    const cues = subtitleCues(words);
    expect(cues.map((cue) => cue.text.replaceAll("\n", " / "))).toEqual([
      "Zee found a ball.",
      "It was red.",
      "Then everyone in the whole / park came running over,",
      "laughing and shouting his name.",
    ]);
    // Cues never overlap and never run backwards.
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (!cue) continue;
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThanOrEqual(cues[i + 1]?.start ?? Number.POSITIVE_INFINITY);
    }
    // A cue stays up a little after its last word.
    expect(cues[0]?.end).toBeCloseTo(1.2, 5);
    expect(cues[3]?.end).toBeCloseTo((words.at(-1)?.end ?? 0) + 0.3, 5);
  });

  it("cuts a long sentence where it balances, at a comma or a joining word, never leaving a word alone", () => {
    const cues = (text: string, step: number) =>
      subtitleCues(spoken(text, 0, step)).map((cue) => cue.text.replaceAll("\n", " / "));
    // Too slow for one cue (over 6 s): cut at the comma, not just before the last word.
    expect(
      cues("In class, Grandpa taught fractions, picked up his big math book and Zee gasped.", 0.5),
    ).toEqual([
      "In class, Grandpa taught fractions,",
      "picked up his big math book / and Zee gasped.",
    ]);
    // Too long for two lines: cut before "and", lines kept whole ("Grandpa Bo" stays together).
    expect(
      cues(
        "Out back, Ruby ran past Grandpa Bo, grabbed her ball from the grass and tossed it right to Grandpa.",
        0.25,
      ),
    ).toEqual([
      "Out back, Ruby ran past Grandpa Bo,",
      "grabbed her ball from the grass / and tossed it right to Grandpa.",
    ]);
  });

  it("keeps a cue under about 6 seconds", () => {
    const slow = spoken("one two three four five six seven eight nine ten", 0, 1);
    const cues = subtitleCues(slow);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) expect(cue.end - cue.start).toBeLessThanOrEqual(6.5);
  });

  it("writes SRT", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
    expect(srtTime(83.5)).toBe("00:01:23,500");
    expect(srtTime(3723.0456)).toBe("01:02:03,046");
    expect(
      toSrt([
        { start: 0.5, end: 2, text: "Hello." },
        { start: 2, end: 4.25, text: "Two\nlines" },
      ]),
    ).toBe(
      "1\r\n00:00:00,500 --> 00:00:02,000\r\nHello.\r\n\r\n2\r\n00:00:02,000 --> 00:00:04,250\r\nTwo\r\nlines\r\n",
    );
    expect(toSrt([])).toBe("");
  });
});
