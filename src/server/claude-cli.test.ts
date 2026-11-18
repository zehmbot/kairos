import { describe, expect, it } from "vitest";
import {
  claudeCandidates,
  findClaude,
  mcpAddArgs,
  mcpGetArgs,
  mcpRemoveArgs,
  parseVersion,
  terminalLaunch,
} from "./claude-cli.ts";

describe("finding claude", () => {
  it("looks on the PATH, then in the native installer's folder", () => {
    const list = claudeCandidates("win32", { Path: "C:\\Tools;C:\\npm" }, "C:\\Users\\me");
    expect(list).toEqual([
      "C:\\Tools\\claude.exe",
      "C:\\Tools\\claude.cmd",
      "C:\\npm\\claude.exe",
      "C:\\npm\\claude.cmd",
      "C:\\Users\\me\\.local\\bin\\claude.exe",
      "C:\\Users\\me\\.local\\bin\\claude.cmd",
    ]);
    expect(claudeCandidates("linux", { PATH: "/usr/bin" }, "/home/me")).toEqual([
      "/usr/bin/claude",
      "/home/me/.local/bin/claude",
    ]);
  });

  it("lets KAIROS_CLAUDE win", () => {
    expect(claudeCandidates("linux", { KAIROS_CLAUDE: "/opt/claude" }, "/h")[0]).toBe(
      "/opt/claude",
    );
  });

  it("returns the first one that exists, or null", () => {
    const env = { PATH: "/a:/b" };
    expect(findClaude("linux", env, "/h", (path) => path === "/b/claude")).toBe("/b/claude");
    expect(findClaude("linux", env, "/h", () => false)).toBeNull();
  });

  it("reads the version", () => {
    expect(parseVersion("2.1.327 (Claude Code)\n")).toBe("2.1.327");
    expect(parseVersion("something else")).toBe("something else");
  });
});

describe("Kairos tools in Claude Code", () => {
  const base = {
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    serverPath: "C:\\My Kairos\\src\\mcp\\server.ts",
    defaultPort: 7340,
  };

  it("adds the server for all projects", () => {
    expect(mcpAddArgs({ ...base, hubPort: 7340 })).toEqual([
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "stdio",
      "kairos",
      "--",
      base.nodePath,
      base.serverPath,
    ]);
  });

  it("passes a non-default hub port, before the server name", () => {
    const args = mcpAddArgs({ ...base, hubPort: 7380 });
    expect(args.slice(4, 8)).toEqual(["-e", "KAIROS_PORT=7380", "--transport", "stdio"]);
    expect(args.indexOf("kairos")).toBeGreaterThan(args.indexOf("stdio"));
  });

  it("checks and removes it by name", () => {
    expect(mcpGetArgs()).toEqual(["mcp", "get", "kairos"]);
    expect(mcpRemoveArgs()).toEqual(["mcp", "remove", "--scope", "user", "kairos"]);
  });
});

describe("opening Claude in a terminal", () => {
  const dir = "C:\\Kairos\\films\\my film";
  const claude = "C:\\Users\\me\\.local\\bin\\claude.exe";

  it("uses Windows Terminal, or a plain console window", () => {
    expect(terminalLaunch("win32", dir, claude, (name) => name === "wt.exe")).toEqual({
      file: "wt.exe",
      args: ["-d", dir, claude],
    });
    expect(terminalLaunch("win32", dir, claude, () => false)).toEqual({
      file: "cmd.exe",
      args: ["/d", "/c", "start", "Claude Code", "/D", dir, claude],
    });
  });

  it("uses Terminal on macOS, with safe quoting", () => {
    const launch = terminalLaunch(
      "darwin",
      '/Users/me/films/say "hi"',
      "/usr/local/bin/claude",
      () => true,
    );
    expect(launch?.file).toBe("osascript");
    expect(launch?.args[1]).toContain('quoted form of "/Users/me/films/say \\"hi\\""');
    expect(launch?.args[1]).toContain('quoted form of "/usr/local/bin/claude"');
  });

  it("finds a terminal on Linux, or gives up", () => {
    expect(terminalLaunch("linux", "/f", "/c", (name) => name === "gnome-terminal")?.args).toEqual([
      "--working-directory",
      "/f",
      "--",
      "/c",
    ]);
    expect(terminalLaunch("linux", "/f", "/c", (name) => name === "x-terminal-emulator")).toEqual({
      file: "x-terminal-emulator",
      args: ["-e", "/c"],
      cwd: "/f",
    });
    expect(terminalLaunch("linux", "/f", "/c", () => false)).toBeNull();
  });
});
