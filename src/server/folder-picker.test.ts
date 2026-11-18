import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pickerCommands, pickFolder } from "./folder-picker.ts";

describe("pickerCommands", () => {
  it("uses the Windows folder window through PowerShell", async () => {
    const [command, ...rest] = await pickerCommands("win32", "Pick", "C:\\Films");
    expect(rest).toEqual([]);
    expect(command?.command).toBe("powershell.exe");
    expect(command?.args).toContain("-STA");
    expect(command?.args).toContain("-EncodedCommand");
    expect(command?.env).toEqual({ KAIROS_PICK_TITLE: "Pick", KAIROS_PICK_START: "C:\\Films" });
    expect(command?.isCancel(1, "")).toBe(true);
    expect(command?.isCancel(2, "boom")).toBe(false);
  });

  it("uses AppleScript on macOS, where only error -128 means cancelled", async () => {
    const [command] = await pickerCommands("darwin", "Pick", "/Users/you");
    expect(command?.command).toBe("osascript");
    expect(command?.args.slice(-2)).toEqual(["Pick", "/Users/you"]);
    expect(command?.isCancel(1, "execution error: User canceled. (-128)")).toBe(true);
    expect(command?.isCancel(1, "some other error")).toBe(false);
  });

  it("tries zenity, then kdialog on Linux", async () => {
    const commands = await pickerCommands("linux", "Pick", null);
    expect(commands.map((command) => command.command)).toEqual(["zenity", "kdialog"]);
  });
});

describe("pickFolder", () => {
  it.runIf(process.platform === "win32")(
    "reports unsupported when no folder window program exists",
    async () => {
      // zenity and kdialog are not installed on Windows.
      expect(await pickFolder("Pick", null, "linux")).toEqual({ status: "unsupported" });
    },
  );

  it.runIf(process.platform === "win32")(
    "has a Windows picker that compiles",
    async () => {
      const [command] = await pickerCommands("win32", "Pick", null);
      if (!command) throw new Error("no command");
      const result = spawnSync(command.command, command.args, {
        env: { ...process.env, KAIROS_PICK_CHECK: "1" },
        encoding: "utf8",
        windowsHide: true,
      });
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("ok");
      expect(result.status).toBe(0);
    },
    30_000,
  );
});
