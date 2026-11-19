import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeFilm, createFilm, FilmConfigError, readFilm, scanFilms, slugify } from "./films.ts";

const templateDir = fileURLToPath(new URL("../../templates/starter/", import.meta.url));

let filmsDir: string;

beforeEach(async () => {
  filmsDir = await mkdtemp(join(tmpdir(), "kairos-films-"));
});

afterEach(async () => {
  await rm(filmsDir, { recursive: true, force: true });
});

async function makeFilm(id: string, config: unknown, page = "index.html") {
  const dir = join(filmsDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "kairos.json"),
    typeof config === "string" ? config : JSON.stringify(config),
  );
  await writeFile(join(dir, page), "<!doctype html><title>x</title>");
}

describe("slugify", () => {
  it("makes tidy folder names", () => {
    expect(slugify("My Intro!")).toBe("my-intro");
    expect(slugify("  Café   Night  ")).toBe("cafe-night");
    expect(slugify("我的电影")).toBe("我的电影");
    expect(slugify("!!!")).toBe("film");
    expect(slugify("x".repeat(100))).toHaveLength(60);
  });
});

describe("scanFilms", () => {
  it("finds films, flags broken ones and skips other folders", async () => {
    await makeFilm("good", { title: "Good", duration: 3 });
    await makeFilm("bad-json", "{ not json");
    await makeFilm("bad-config", { title: "", duration: -1 });
    await mkdir(join(filmsDir, "not-a-film"));
    await mkdir(join(filmsDir, ".hidden"));

    const films = await scanFilms(filmsDir);
    const byId = Object.fromEntries(films.map((film) => [film.id, film]));

    expect(Object.keys(byId).sort()).toEqual(["bad-config", "bad-json", "good"]);
    expect(byId.good?.problem).toBeNull();
    expect(byId.good?.config).toMatchObject({ title: "Good", width: 1920, height: 1080, fps: 30 });
    expect(byId["bad-json"]?.config).toBeNull();
    expect(byId["bad-json"]?.problem).toContain("not valid JSON");
    expect(byId["bad-config"]?.problem).toContain("kairos.json has a problem");
  });

  it("flags a film whose page is missing", async () => {
    await makeFilm("no-page", { title: "No page", duration: 1, page: "main.html" }, "other.html");
    const film = await readFilm(filmsDir, "no-page");
    expect(film?.problem).toContain('"main.html" is missing');
  });

  it("returns nothing for a missing folder", async () => {
    expect(await scanFilms(join(filmsDir, "nope"))).toEqual([]);
  });
});

describe("createFilm", () => {
  it("copies the starter template and fills it in", async () => {
    const id = await createFilm(filmsDir, templateDir, { title: 'Say "hi" <now>', shape: "tall" });
    expect(id).toBe("say-hi-now");

    const film = await readFilm(filmsDir, id);
    expect(film?.problem).toBeNull();
    expect(film?.config).toMatchObject({ title: 'Say "hi" <now>', width: 1080, height: 1920 });

    const dir = join(filmsDir, id);
    const html = await readFile(join(dir, "index.html"), "utf8");
    expect(html).toContain("<title>Say &quot;hi&quot; &lt;now&gt;</title>");
    expect(html).toContain('width="1080" height="1920"');
    const js = await readFile(join(dir, "film.js"), "utf8");
    expect(js).toContain('const TITLE = "Say \\"hi\\" <now>";');
    const claude = await readFile(join(dir, "CLAUDE.md"), "utf8");
    expect(claude.startsWith('# Say "hi" <now>')).toBe(true);
    await expect(readFile(join(dir, "CLAUDE.template.md"))).rejects.toThrow();
    expect(html + js + claude).not.toContain("{{");
  });

  it("numbers names that are already taken", async () => {
    const input = { title: "Intro", shape: "wide" } as const;
    expect(await createFilm(filmsDir, templateDir, input)).toBe("intro");
    expect(await createFilm(filmsDir, templateDir, input)).toBe("intro-2");
    expect(await createFilm(filmsDir, templateDir, input)).toBe("intro-3");
  });

  it("uses the size of each shape", async () => {
    const id = await createFilm(filmsDir, templateDir, { title: "Square", shape: "square" });
    expect((await readFilm(filmsDir, id))?.config).toMatchObject({ width: 1080, height: 1080 });
  });
});

describe("frame rate", () => {
  it("makes new films at the chosen rate, or 30 when none is given", async () => {
    const fast = await createFilm(filmsDir, templateDir, { title: "Fast", shape: "wide", fps: 60 });
    expect((await readFilm(filmsDir, fast))?.config?.fps).toBe(60);
    const plain = await createFilm(filmsDir, templateDir, { title: "Plain", shape: "wide" });
    expect((await readFilm(filmsDir, plain))?.config?.fps).toBe(30);
  });

  it("flags rates outside 1 to 120 in plain words", async () => {
    await makeFilm("too-fast", { title: "Too fast", duration: 5, fps: 500 });
    await makeFilm("too-slow", { title: "Too slow", duration: 5, fps: 0.5 });
    await makeFilm("ntsc", { title: "NTSC", duration: 5, fps: 29.97 });
    expect((await readFilm(filmsDir, "too-fast"))?.problem).toContain("at most 120");
    expect((await readFilm(filmsDir, "too-slow"))?.problem).toContain("at least 1");
    expect((await readFilm(filmsDir, "ntsc"))?.config?.fps).toBe(29.97);
  });
});

describe("changeFilm", () => {
  it("changes the rate and keeps everything else as it was", async () => {
    await makeFilm("intro", { title: "Intro", duration: 5, fps: 30, extra: { keep: true } });
    const dir = join(filmsDir, "intro");
    const config = await changeFilm(dir, { fps: 60 });
    expect(config.fps).toBe(60);
    const saved = JSON.parse(await readFile(join(dir, "kairos.json"), "utf8"));
    expect(saved).toEqual({ title: "Intro", duration: 5, fps: 60, extra: { keep: true } });
    expect(Object.keys(saved)).toEqual(["title", "duration", "fps", "extra"]);
  });

  it("adds the rate when kairos.json has none", async () => {
    await makeFilm("bare", { title: "Bare", duration: 5 });
    await changeFilm(join(filmsDir, "bare"), { fps: 24 });
    expect((await readFilm(filmsDir, "bare"))?.config?.fps).toBe(24);
  });

  it("never touches a broken kairos.json", async () => {
    await makeFilm("broken", "{ not json");
    await makeFilm("bad", { title: "", duration: 5 });
    await expect(changeFilm(join(filmsDir, "broken"), { fps: 60 })).rejects.toThrow(
      FilmConfigError,
    );
    await expect(changeFilm(join(filmsDir, "bad"), { fps: 60 })).rejects.toThrow(FilmConfigError);
    expect(await readFile(join(filmsDir, "broken", "kairos.json"), "utf8")).toBe("{ not json");
    expect(await readdir(join(filmsDir, "broken"))).toEqual(["index.html", "kairos.json"]);
  });
});

describe("changeFilm (other settings)", () => {
  it("changes the title, length and status", async () => {
    await makeFilm("intro", { title: "Intro", duration: 5 });
    const config = await changeFilm(join(filmsDir, "intro"), {
      title: "New intro",
      duration: 12.5,
      status: "review",
    });
    expect(config).toMatchObject({ title: "New intro", duration: 12.5, status: "review" });
  });
});

describe("sound", () => {
  it("reads one file or a list of tracks, always as a list", async () => {
    await makeFilm("one", { title: "One", duration: 5, audio: "music.mp3" });
    await writeFile(join(filmsDir, "one", "music.mp3"), "mp3");
    expect((await readFilm(filmsDir, "one"))?.config?.audio).toEqual([
      { file: "music.mp3", start: 0, volume: 1, from: 0, muted: false },
    ]);

    await makeFilm("two", {
      title: "Two",
      duration: 5,
      audio: [
        { file: "a.wav", volume: 0.5 },
        { file: "b.wav", start: 1.2 },
      ],
    });
    await writeFile(join(filmsDir, "two", "a.wav"), "wav");
    await writeFile(join(filmsDir, "two", "b.wav"), "wav");
    const film = await readFilm(filmsDir, "two");
    expect(film?.problem).toBeNull();
    expect(film?.config?.audio).toEqual([
      { file: "a.wav", start: 0, volume: 0.5, from: 0, muted: false },
      { file: "b.wav", start: 1.2, volume: 1, from: 0, muted: false },
    ]);

    await makeFilm("none", { title: "None", duration: 5 });
    expect((await readFilm(filmsDir, "none"))?.config?.audio).toEqual([]);
  });

  it("explains missing, outside and too loud sound", async () => {
    await makeFilm("missing", { title: "M", duration: 5, audio: [{ file: "audio/voice.wav" }] });
    expect((await readFilm(filmsDir, "missing"))?.problem).toBe(
      'The audio file "audio/voice.wav" is missing.',
    );
    await makeFilm("outside", { title: "O", duration: 5, audio: "../secret.wav" });
    expect((await readFilm(filmsDir, "outside"))?.problem).toContain(
      "must be inside the film folder",
    );
    await makeFilm("loud", { title: "L", duration: 5, audio: [{ file: "a.wav", volume: 3 }] });
    expect((await readFilm(filmsDir, "loud"))?.problem).toContain("volume goes from 0 to 2");
  });

  it("doesn't write an empty sound list into new films", async () => {
    const id = await createFilm(filmsDir, templateDir, { title: "Quiet", shape: "wide" });
    const saved = JSON.parse(await readFile(join(filmsDir, id, "kairos.json"), "utf8"));
    expect(saved.audio).toBeUndefined();
  });
});
