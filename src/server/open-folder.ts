import { spawn } from "node:child_process";

/** Opens `path` in the system file manager (Explorer, Finder, or the Linux default). */
export function openFolder(path: string): void {
  const command =
    process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const child = spawn(command, [path], { detached: true, stdio: "ignore" });
  child.on("error", (error) => console.warn(`Could not open ${path}: ${error.message}`));
  child.unref();
}
