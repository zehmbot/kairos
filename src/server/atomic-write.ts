import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/**
 * Writes `text` to `file` all at once: readers see the old file or the new one, never half of it.
 * The text goes to a temp file next to it, which then replaces the file.
 */
export async function writeFileAtomic(file: string, text: string): Promise<void> {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, text, "utf8");
  // Windows can briefly lock a file (antivirus, sync tools): try the swap a few times.
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(temp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        await rm(temp, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
    }
  }
}
