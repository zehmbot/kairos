import { describe, expect, it } from "vitest";
import { needsVoice, scriptLineStatus } from "./script.ts";
import type { VoiceLine } from "./types.ts";

const made: VoiceLine[] = [
  {
    id: "l1",
    speaker: "narrator",
    voiceId: "sarah",
    voiceName: "Sarah",
    text: "Once upon a time",
    speed: 1,
    model: "s1",
    file: "voice/narrator-1.mp3",
    duration: 2,
    words: [],
    createdAt: "2026-11-20T00:00:00.000Z",
  },
];
const voices = { narrator: { id: "sarah", name: "Sarah" } };
const line = { speaker: "narrator", text: "Once upon a time", line: "l1", speed: 1 };
const onTimeline = [{ file: "voice/narrator-1.mp3", start: 0, volume: 1, from: 0, muted: false }];

describe("scriptLineStatus", () => {
  it("is made when nothing changed and its clip is on the timeline", () => {
    expect(scriptLineStatus(line, made, voices, onTimeline)).toBe("made");
  });

  it("is out of date when the words, the voice or the speed changed", () => {
    expect(scriptLineStatus({ ...line, text: "Once" }, made, voices)).toBe("changed");
    expect(scriptLineStatus(line, made, { narrator: { id: "adam", name: "Adam" } })).toBe(
      "changed",
    );
    expect(scriptLineStatus({ ...line, speed: 1.2 }, made, voices)).toBe("changed");
    expect(needsVoice("changed")).toBe(true);
  });

  it("tells a made line that isn't on the timeline, when it knows the timeline", () => {
    expect(scriptLineStatus(line, made, voices, [])).toBe("off");
    expect(scriptLineStatus(line, made, voices)).toBe("made");
    expect(needsVoice("off")).toBe(false);
  });

  it("knows lines never made, and speakers without a voice", () => {
    expect(scriptLineStatus({ ...line, line: undefined }, made, voices)).toBe("new");
    expect(scriptLineStatus({ ...line, speaker: "ruby" }, made, voices)).toBe("no-voice");
  });
});
