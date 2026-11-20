/**
 * A fake `claude` for tests and local checks of "Write the narration": it reads the prompt, streams the same
 * events as `claude -p --output-format stream-json` (a frame looked at, then the structured answer) and logs
 * what it was given. `FAKE_CLAUDE_MODE`: ok (default), slow, login, crash. `FAKE_CLAUDE_ANSWER`: the script. `FAKE_CLAUDE_DELAY`:
 * a pause (ms) before answering.
 */
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PROGRAM = `
import { appendFileSync } from "node:fs";
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args: process.argv.slice(2), prompt, cwd: process.cwd() }) + "\\n");
}
const say = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
say({ type: "system", subtype: "init" });
if (mode === "crash") {
  process.stderr.write("Something broke inside\\n");
  process.exit(1);
}
if (mode === "login") {
  say({ type: "result", subtype: "success", is_error: true, result: "Invalid API key · Please run /login" });
  process.exit(1);
}
say({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__kairos__kairos_frame", input: { t: 1.5 } }] } });
say({ type: "user", message: { content: [{ type: "tool_result" }] } });
if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 60000));
const pause = Number(process.env.FAKE_CLAUDE_DELAY ?? 0);
if (pause) {
  say({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "story.js" } }] } });
  await new Promise((resolve) => setTimeout(resolve, pause));
}
const answer = process.env.FAKE_CLAUDE_ANSWER
  ? JSON.parse(process.env.FAKE_CLAUDE_ANSWER)
  : {
      cast: [{ speaker: "narrator", type: "narrator" }, { speaker: "ruby", type: "girl" }],
      lines: [
        { speaker: "narrator", text: "Once upon a time", start: 0 },
        { speaker: "ruby", text: "Wait for me", start: 1 },
      ],
      note: "",
    };
say({ type: "assistant", message: { content: [{ type: "tool_use", name: "StructuredOutput", input: answer }] } });
say({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(answer), structured_output: answer });
`;

/** Writes the fake into `dir` and returns the program to run in place of `claude`. */
export async function installFakeClaude(dir: string): Promise<string> {
  const program = join(dir, "fake-claude.mjs");
  await writeFile(program, PROGRAM);
  if (process.platform === "win32") {
    const launcher = join(dir, "fake-claude.cmd");
    await writeFile(launcher, `@echo off\r\n"${process.execPath}" "${program}" %*\r\n`);
    return launcher;
  }
  const launcher = join(dir, "fake-claude");
  await writeFile(launcher, `#!/bin/sh\nexec "${process.execPath}" "${program}" "$@"\n`);
  await chmod(launcher, 0o755);
  return launcher;
}
