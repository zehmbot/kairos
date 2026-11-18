/**
 * Talks to the Claude Code command line (`claude`): finds it, reads its version, adds or removes the Kairos
 * tools (an MCP server at user scope), and opens a terminal with Claude running in a film folder.
 * The commands are built by pure functions, so they can be tested without running anything.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import type { ClaudeStatus } from "../shared/types.ts";

/** Name of the Kairos MCP server inside Claude Code (tools show up as `mcp__kairos__...`). */
export const MCP_NAME = "kairos";

/** Something went wrong with `claude`. The message is shown to the user as-is. */
export class ClaudeCliError extends Error {}

const pathOf = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix);

function pathDirs(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const value = env.PATH ?? env.Path ?? "";
  return value.split(platform === "win32" ? ";" : ":").filter(Boolean);
}

/** Every place a program called `names` may be, in the order to try them. */
function onPath(
  names: readonly string[],
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  extraDirs: readonly string[] = [],
): string[] {
  const { join } = pathOf(platform);
  const found: string[] = [];
  for (const dir of [...pathDirs(platform, env), ...extraDirs]) {
    for (const name of names) found.push(join(dir, name));
  }
  return [...new Set(found)];
}

/** Where `claude` may be: `KAIROS_CLAUDE`, then each PATH folder, then the native installer's folder. */
export function claudeCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string[] {
  const names = platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"];
  const installerDir = pathOf(platform).join(home, ".local", "bin");
  const list = onPath(names, platform, env, [installerDir]);
  return env.KAIROS_CLAUDE ? [env.KAIROS_CLAUDE, ...list] : list;
}

export function findClaude(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): string | null {
  return claudeCandidates(platform, env, home).find((path) => exists(path)) ?? null;
}

/** `2.1.327 (Claude Code)` -> `2.1.327`. */
export function parseVersion(output: string): string {
  const line = output.trim().split(/\r?\n/)[0] ?? "";
  return line.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? line;
}

export interface McpAddOptions {
  /** Absolute path of the node program that runs the server. */
  nodePath: string;
  /** Absolute path of `src/mcp/server.ts`. */
  serverPath: string;
  /** Hub port, passed to the server only when it isn't the default. */
  hubPort: number;
  defaultPort: number;
}

/** `claude mcp add` for the Kairos tools, for all projects (user scope). */
export function mcpAddArgs(options: McpAddOptions): string[] {
  const env =
    options.hubPort === options.defaultPort ? [] : ["-e", `KAIROS_PORT=${options.hubPort}`];
  // An option must sit between `-e` pairs and the server name, or the name is read as another pair.
  return [
    "mcp",
    "add",
    "--scope",
    "user",
    ...env,
    "--transport",
    "stdio",
    MCP_NAME,
    "--",
    options.nodePath,
    options.serverPath,
  ];
}

export const mcpGetArgs = (): string[] => ["mcp", "get", MCP_NAME];
export const mcpRemoveArgs = (): string[] => ["mcp", "remove", "--scope", "user", MCP_NAME];

/** A program to start, with its arguments. */
export interface Launch {
  file: string;
  args: string[];
  cwd?: string;
}

/** AppleScript string literal. */
const appleString = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/**
 * The command that opens a terminal window in `dir` with Claude running, or `null` when no terminal app
 * is found. `has(name)` says whether a program is on the PATH.
 */
export function terminalLaunch(
  platform: NodeJS.Platform,
  dir: string,
  claudePath: string,
  has: (program: string) => boolean,
): Launch | null {
  if (platform === "win32") {
    if (has("wt.exe")) return { file: "wt.exe", args: ["-d", dir, claudePath] };
    // `start` opens a new console window; its first quoted argument is the window title.
    return { file: "cmd.exe", args: ["/d", "/c", "start", "Claude Code", "/D", dir, claudePath] };
  }
  if (platform === "darwin") {
    const script = `tell application "Terminal" to do script "cd " & quoted form of ${appleString(dir)} & " && " & quoted form of ${appleString(claudePath)}`;
    return {
      file: "osascript",
      args: ["-e", script, "-e", 'tell application "Terminal" to activate'],
    };
  }
  if (has("gnome-terminal")) {
    return { file: "gnome-terminal", args: ["--working-directory", dir, "--", claudePath] };
  }
  if (has("konsole")) return { file: "konsole", args: ["--workdir", dir, "-e", claudePath] };
  if (has("x-terminal-emulator")) {
    return { file: "x-terminal-emulator", args: ["-e", claudePath], cwd: dir };
  }
  return null;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Quotes one argument for a `cmd.exe` command line. */
const cmdQuote = (arg: string) =>
  /[\s"&|<>^()]/.test(arg) ? `"${arg.replaceAll('"', '""')}"` : arg;

/** Runs `file` and collects its output. Never throws for a non-zero exit; only when it can't start. */
function run(file: string, args: string[], timeout = 30_000): Promise<RunResult> {
  // Windows can't start `.cmd` files directly (npm installs `claude.cmd`): go through cmd.exe.
  const viaCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(file);
  const [program, programArgs] = viaCmd
    ? ["cmd.exe", ["/d", "/s", "/c", `"${[file, ...args].map(cmdQuote).join(" ")}"`]]
    : [file, args];
  return new Promise((resolve, reject) => {
    execFile(
      program,
      programArgs,
      { timeout, windowsHide: true, windowsVerbatimArguments: viaCmd, cwd: homedir() },
      (error, stdout, stderr) => {
        const code = (error as (Error & { code?: unknown }) | null)?.code;
        if (error && typeof code !== "number") {
          reject(new ClaudeCliError(`Kairos could not run Claude Code: ${error.message}`));
          return;
        }
        resolve({ code: typeof code === "number" ? code : 0, stdout, stderr });
      },
    );
  });
}

export interface ClaudeTools {
  status(): Promise<ClaudeStatus>;
  /** Adds the Kairos tools to Claude Code (for all projects). */
  connect(): Promise<ClaudeStatus>;
  disconnect(): Promise<ClaudeStatus>;
  /** Opens a terminal window in `dir` with Claude running. */
  openHere(dir: string): Promise<void>;
}

export interface ClaudeToolsOptions {
  /** Absolute path of `src/mcp/server.ts`. */
  serverPath: string;
  hubPort: number;
  defaultPort: number;
}

export function claudeTools(options: ClaudeToolsOptions): ClaudeTools {
  const needClaude = (): string => {
    const path = findClaude();
    if (!path) {
      throw new ClaudeCliError(
        "Claude Code isn't installed on this computer. Install it, then try again.",
      );
    }
    return path;
  };

  const status = async (): Promise<ClaudeStatus> => {
    const path = findClaude();
    if (!path) return { cli: null, connected: false };
    const [version, server] = await Promise.all([
      run(path, ["--version"]),
      run(path, mcpGetArgs()),
    ]);
    return {
      cli: { path, version: parseVersion(version.stdout) },
      connected: server.code === 0,
    };
  };

  const failed = (what: string, result: RunResult) =>
    new ClaudeCliError(
      `${what}: ${(result.stderr || result.stdout).trim() || `exit ${result.code}`}`,
    );

  return {
    status,
    async connect() {
      const path = needClaude();
      // Replace an older entry (for example from a Kairos folder that moved).
      await run(path, mcpRemoveArgs());
      const added = await run(
        path,
        mcpAddArgs({
          nodePath: process.execPath,
          serverPath: options.serverPath,
          hubPort: options.hubPort,
          defaultPort: options.defaultPort,
        }),
      );
      if (added.code !== 0) throw failed("Claude Code could not add the Kairos tools", added);
      return status();
    },
    async disconnect() {
      const path = needClaude();
      const removed = await run(path, mcpRemoveArgs());
      if (removed.code !== 0 && (await run(path, mcpGetArgs())).code === 0) {
        throw failed("Claude Code could not remove the Kairos tools", removed);
      }
      return status();
    },
    async openHere(dir) {
      const claude = needClaude();
      const has = (program: string) =>
        onPath([program], process.platform, process.env).some((path) => existsSync(path));
      const launch = terminalLaunch(process.platform, dir, claude, has);
      if (!launch) {
        throw new ClaudeCliError(
          `Kairos couldn't find a terminal app. Open a terminal in ${dir} and run claude.`,
        );
      }
      const child = spawn(launch.file, launch.args, {
        cwd: launch.cwd ?? dir,
        detached: true,
        stdio: "ignore",
      });
      child.on("error", (error) => console.warn(`Could not open a terminal: ${error.message}`));
      child.unref();
    },
  };
}
