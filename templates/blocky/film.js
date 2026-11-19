// A Blocky film. The story lives in story.js; the engine in blocky/ turns it into frames.
import { createEngine } from "./blocky/engine.js";
import * as story from "./story.js";

// The film's size, from kairos.json (filled in when the film was made).
const WIDTH = Number("{{width}}");
const HEIGHT = Number("{{height}}");

const engine = createEngine({ width: WIDTH, height: HEIGHT, story });

// Kairos waits for this (the caption font) before taking pictures.
window.READY = engine.ready;
window.renderOut = (t) => engine.render(t);
// Each place in the story shows as a scene on the Kairos timeline.
window.KAIROS_SCENES = engine.scenes;
