/**
 * Opens the system's own "choose a folder" window. Browsers can't hand a web page a real folder path,
 * so the hub (which runs on the user's computer) opens the window and reports the folder chosen.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

export type PickResult =
  | { status: "picked"; path: string }
  | { status: "cancelled" }
  | { status: "unsupported" };

export interface PickerCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** True when the exit means "the user closed the window without choosing". */
  isCancel: (code: number | null, stderr: string) => boolean;
}

const windowsScript = new URL("./folder-picker.ps1", import.meta.url);

/** PowerShell's -EncodedCommand takes the script as base64 UTF-16LE. */
async function encodedWindowsScript(): Promise<string> {
  return Buffer.from(await readFile(windowsScript, "utf8"), "utf16le").toString("base64");
}

/** The commands to try, in order, on `platform`. */
export async function pickerCommands(
  platform: NodeJS.Platform,
  title: string,
  startFolder: string | null,
): Promise<PickerCommand[]> {
  const start = startFolder ?? "";
  if (platform === "win32") {
    return [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-EncodedCommand",
          await encodedWindowsScript(),
        ],
        env: { KAIROS_PICK_TITLE: title, KAIROS_PICK_START: start },
        isCancel: (code) => code === 1,
      },
    ];
  }
  if (platform === "darwin") {
    const script = [
      "on run argv",
      "set startFolder to item 2 of argv",
      'if startFolder is "" then return POSIX path of (choose folder with prompt (item 1 of argv))',
      "return POSIX path of (choose folder with prompt (item 1 of argv) default location (POSIX file startFolder))",
      "end run",
    ];
    return [
      {
        command: "osascript",
        args: [...script.flatMap((line) => ["-e", line]), title, start],
        isCancel: (code, stderr) => code === 1 && stderr.includes("-128"),
      },
    ];
  }
  return [
    {
      command: "zenity",
      args: [
        "--file-selection",
        "--directory",
        `--title=${title}`,
        ...(start ? [`--filename=${start}/`] : []),
      ],
      isCancel: (code) => code === 1,
    },
    {
      command: "kdialog",
      args: ["--getexistingdirectory", start || ".", "--title", title],
      isCancel: (code) => code === 1,
    },
  ];
}

interface RunResult {
  missing: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(command: PickerCommand): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      env: { ...process.env, ...command.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      resolve({ missing: error.code === "ENOENT", code: null, stdout, stderr: error.message });
    });
    child.on("close", (code) => resolve({ missing: false, code, stdout, stderr }));
  });
}

/**
 * Shows the folder window and waits for the user. Throws when the window fails to open for another
 * reason than "this computer has no folder window" (which gives `unsupported`).
 */
export async function pickFolder(
  title: string,
  startFolder: string | null,
  platform: NodeJS.Platform = process.platform,
): Promise<PickResult> {
  for (const command of await pickerCommands(platform, title, startFolder)) {
    const result = await run(command);
    if (result.missing) continue;
    const path = result.stdout.replace(/[\r\n]+$/, "");
    if (result.code === 0 && path) return { status: "picked", path };
    if (command.isCancel(result.code, result.stderr)) return { status: "cancelled" };
    throw new Error(result.stderr.trim() || `${command.command} stopped with code ${result.code}.`);
  }
  return { status: "unsupported" };
}
