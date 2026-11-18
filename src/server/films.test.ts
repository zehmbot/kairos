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
