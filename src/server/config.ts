import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AppConfig, AppConfigSchema } from "../shared/types.ts";

/** Folder for Kairos' own settings: `~/.kairos`, or `KAIROS_HOME` when set. */
export function kairosHome(): string {
  return process.env.KAIROS_HOME || join(homedir(), ".kairos");
}

function configFile(home: string): string {
  return join(home, "config.json");
}

/** Reads `config.json`. A missing or broken file gives an empty config, so Kairos always starts. */
export async function loadConfig(home: string): Promise<AppConfig> {
  let text: string;
  try {
    text = await readFile(configFile(home), "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = AppConfigSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // Not JSON: fall through.
  }
  console.warn(`Ignoring ${configFile(home)}: it is not a valid Kairos config.`);
  return {};
}

export async function saveConfig(home: string, config: AppConfig): Promise<void> {
  await mkdir(home, { recursive: true });
  const file = configFile(home);
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temp, file);
}
