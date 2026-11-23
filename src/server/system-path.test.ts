import { describe, expect, it } from "vitest";
import { currentPath, expandWindowsVars, joinPath, parseRegPath } from "./system-path.ts";

const USER_OUT = `
HKEY_CURRENT_USER\\Environment
    Path    REG_EXPAND_SZ    %USERPROFILE%\\AppData\\Local\\Microsoft\\WinGet\\Links;C:\\Tools

`;
const MACHINE_OUT = `
HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment
    Path    REG_SZ    C:\\Windows\\system32;C:\\Program Files\\nodejs\\
`;

describe("system PATH", () => {
  it("reads the Path value out of reg query", () => {
    expect(parseRegPath(USER_OUT)).toBe(
      "%USERPROFILE%\\AppData\\Local\\Microsoft\\WinGet\\Links;C:\\Tools",
    );
    expect(parseRegPath("ERROR: The system was unable to find the specified registry key.")).toBe(
      null,
    );
  });

  it("expands %NAME% without caring about case, and keeps unknown names", () => {
    expect(expandWindowsVars("%userprofile%\\x;%NOPE%\\y", { USERPROFILE: "C:\\Users\\me" })).toBe(
      "C:\\Users\\me\\x;%NOPE%\\y",
    );
  });

  it("keeps each folder once, in order", () => {
    expect(joinPath(["C:\\A;c:\\a;C:\\B", "C:\\B;;C:\\C"], "win32")).toBe("C:\\A;C:\\B;C:\\C");
    expect(joinPath(["/usr/bin:/a", "/usr/bin:/b"], "linux")).toBe("/usr/bin:/a:/b");
  });

  it("finds what was added to the Windows PATH after Kairos started", async () => {
    const path = await currentPath(
      "win32",
      { Path: "C:\\Windows\\system32", USERPROFILE: "C:\\Users\\me" },
      async (key) => (key.startsWith("HKCU") ? USER_OUT : MACHINE_OUT),
    );
    expect(path.split(";")).toEqual([
      "C:\\Windows\\system32",
      "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links",
      "C:\\Tools",
      "C:\\Program Files\\nodejs\\",
    ]);
  });

  it("adds the usual install folders on macOS", async () => {
    const path = await currentPath("darwin", { PATH: "/usr/bin:/bin" });
    expect(path).toBe("/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin");
  });
});
