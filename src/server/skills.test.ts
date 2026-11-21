import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SKILL_NAME_PATTERN } from "../shared/types.ts";
import {
  claudeSkillsDir,
  MARKER_FILE,
  parseFrontmatter,
  SKILL_FILE,
  SkillError,
  Skills,
} from "./skills.ts";

let root: string;
let dirs: { builtinDir: string; userDir: string; claudeDir: string };
let skills: Skills;

async function writeSkill(dir: string, name: string, description: string, body = "Do the thing.") {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(
    join(dir, name, SKILL_FILE),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
  );
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const stateOf = async (name: string) =>
  (await skills.list()).find((skill) => skill.name === name)?.state;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-skills-"));
  dirs = {
    builtinDir: join(root, "builtin"),
    userDir: join(root, "kairos-home", "skills"),
    claudeDir: join(root, "claude", "skills"),
  };
  await writeSkill(dirs.builtinDir, "kairos-a", "First skill.");
  await writeSkill(dirs.builtinDir, "kairos-b", "Second skill.");
  await writeFile(join(dirs.builtinDir, "kairos-a", "more.md"), "Details.");
  skills = new Skills(dirs);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("reads plain, quoted and block values", () => {
    expect(parseFrontmatter("---\nname: a\ndescription: Use it: often.\n---\nBody")).toEqual({
      name: "a",
      description: "Use it: often.",
    });
    expect(
      parseFrontmatter('---\r\nname: "b"\r\ndescription: "Say \\"hi\\""\r\n---\r\n').description,
    ).toBe('Say "hi"');
    expect(
      parseFrontmatter("---\nname: c\ndescription: >\n  Line one\n  line two\nother: x\n---")
        .description,
    ).toBe("Line one line two");
    expect(parseFrontmatter("---\ndescription: 'It''s fine'\n---").description).toBe("It's fine");
  });

  it("returns nothing without frontmatter", () => {
    expect(parseFrontmatter("# Just a title")).toEqual({});
    expect(parseFrontmatter("---\nname: open\nno end")).toEqual({});
  });
});

describe("Skills", () => {
  it("lists Kairos skills and the user's own", async () => {
    await writeSkill(dirs.userDir, "my-style", "My style.");
    expect(await skills.list()).toEqual([
      expect.objectContaining({
        name: "kairos-a",
        description: "First skill.",
        source: "kairos",
        state: "off",
      }),
      expect.objectContaining({ name: "kairos-b", source: "kairos", state: "off" }),
      expect.objectContaining({ name: "my-style", source: "yours", state: "off" }),
    ]);
  });

  it("turns a skill on and off in Claude's folder", async () => {
    await skills.turnOn("kairos-a");
    const copy = join(dirs.claudeDir, "kairos-a");
    expect((await readdir(copy)).sort()).toEqual([MARKER_FILE, SKILL_FILE, "more.md"].sort());
    expect(await stateOf("kairos-a")).toBe("on");
    // No temporary folders left behind next to the skills folder.
    expect(await readdir(join(root, "claude"))).toEqual(["skills"]);

    await skills.turnOff("kairos-a");
    expect(await exists(copy)).toBe(false);
    expect(await stateOf("kairos-a")).toBe("off");
  });

  it("never touches a skill it didn't add", async () => {
    const theirs = join(dirs.claudeDir, "kairos-b");
    await mkdir(theirs, { recursive: true });
    await writeFile(join(theirs, SKILL_FILE), "someone else's");
    expect(await stateOf("kairos-b")).toBe("taken");
    await expect(skills.turnOn("kairos-b")).rejects.toThrow(SkillError);
    await expect(skills.turnOff("kairos-b")).rejects.toThrow(SkillError);
    expect(await readFile(join(theirs, SKILL_FILE), "utf8")).toBe("someone else's");
    expect(await skills.turnOnDefaults()).toEqual(["kairos-a"]);
  });

  it("offers an update when the skill changes, and refreshes untouched copies", async () => {
    await skills.turnOn("kairos-a");
    await writeFile(join(dirs.builtinDir, "kairos-a", "more.md"), "New details.");
    expect(await stateOf("kairos-a")).toBe("update");
    expect(await skills.refresh()).toEqual(["kairos-a"]);
    expect(await readFile(join(dirs.claudeDir, "kairos-a", "more.md"), "utf8")).toBe(
      "New details.",
    );
    expect(await stateOf("kairos-a")).toBe("on");
  });

  it("removes its untouched copy of a skill it no longer ships, and nothing else", async () => {
    await writeSkill(dirs.builtinDir, "kairos-old", "An old guide that Kairos stops shipping.");
    await writeSkill(dirs.builtinDir, "kairos-edited", "Another old guide, edited by the user.");
    await skills.turnOn("kairos-a");
    await skills.turnOn("kairos-old");
    await skills.turnOn("kairos-edited");
    await writeFile(join(dirs.claudeDir, "kairos-edited", "mine.md"), "My notes.");
    // A folder Kairos didn't put there, with the same kind of name.
    await writeSkill(dirs.claudeDir, "kairos-theirs", "Someone else's skill.");
    await rm(join(dirs.builtinDir, "kairos-old"), { recursive: true });
    await rm(join(dirs.builtinDir, "kairos-edited"), { recursive: true });

    expect(await skills.retire()).toEqual(["kairos-old"]);
    expect(await exists(join(dirs.claudeDir, "kairos-old"))).toBe(false);
    expect(await exists(join(dirs.claudeDir, "kairos-edited", "mine.md"))).toBe(true);
    expect(await exists(join(dirs.claudeDir, "kairos-theirs", SKILL_FILE))).toBe(true);
    expect(await stateOf("kairos-a")).toBe("on");
    expect(await skills.retire()).toEqual([]);
  });

  it("leaves a copy the user edited, until they press Update", async () => {
    await skills.turnOn("kairos-a");
    await writeFile(join(dirs.claudeDir, "kairos-a", "more.md"), "My edit.");
    await writeFile(join(dirs.builtinDir, "kairos-a", "more.md"), "New details.");
    expect(await skills.refresh()).toEqual([]);
    expect(await stateOf("kairos-a")).toBe("update");
    await skills.turnOn("kairos-a");
    expect(await readFile(join(dirs.claudeDir, "kairos-a", "more.md"), "utf8")).toBe(
      "New details.",
    );
  });

  it("adds a skill folder and turns it on", async () => {
    const picked = join(root, "Downloads", "Cool Skill");
    await writeSkill(join(root, "Downloads"), "Cool Skill", "Cool things.");
    await writeFile(
      join(picked, SKILL_FILE),
      "---\nname: cool-skill\ndescription: Cool things.\n---\nBody",
    );
    await mkdir(join(picked, ".git"));
    await writeFile(join(picked, ".git", "HEAD"), "ref");

    expect(await skills.addFolder(picked)).toBe("cool-skill");
    expect(await exists(join(dirs.userDir, "cool-skill", ".git"))).toBe(false);
    expect(await stateOf("cool-skill")).toBe("on");
    await expect(skills.addFolder(picked)).rejects.toThrow("already have a skill");
  });

  it("refuses folders that aren't skills, bad names and Kairos names", async () => {
    await mkdir(join(root, "empty"));
    await expect(skills.addFolder(join(root, "empty"))).rejects.toThrow("no SKILL.md");
    await writeSkill(root, "Bad Name!", "x");
    await expect(skills.addFolder(join(root, "Bad Name!"))).rejects.toThrow("small letters");
    await writeSkill(join(root, "copy"), "kairos-a", "x");
    await expect(skills.addFolder(join(root, "copy", "kairos-a"))).rejects.toThrow(
      "Kairos has its own",
    );
  });

  it("writes a new skill, and deletes the user's own only", async () => {
    await skills.create({
      name: "my-voice",
      description: 'Use when writing: "short" lines.',
      instructions: "Keep it short.",
    });
    const text = await readFile(join(dirs.userDir, "my-voice", SKILL_FILE), "utf8");
    expect(parseFrontmatter(text)).toEqual({
      name: "my-voice",
      description: 'Use when writing: "short" lines.',
    });
    expect(await stateOf("my-voice")).toBe("on");

    await skills.remove("my-voice");
    expect(await exists(join(dirs.userDir, "my-voice"))).toBe(false);
    expect(await exists(join(dirs.claudeDir, "my-voice"))).toBe(false);
    await expect(skills.remove("kairos-a")).rejects.toThrow("turned off, not deleted");
  });

  it("finds Claude's folder, or the one KAIROS_CLAUDE_DIR names", () => {
    expect(claudeSkillsDir({}, "/home/me")).toBe(join("/home/me", ".claude", "skills"));
    expect(claudeSkillsDir({ KAIROS_CLAUDE_DIR: "/tmp/c" }, "/home/me")).toBe(
      join("/tmp/c", "skills"),
    );
  });
});

describe("the skills Kairos ships", () => {
  const shipped = fileURLToPath(new URL("../../skills/", import.meta.url));

  it("are all valid skills", async () => {
    const names = (await readdir(shipped, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(names.sort()).toEqual([
      "kairos",
      "kairos-3d",
      "kairos-blocky-cinema",
      "kairos-blocky-story",
      "kairos-camera",
      "kairos-captions",
      "kairos-directing",
    ]);
    for (const name of names) {
      const text = await readFile(join(shipped, name, SKILL_FILE), "utf8");
      const { name: declared, description } = parseFrontmatter(text);
      expect(declared, name).toBe(name);
      expect(SKILL_NAME_PATTERN.test(name)).toBe(true);
      expect(description?.length, name).toBeGreaterThan(40);
      expect(description?.length, name).toBeLessThan(1024);
      expect(text.split("\n").length, name).toBeLessThan(500);
    }
    const list = await new Skills({
      builtinDir: shipped,
      userDir: join(root, "u"),
      claudeDir: join(root, "c"),
    }).list();
    expect(list.every((skill) => skill.state === "off" && skill.description)).toBe(true);
  });
});
