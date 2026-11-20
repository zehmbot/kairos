/**
 * Runs Claude Code in the background (`claude -p --output-format stream-json`) in a film's folder: the Kairos
 * tools come from a temp `--mcp-config`, the prompt goes on stdin, and every event of the stream goes to
 * `onEvent`. Stop and the time limit end the whole process tree. Used by "Write the narration" and by the
 * film's Claude jobs (make the film, an ask).
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { cmdQuote, MCP_NAME } from "./claude-cli.ts";

/** The Kairos tools server Claude starts: node, `src/mcp/server.ts`, the hub's port. */
export interface KairosMcp {
  node: string;
  script: string;
  hubPort: number;
}

export interface ClaudeRunOptions {
  /** The `claude` program. */
  claude: string;
  /** The film's folder: Claude runs there. */
  dir: string;
  /** The command line after the program, given the temp MCP config's path. */
  args: (mcpConfigPath: string) => string[];
  prompt: string;
  mcp: KairosMcp;
  limitMs: number;
  onEvent: (event: unknown) => void;
}

export interface ClaudeRunEnd {
  /** The exit code (null when it couldn't start or was ended). */
  code: number | null;
  /** The end of what Claude Code wrote on stderr. */
  errors: string;
  timedOut: boolean;
  stopped: boolean;
}

export interface ClaudeRun {
  ended: Promise<ClaudeRunEnd>;
  /** Ends Claude and waits (a few seconds at most) until it has ended. */
  stop(): Promise<void>;
}

/** Ends a program and everything it started. */
export function endProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else child.kill("SIGTERM");
}

/** Starts `claude` (through cmd.exe for `claude.cmd`, which Windows can't start directly). */
function spawnClaude(claude: string, args: string[], dir: string): ChildProcess {
  const viaCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(claude);
  return viaCmd
    ? spawn("cmd.exe", ["/d", "/s", "/c", `"${[claude, ...args].map(cmdQuote).join(" ")}"`], {
        cwd: dir,
        windowsHide: true,
        windowsVerbatimArguments: true,
      })
    : spawn(claude, args, { cwd: dir, windowsHide: true });
}

export function runClaude(options: ClaudeRunOptions): ClaudeRun {
  let child: ChildProcess | null = null;
  let stopped = false;
  let timedOut = false;
  let markClosed = () => {};
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });

  const ended = (async (): Promise<ClaudeRunEnd> => {
    const mcpPath = join(
      tmpdir(),
      `kairos-claude-${process.pid}-${randomBytes(4).toString("hex")}.json`,
    );
    let errors = "";
    let code: number | null = null;
    try {
      const { node, script, hubPort } = options.mcp;
      await writeFile(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            [MCP_NAME]: {
              type: "stdio",
              command: node,
              args: [script],
              env: { KAIROS_PORT: String(hubPort) },
            },
          },
        }),
      );
      if (stopped) return { code, errors, timedOut, stopped };
      const running = spawnClaude(options.claude, options.args(mcpPath), options.dir);
      child = running;
      running.stdin?.on("error", () => {});
      running.stdin?.end(options.prompt);
      running.stderr?.on("data", (chunk: Buffer) => {
        errors = (errors + chunk.toString()).slice(-4000);
      });
      const lines = createInterface({ input: running.stdout ?? process.stdin });
      lines.on("line", (line) => {
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        options.onEvent(event);
      });
      const timer = setTimeout(() => {
        timedOut = true;
        endProcessTree(running);
      }, options.limitMs);
      code = await new Promise<number | null>((resolve) => {
        running.on("error", (error) => {
          errors += error.message;
          resolve(null);
        });
        running.on("close", (exit) => resolve(exit));
      });
      clearTimeout(timer);
      lines.close();
    } catch (error) {
      errors += error instanceof Error ? error.message : String(error);
    } finally {
      await rm(mcpPath, { force: true });
      markClosed();
    }
    return { code, errors, timedOut, stopped };
  })();

  return {
    ended,
    async stop() {
      stopped = true;
      if (child) endProcessTree(child);
      await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 5000))]);
    },
  };
}

/** Turns what Claude Code says when it fails into plain words. `task` says what it was doing. */
export function plainClaudeProblem(text: string, task = "write the script"): string {
  if (/log ?in|sign ?in|invalid api key|authenticat|unauthori[sz]ed/i.test(text)) {
    return "Claude Code needs you to sign in: open a terminal, run claude once and sign in, then try again.";
  }
  if (/usage limit|rate limit|limit reached|credit balance/i.test(text)) {
    return "Your Claude plan's limit is reached for now. Try again later.";
  }
  const short = text.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" ").slice(0, 300);
  return short
    ? `Claude Code couldn't ${task}: ${short}`
    : `Claude Code stopped before it could ${task}.`;
}
