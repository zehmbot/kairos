// A Blocky film. The story lives in story.js; the engine in blocky/ turns it into frames.
import { createEngine } from "./blocky/engine.js";
import * as story from "./story.js";

// The film's size, from kairos.json (filled in when the film was made). Kairos may ask for another shape (a wide
// film going out for Shorts): the engine then frames every shot for that size.
const size = window.__kairos?.size ?? { width: Number("{{width}}"), height: Number("{{height}}") };

const engine = createEngine({ width: size.width, height: size.height, story });

// It draws itself at any size it's asked: Kairos can show it, and render it, in other shapes.
window.KAIROS_RESHAPE = true;

// Kairos waits for this (the caption font and the film's voices) before taking pictures. Then each place in the
// story shows as a scene on the Kairos timeline, Kairos knows how long the story lasts, the effects' sounds go on
// the timeline's Effects lane, and the Sheets tab lists the engine's places.
window.READY = engine.ready.then(() => {
  window.KAIROS_SCENES = engine.scenes;
  window.KAIROS_LENGTH = engine.duration;
  window.KAIROS_SOUNDS = engine.sounds;
  window.KAIROS_PLACES = engine.places;
});
window.renderOut = (t) => engine.render(t);
