// The story: a list of shots, played one after the other. This is the file to change.
// The film's length (kairos.json "duration") must be the sum of all `seconds`.
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

// A short demo: "The Joke".
export const SHOTS = [
  {
    place: "town",
    light: "evening",
    shot: "wide",
    who: ["bo"],
    pose: { bo: "wave" },
    face: { bo: "grin" },
    say: "Every Sunday, Grandpa Bo",
    seconds: 2.4,
  },
  {
    place: "home",
    light: "evening",
    shot: "close",
    who: ["bo"],
    face: { bo: "grin" },
    talk: "bo",
    say: "told the same old joke.",
    seconds: 2.2,
  },
  {
    shot: "medium",
    who: ["milo", "ruby"],
    pose: { milo: "sit", ruby: "sit" },
    face: { milo: "neutral", ruby: "sleepy" },
    say: "And every Sunday,",
    seconds: 1.8,
  },
  {
    shot: "close",
    who: ["ruby"],
    pose: { ruby: "sit" },
    face: { ruby: "sleepy" },
    icons: ["zzz"],
    say: "nobody laughed.",
    seconds: 1.8,
  },
  {
    place: "home",
    light: "night",
    shot: "insert",
    prop: "letter",
    whip: true,
    say: "Then one night, he left a letter.",
    seconds: 2.4,
  },
  {
    shot: "close",
    who: ["milo"],
    face: { milo: "shocked" },
    icons: ["!"],
    move: "zoom",
    say: "It said...",
    seconds: 1.6,
  },
  {
    place: "forest",
    light: "night",
    shot: "wide",
    who: ["bo"],
    pose: { bo: "wave" },
    face: { bo: "happy" },
    say: "Meet me outside.",
    seconds: 2.2,
  },
  {
    shot: "xclose",
    who: ["bo"],
    face: { bo: "laugh" },
    talk: "bo",
    icons: ["sparkle"],
    say: "*Made* *you* *look!*",
    seconds: 1.8,
  },
  {
    shot: "medium",
    who: ["ruby", "bo", "milo"],
    pose: { ruby: "laugh", bo: "laugh", milo: "cheer" },
    face: { ruby: "laugh", bo: "laugh", milo: "grin" },
    icons: [
      { icon: "heart", on: "ruby" },
      { icon: "music", on: "bo" },
    ],
    say: "We still laugh about it.",
    seconds: 1.8,
  },
];
