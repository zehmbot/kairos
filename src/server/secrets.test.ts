import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyHint, parseEnv, readSecret, secretSource, writeSecret } from "./secrets.ts";

let home: string;
const NAME = "KAIROS_TEST_SECRET";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "kairos-secrets-"));
  delete process.env[NAME];
});

afterEach(async () => {
  delete process.env[NAME];
  await rm(home, { recursive: true, force: true });
});

describe("secrets", () => {
  it("reads .env lines", () => {
    const env = parseEnv("# comment\nA=1\nexport B=\"two words\"\nC='3'\nbad line\n");
    expect([...env]).toEqual([
      ["A", "1"],
      ["B", "two words"],
      ["C", "3"],
    ]);
  });

  it("saves a key next to other lines, and removes it", async () => {
    await writeFile(join(home, ".env"), "OTHER=keep me\n");
    await writeSecret(home, NAME, "sk-123456789");
    expect(await readFile(join(home, ".env"), "utf8")).toBe(
      `OTHER=keep me\n${NAME}=sk-123456789\n`,
    );
    expect(await readSecret(home, NAME)).toBe("sk-123456789");
    await writeSecret(home, NAME, "sk-new");
    expect(await readFile(join(home, ".env"), "utf8")).toBe(`OTHER=keep me\n${NAME}=sk-new\n`);
    await writeSecret(home, NAME, null);
    expect(await readFile(join(home, ".env"), "utf8")).toBe("OTHER=keep me\n");
    expect(await readSecret(home, NAME)).toBeNull();
    await expect(writeSecret(home, NAME, "a\nB=evil")).rejects.toThrow("line breaks");
  });

  it("falls back to the environment, and says where the key comes from", async () => {
    expect(await secretSource(home, NAME)).toBeNull();
    process.env[NAME] = "from-env";
    expect(await readSecret(home, NAME)).toBe("from-env");
    expect(await secretSource(home, NAME)).toBe("environment");
    await writeSecret(home, NAME, "from-settings");
    expect(await readSecret(home, NAME)).toBe("from-settings");
    expect(await secretSource(home, NAME)).toBe("settings");
  });

  it("shows only the last 4 characters", () => {
    expect(keyHint("abcdefghijkl1234")).toBe("…1234");
    expect(keyHint("short")).toBe("…");
  });
});
