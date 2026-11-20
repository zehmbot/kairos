// The story: a list of shots, played one after the other. This is the file to change.
// The narration never stops: every shot's `say` is the next few words of it, and each shot cuts in on its first
// word (with voices, on the voice's real words). `fx` adds effects, each with its sound (`at`: on that word).
// Reference: CLAUDE.md in this folder.

/** New characters for this film only (the Blocky cast is always there: milo, ruby, bo, nadia, theo, zee). */
export const CAST = {};

export const SETTINGS = {
  captions: { style: "words", highlight: "#ffd61f", position: 0.64 },
  focusBlur: true,
  glow: 0.35,
  vignette: 0.35,
  grain: 0.035,
};

// A short demo: "The Song".
export const SHOTS = [
  {
    place: "school",
    light: "day",
    shot: "wide",
    who: ["milo", "zee"],
    face: { milo: "happy", zee: "smug" },
    say: "In second grade, my best friend Zee",
    fx: [{ label: "zee", text: "best friend", at: "Zee" }],
  },
  {
    shot: "close",
    who: ["zee"],
    face: { zee: "suspicious" },
    pose: { zee: "point" },
    say: "told me her biggest secret",
    fx: [{ punch: true, at: "secret" }],
  },
  {
    shot: "close",
    who: ["milo"],
    face: { milo: "shocked" },
    say: "and made me *swear* to forget it.",
    fx: [{ sweat: "milo" }],
  },
  {
    shot: "medium",
    who: ["milo"],
    face: { milo: "grin" },
    pose: { milo: "talk" },
    say: "Instead, I turned it into a song",
    fx: [{ notes: "milo", at: "song" }],
  },
  {
    shot: "wide",
    who: ["milo", "ruby", "theo"],
    face: { milo: "laugh", ruby: "shocked", theo: "grin" },
    pose: { milo: "dance", ruby: "idle", theo: "laugh" },
    say: "and sang it in music class",
    fx: [{ notes: "milo" }, { float: "Zee's secret", at: "sang" }],
  },
  {
    shot: "xclose",
    who: ["ruby"],
    face: { ruby: "shocked" },
    say: "*three* *times.*",
    fx: [{ big: "THREE TIMES" }, { shake: true, at: "times" }],
  },
  {
    shot: "medium",
    who: ["zee"],
    face: { zee: "furious" },
    pose: { zee: "angry" },
    say: "Then Zee appeared out of nowhere,",
    fx: [{ magic: "zee", appear: true, at: "appeared" }],
  },
  {
    shot: "close",
    who: ["zee"],
    face: { zee: "furious" },
    say: "and she stayed mad for a whole week.",
    fx: [{ anger: "zee" }, { label: "zee", text: "7 days", count: true, at: "week" }],
  },
  {
    place: "town",
    light: "evening",
    shot: "full",
    who: ["milo"],
    face: { milo: "sad" },
    pose: { milo: "walk" },
    say: "I said sorry every single day,",
    fx: [{ float: "Sorry!", at: "sorry" }],
  },
  {
    shot: "medium",
    who: ["milo", "zee"],
    face: { milo: "embarrassed", zee: "laugh" },
    pose: { zee: "laugh" },
    say: "until she finally laughed",
    fx: [{ jump: "zee", at: "laughed" }],
  },
  {
    shot: "medium",
    who: ["milo", "zee"],
    face: { milo: "laugh", zee: "happy" },
    pose: { milo: "cheer", zee: "cheer" },
    say: "and now it's *our* song.",
    fx: [{ hearts: "zee" }, { confetti: true, at: "song" }],
  },
];
