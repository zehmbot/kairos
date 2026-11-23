/**
 * The PATH as the computer has it now, not as it was when Kairos started. A program installed while Kairos runs
 * (ffmpeg with winget, Homebrew...) is on the new PATH only: the setup card's "Check again" looks there.
 * On Windows the user's and the machine's PATH are read again from the registry; on macOS and Linux the usual
 * install folders are added (a Kairos started from a desktop shortcut may not have them).
 */
import { execFile } from "node:child_process";

const USER_KEY = "HKCU\\Environment";
const MACHINE_KEY = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const UNIX_DIRS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"],
  linux: ["/usr/local/bin", "/usr/bin", "/snap/bin"],
};

/** The `Path` value from `reg query <key> /v Path`, or null. */
export function parseRegPath(stdout: string): string | null {
  const line = stdout.split(/\r?\n/).find((entry) => /^\s+Path\s+REG_/i.test(entry));
  const value = line?.replace(/^\s+Path\s+REG_\w+\s+/i, "").trim();
  return value ? value : null;
}

/** Expands `%NAME%` with the environment (names are not case-sensitive on Windows); unknown names stay. */
export function expandWindowsVars(value: string, env: NodeJS.ProcessEnv): string {
  const byName = new Map(Object.entries(env).map(([name, text]) => [name.toLowerCase(), text]));
  return value.replace(
    /%([^%]+)%/g,
    (whole, name: string) => byName.get(name.toLowerCase()) ?? whole,
  );
}

/** Folders of a PATH, each once, in order (Windows compares them without case). */
export function joinPath(lists: readonly string[], platform: NodeJS.Platform): string {
  const separator = platform === "win32" ? ";" : ":";
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const list of lists) {
    for (const dir of list.split(separator)) {
      const clean = dir.trim();
      const key = platform === "win32" ? clean.toLowerCase() : clean;
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      dirs.push(clean);
    }
  }
  return dirs.join(separator);
}

function queryRegistry(key: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "reg",
      ["query", key, "/v", "Path"],
      { timeout: 5000, windowsHide: true },
      (_error, out) => resolve(String(out ?? "")),
    );
  });
}

/** The PATH now: Kairos' own first, then what was added since it started. */
export async function currentPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  readRegistry: (key: string) => Promise<string> = queryRegistry,
): Promise<string> {
  const own = env.PATH ?? env.Path ?? "";
  if (platform === "win32") {
    const saved = await Promise.all([USER_KEY, MACHINE_KEY].map(readRegistry));
    const lists = saved
      .map((stdout) => parseRegPath(stdout))
      .filter((value): value is string => value !== null)
      .map((value) => expandWindowsVars(value, env));
    return joinPath([own, ...lists], platform);
  }
  return joinPath([own, (UNIX_DIRS[platform] ?? []).join(":")], platform);
}
