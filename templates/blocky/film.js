// A Blocky film. The story lives in story.js; the engine in blocky/ turns it into frames.
import { createEngine } from "./blocky/engine.js";
import * as story from "./story.js";

// The film's size, from kairos.json (filled in when the film was made).
const WIDTH = Number("{{width}}");
const HEIGHT = Number("{{height}}");

const engine = createEngine({ width: WIDTH, height: HEIGHT, story });

// Kairos waits for this (the caption font and the film's voices) before taking pictures. Then each place in the
// story shows as a scene on the Kairos timeline, and Kairos knows how long the story lasts.
window.READY = engine.ready.then(() => {
  window.KAIROS_SCENES = engine.scenes;
  window.KAIROS_LENGTH = engine.duration;
});
window.renderOut = (t) => engine.render(t);
