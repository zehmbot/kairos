import { describe, expect, it } from "vitest";
import { voiceLinesFrom } from "../../templates/blocky-cinema/blocky/voice.js";

describe("Blocky Cinema reads the film's voices", () => {
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

describe("Blocky Cinema sizes", () => {
  it("sizes a built object to its real size, at the figure's scale", async () => {
    const { PROPS } = await import("../../templates/blocky-cinema/blocky/props.js");
    const { fitSize, longestSide, meters, UNITS_PER_METER, sizeWords } = await import(
      "../../templates/blocky-cinema/blocky/sizes.js"
    );
    // The mouse is built about 2 units long; it becomes 11 cm of a 1.8 m figure 5.3 units tall.
    const mouse = PROPS.mouse();
    expect(longestSide(mouse)).toBeGreaterThan(1.5);
    fitSize(mouse, 0.11);
    expect(longestSide(mouse)).toBeCloseTo(meters(0.11), 5);
    expect(UNITS_PER_METER).toBeCloseTo(5.3 / 1.8, 5);
    expect(sizeWords(0.11)).toBe("11 cm");
    expect(sizeWords(2.1)).toBe("2.1 m");
  });
});
