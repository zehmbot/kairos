import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TemplateField } from "../shared/types.ts";
import { createFilm, readFilm } from "./films.ts";
import {
  briefMarkdown,
  checkBrief,
  findTemplate,
  listTemplates,
  makeBrief,
  readBrief,
  removeTemplate,
  saveAsTemplate,
  withTitlePlaceholders,
  writeBrief,
} from "./templates.ts";

const builtinDir = fileURLToPath(new URL("../../templates/", import.meta.url));

let root: string;

/** The value, or a clear test failure when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

let userDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-templates-"));
  userDir = join(root, "ws", "templates");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeTemplate(id: string, json: unknown) {
  await mkdir(join(userDir, id), { recursive: true });
  await writeFile(
    join(userDir, id, "template.json"),
    typeof json === "string" ? json : JSON.stringify(json),
  );
  await writeFile(join(userDir, id, "index.html"), "<p>{{title_html}}</p>");
}

const fields: TemplateField[] = [
  { id: "script", label: "Script", type: "longtext", required: true },
  { id: "mood", label: "Mood", type: "choice", required: false, options: ["calm", "funny"] },
  { id: "minutes", label: "Minutes", type: "number", required: false, min: 1, max: 10 },
];

describe("listing templates", () => {
  it("lists Kairos templates first, then the user's", async () => {
    await writeTemplate("zebra", { name: "Zebra" });
    await writeTemplate("my-style", {
      name: "My style",
      defaults: { shape: "tall", fps: 24 },
      kinds: [{ id: "story", name: "Story", fields }],
    });
    const list = await listTemplates(builtinDir, userDir);
    expect(list[0]).toMatchObject({ id: "starter", source: "kairos", problem: null });
    expect(list[0]?.kinds[0]?.fields[0]?.id).toBe("idea");
    expect(list.slice(1).map((template) => template.id)).toEqual([
      "blocky",
      "blocky-story",
      "my-style",
      "zebra",
    ]);
    expect(list[3]).toMatchObject({
      source: "yours",
      defaults: { shape: "tall", fps: 24, duration: 5 },
    });
    // A template without kinds still has one, with no questions.
    expect(list[4]?.kinds).toEqual([{ id: "default", name: "Zebra", description: "", fields: [] }]);
  });

  it("explains a broken template.json instead of using it", async () => {
    await writeTemplate("broken", "{ nope");
    await writeTemplate("bad", {
      name: "Bad",
      kinds: [{ id: "x", name: "X", fields: [{ id: "c", label: "C", type: "choice" }] }],
    });
    const broken = await findTemplate(builtinDir, userDir, "broken");
    expect(broken?.problem).toContain("can't be read");
    const bad = await findTemplate(builtinDir, userDir, "bad");
    expect(bad?.problem).toContain("A choice question needs at least one choice");
    expect(await findTemplate(builtinDir, userDir, "../starter")).toBeNull();
  });
});

describe("checking answers", () => {
  it("cleans the answers and explains what's wrong", () => {
    expect(
      checkBrief(fields, {
        script: "  Once upon a time  ",
        mood: "calm",
        minutes: "3",
        extra: "x",
      }),
    ).toEqual({
      answers: { script: "Once upon a time", mood: "calm", minutes: 3 },
      errors: {},
    });
    expect(checkBrief(fields, { mood: "angry", minutes: "20" }).errors).toEqual({
      script: "Please answer: Script",
      mood: 'Pick one of the choices for "Mood".',
      minutes: '"Minutes" can be at most 10.',
    });
    expect(checkBrief(fields, { script: "x", minutes: "lots" }).errors.minutes).toBe(
      '"Minutes" must be a number.',
    );
  });
});

describe("briefs", () => {
  it("writes the brief for Claude, question by question", async () => {
    const template = must(await findTemplate(builtinDir, userDir, "starter"));
    const kind = must(template.kinds[0]);
    const brief = makeBrief(template, kind, { idea: "A logo that flies in." });
    expect(briefMarkdown(brief, "My intro")).toBe(
      "# Brief: My intro\n\nMade with the Starter template (Anything). This is what the user asked for: build the film from it.\n\n## What should this film show?\n\nA logo that flies in.\n",
    );

    const filmsDir = join(root, "ws", "films");
    const id = await createFilm(
      filmsDir,
      template.dir,
      { title: "My intro", shape: "wide" },
      {
        brief,
        briefText: briefMarkdown(brief, "My intro"),
      },
    );
    const dir = join(filmsDir, id);
    expect((await readFilm(filmsDir, id))?.hasBrief).toBe(true);
    expect(await readFile(join(dir, "brief.md"), "utf8")).toContain("A logo that flies in.");
    // The template's own files stay in the template.
    expect(await readdir(dir)).not.toContain("template.json");

    await writeBrief(dir, { ...brief, answers: { idea: "A slower logo." } }, "My intro");
    expect((await readBrief(dir))?.answers).toEqual({ idea: "A slower logo." });
    expect(await readFile(join(dir, "brief.md"), "utf8")).toContain("A slower logo.");
  });
});

describe("saving a film as a template", () => {
  it("copies the film without Kairos data, videos or hidden files, and keeps its form", async () => {
    const filmsDir = join(root, "ws", "films");
    const starter = must(await findTemplate(builtinDir, userDir, "starter"));
    const brief = makeBrief(starter, must(starter.kinds[0]), { idea: "Rain" });
    const id = await createFilm(
      filmsDir,
      starter.dir,
      { title: "Rainy", shape: "tall", fps: 24 },
      {
        brief,
        briefText: briefMarkdown(brief, "Rainy"),
      },
    );
    const dir = join(filmsDir, id);
    await mkdir(join(dir, "renders"));
    await writeFile(join(dir, "renders", "rainy-v1.mp4"), "video");
    await mkdir(join(dir, ".git"));
    await writeFile(join(dir, ".kairos", "notes.json"), "{}");
    await mkdir(join(dir, "voice"));
    await writeFile(join(dir, "voice", "narrator-1.mp3"), "spoken");
    const film = must(await readFilm(filmsDir, id));

    const templateId = await saveAsTemplate(
      { path: dir, config: must(film.config) },
      userDir,
      { name: "Rainy look", description: "Rain on glass." },
      brief,
      Buffer.from("png"),
    );
    expect(templateId).toBe("rainy-look");
    const files = (await readdir(join(userDir, templateId))).sort();
    expect(files).toEqual([
      "CLAUDE.template.md",
      "film.js",
      "index.html",
      "preview.png",
      "template.json",
    ]);
    expect(await readFile(join(userDir, templateId, "CLAUDE.template.md"), "utf8")).toMatch(
      /^# \{\{title\}\}/,
    );

    const saved = must(await findTemplate(builtinDir, userDir, templateId));
    expect(saved).toMatchObject({
      name: "Rainy look",
      source: "yours",
      hasPreview: true,
      defaults: { shape: "tall", fps: 24, duration: 5 },
    });
    expect(saved.kinds[0]?.fields.map((field) => field.id)).toEqual(["idea"]);

    // A second one with the same name gets a number; deleting removes only the user's own.
    expect(
      await saveAsTemplate(
        { path: dir, config: must(film.config) },
        userDir,
        { name: "Rainy look", description: "" },
        null,
        null,
      ),
    ).toBe("rainy-look-2");
    expect(await removeTemplate(userDir, "rainy-look-2")).toBe(true);
    expect(await removeTemplate(userDir, "rainy-look-2")).toBe(false);
  });

  it("keeps an odd size as the template's fixed size", async () => {
    const filmsDir = join(root, "ws", "films");
    const starter = must(await findTemplate(builtinDir, userDir, "starter"));
    const id = await createFilm(
      filmsDir,
      starter.dir,
      { title: "Banner", shape: "wide" },
      {
        size: { width: 1500, height: 500 },
      },
    );
    const film = must(await readFilm(filmsDir, id));
    expect(film.config).toMatchObject({ width: 1500, height: 500 });
    const templateId = await saveAsTemplate(
      { path: film.path, config: must(film.config) },
      userDir,
      { name: "Banner", description: "" },
      null,
      null,
    );
    expect((await findTemplate(builtinDir, userDir, templateId))?.defaults.size).toEqual({
      width: 1500,
      height: 500,
    });
  });
});

describe("title placeholders", () => {
  it("puts the placeholders back only where the title is a whole string or the page title", () => {
    expect(
      withTitlePlaceholders(
        "const TITLE = \"Intro\";\nfunction drawIntro() {}\nlog('Intro');",
        "film.js",
        "Intro",
      ),
    ).toBe("const TITLE = \"{{title_js}}\";\nfunction drawIntro() {}\nlog('{{title_js}}');");
    expect(withTitlePlaceholders('const T = "Say \\"hi\\"";', "film.js", 'Say "hi"')).toBe(
      'const T = "{{title_js}}";',
    );
    expect(
      withTitlePlaceholders(
        "<title>Tom &amp; Jerry</title><h1>Tom &amp; Jerry</h1>",
        "index.html",
        "Tom & Jerry",
      ),
    ).toBe("<title>{{title_html}}</title><h1>Tom &amp; Jerry</h1>");
    expect(withTitlePlaceholders("Intro", "notes.txt", "Intro")).toBe("Intro");
  });
});
