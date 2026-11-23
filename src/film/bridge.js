/**
 * Kairos film bridge.
 *
 * The Kairos film server adds this script to every film page, so films never include it themselves.
 * It lets the Kairos player (the parent page) draw any frame with `window.renderOut(t)` and tells it
 * about errors. It only listens to the parent page, and only when that page is Kairos.
 * Message shapes: src/shared/film-protocol.ts.
 */
(() => {
  const script = document.currentScript;
  const parents = (script?.dataset.parents ?? "").split(" ").filter(Boolean);
  /** Origin of the Kairos page we talk to; known after its first message. */
  let parentOrigin = "";
  /** Messages sent before the player said hello (load errors, mostly). */
  const outbox = [];

  function post(message) {
    const data = { kairos: 1, ...message };
    if (parentOrigin) window.parent.postMessage(data, parentOrigin);
    else if (outbox.length < 20) outbox.push(data);
  }

  /** "http://127.0.0.1:7342/my-intro/film.js" -> "film.js" */
  function shortSource(url) {
    if (!url) return undefined;
    try {
      const path = new URL(url, location.href).pathname.split("/").slice(2).join("/");
      return decodeURIComponent(path) || undefined;
    } catch {
      return undefined;
    }
  }

  function describe(error) {
    if (error instanceof Error) {
      const where = /(https?:\/\/[^\s)]+):(\d+):\d+/.exec(error.stack ?? "");
      const at = where ? ` (${shortSource(where[1])}:${where[2]})` : "";
      return `${error.name}: ${error.message}${at}`;
    }
    return String(error);
  }

  // Script errors, plus files that fail to load (capture phase: those events don't bubble).
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target && target !== window && target instanceof Element) {
        const url = target.getAttribute("src") ?? target.getAttribute("href") ?? "";
        post({ type: "error", message: `Could not load "${url}".` });
        return;
      }
      post({
        type: "error",
        message: event.message || "Unknown error",
        source: shortSource(event.filename),
        line: event.lineno || undefined,
      });
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    post({ type: "error", message: describe(event.reason) });
  });

  const loaded = new Promise((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  });

  // The film is ready once the page has loaded, window.READY (if any) has settled, and fonts are in.
  const ready = loaded.then(async () => {
    const pending = window.READY;
    if (pending && typeof pending.then === "function") {
      try {
        await pending;
      } catch (error) {
        post({ type: "error", message: `window.READY failed: ${describe(error)}` });
      }
    }
    if (document.fonts) await document.fonts.ready;
  });

  function readScenes() {
    const raw = window.KAIROS_SCENES;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((scene) => scene && typeof scene.name === "string" && Number.isFinite(scene.start))
      .slice(0, 200)
      .map((scene) => ({
        name: scene.name,
        start: scene.start,
        ...(Number.isFinite(scene.end) ? { end: scene.end } : {}),
      }));
  }

  /** The film's own length (`window.KAIROS_LENGTH`), when it says (a template that times itself). */
  function readLength() {
    const length = Number(window.KAIROS_LENGTH);
    return Number.isFinite(length) && length > 0 ? { length } : {};
  }

  /** The effect sounds the film places (`window.KAIROS_SOUNDS`), when it says (Blocky). */
  function readSounds() {
    const raw = window.KAIROS_SOUNDS;
    if (!Array.isArray(raw)) return {};
    const sounds = raw
      .filter(
        (s) =>
          s && typeof s.key === "string" && typeof s.sound === "string" && Number.isFinite(s.t),
      )
      .slice(0, 2000)
      .map((s) => ({
        key: s.key.slice(0, 120),
        sound: s.sound.slice(0, 40),
        t: Math.max(0, s.t),
        ...(Number.isFinite(s.volume) ? { volume: Math.min(2, Math.max(0, s.volume)) } : {}),
      }));
    return { sounds };
  }

  /**
   * What Kairos asks of this showing, in the page's address (src/shared/export.ts): another size
   * (`kairos-size=1080x1920`, for a film that reframes itself) and no captions (`kairos-captions=off`).
   */
  const asked = new URLSearchParams(location.search);
  const sizeMatch = /^(\d{2,5})x(\d{2,5})$/.exec(asked.get("kairos-size") ?? "");
  const askedSize = sizeMatch
    ? Object.freeze({ width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) })
    : null;
  const askedCaptions = asked.get("kairos-captions") !== "off";

  /**
   * What the film can do for an export: draw itself at any size (`window.KAIROS_RESHAPE = true`) and give the
   * captions it shows (`window.KAIROS_CAPTIONS`, which also means it leaves them out when asked).
   */
  function readAbilities() {
    return {
      ...(window.KAIROS_RESHAPE === true ? { reshape: true } : {}),
      ...(Array.isArray(window.KAIROS_CAPTIONS) ? { captions: true } : {}),
    };
  }

  /** The places the film's engine can show (`window.KAIROS_PLACES`), when it says (Blocky). */
  function readPlaces() {
    const raw = window.KAIROS_PLACES;
    if (!Array.isArray(raw)) return {};
    const places = raw
      .filter((name) => typeof name === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(name))
      .slice(0, 60);
    return { places };
  }

  /** Draws frame `t` once the film is ready. Throws the film's own errors. */
  async function draw(t) {
    await ready;
    if (typeof window.renderOut !== "function") {
      throw new Error(
        "window.renderOut is missing. The film must define window.renderOut = (t) => {...}.",
      );
    }
    await window.renderOut(t);
  }

  async function render(id, t) {
    const started = performance.now();
    try {
      await draw(t);
      post({ type: "frame", id, t, ms: performance.now() - started });
    } catch (error) {
      post({ type: "frame", id, t, ms: performance.now() - started, error: describe(error) });
    }
  }

  // Frames are drawn one at a time, in the order they were asked for.
  let queue = Promise.resolve();

  // For Kairos' frame camera and renderer, which open the film page directly (not in the player), and for the
  // film itself: the size it is asked to draw at (null: its own) and whether to draw its captions.
  window.__kairos = Object.freeze({
    size: askedSize,
    captions: askedCaptions,
    render(t) {
      const done = queue.then(() => draw(t));
      queue = done.catch(() => undefined);
      return done;
    },
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !parents.includes(event.origin)) return;
    const message = event.data;
    if (message?.kairos !== 1) return;

    if (!parentOrigin) {
      parentOrigin = event.origin;
      for (const data of outbox.splice(0)) window.parent.postMessage(data, parentOrigin);
    }

    if (message.type === "hello") {
      ready.then(() => {
        post({
          type: "ready",
          hasRenderOut: typeof window.renderOut === "function",
          scenes: readScenes(),
          ...readLength(),
          ...readSounds(),
          ...readPlaces(),
          ...readAbilities(),
        });
      });
    } else if (message.type === "seek" && Number.isFinite(message.t)) {
      queue = queue.then(() => render(message.id, message.t));
    }
  });
})();
