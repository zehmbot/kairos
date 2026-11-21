// The story: a list of shots, played one after the other. This is the file to change.
// The narration never stops: every shot's `say` is the next few words of it, and each shot cuts in on its first
// word (with voices, on the voice's real words). `fx` adds effects, each with its sound (`at`: on that word).
// People move (`go`), act (`act`: punch, pickUp, throw, drop) and things fall by physics (`THINGS`).
// Reference: CLAUDE.md in this folder.

/** New characters for this film only (the Blocky cast is always there: milo, ruby, bo, nadia, theo, zee). */
export const CAST = {};

/**
 * Things that move by physics: which prop, in which place, where (x, z; `y` to put it higher), `stack` to pile
 * several, `turn` (radians). They fall, tumble, get pushed, picked up and thrown.
 */
export const THINGS = {
  boxes: { prop: "box", place: "home", at: { x: 7.9, z: -5.3 }, stack: 3, turn: 0.3 },
  pillow: { prop: "pillow", place: "home", at: { x: -8.4, z: -0.4 }, turn: 0.5 },
};

export const SETTINGS = {
  captions: { style: "words", highlight: "#ffd61f", position: 0.7 },
  focusBlur: true,
  glow: 0.3,
  vignette: 0.3,
  grain: 0.025,
};

// The test scene: a run through the door, a jump over the table, a punch and a fall, a pillow thrown back.
export const SHOTS = [
  {
    place: "home",
    light: "evening",
    shot: "wide",
    who: ["milo", "theo"],
    at: { theo: "sofaL" },
    pose: { theo: "sit" },
    face: { milo: "grin", theo: "sleepy" },
    go: { milo: { from: "door", to: "tableR", pace: "run" } },
    say: "Milo burst in through the door,",
  },
  {
    shot: "full",
    who: ["milo", "theo"],
    face: { milo: "laugh", theo: "sleepy" },
    go: { milo: { to: "tableL", pace: "sprint", over: "coffee table" } },
    say: "*leapt* over the coffee table,",
  },
  {
    shot: "medium",
    who: ["theo", "milo"],
    pose: { theo: "idle" },
    face: { theo: "furious", milo: "shocked" },
    go: { theo: "milo" },
    say: "and woke up his big brother, Theo.",
  },
  {
    shot: "medium",
    who: ["theo", "milo"],
    face: { theo: "furious", milo: "scared" },
    act: { theo: { punch: "milo", at: "all.", hard: true } },
    say: "Theo was not amused at *all.*",
  },
  {
    shot: "full",
    who: ["milo", "theo"],
    face: { milo: "dizzy", theo: "angry" },
    say: "Milo saw stars, and slowly got back up.",
  },
  {
    shot: "full",
    who: ["milo", "theo"],
    face: { milo: "tired", theo: "smug" },
    go: { milo: "pillow" },
    act: { milo: { pickUp: "pillow" } },
    say: "Then he grabbed a pillow,",
  },
  {
    shot: "medium",
    who: ["milo", "theo"],
    face: { milo: "angry", theo: "shocked" },
    act: { milo: { throw: "theo", at: "brother." } },
    say: "and threw it right at his *brother.*",
  },
];
