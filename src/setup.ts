/**
 * `npm run setup`: connects Kairos to Claude Code from the terminal (the same as Settings → Claude Code →
 * Connect in the app). It adds the Kairos tools to Claude Code for all projects and turns on the Kairos skills.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeCliError, claudeTools } from "./server/claude-cli.ts";
import { kairosHome } from "./server/config.ts";
import { claudeSkillsDir, SkillError, Skills } from "./server/skills.ts";
import { DEFAULT_HUB_PORT } from "./shared/ports.ts";

const claude = claudeTools({
  serverPath: fileURLToPath(new URL("./mcp/server.ts", import.meta.url)),
  hubPort: Number(process.env.KAIROS_PORT ?? DEFAULT_HUB_PORT),
  defaultPort: DEFAULT_HUB_PORT,
});
const skills = new Skills({
  builtinDir: fileURLToPath(new URL("../skills/", import.meta.url)),
  userDir: join(kairosHome(), "skills"),
  claudeDir: claudeSkillsDir(),
});

try {
  const before = await claude.status();
  if (!before.cli) {
    console.error("Claude Code isn't installed on this computer. Install it, then run this again.");
    process.exit(1);
  }
  console.log(`Claude Code ${before.cli.version} found.`);
  const after = await claude.connect();
  console.log(
    after.connected
      ? "Kairos tools connected."
      : "Claude Code didn't confirm the Kairos tools. Try Settings → Claude Code in the app.",
  );
  const turnedOn = await skills.turnOnDefaults();
  await skills.refresh();
  console.log(
    turnedOn.length > 0
      ? `Kairos skills turned on: ${turnedOn.join(", ")}.`
      : "Kairos skills were already on (see the Skills page in the app).",
  );
  console.log("Done. Open a film folder in a terminal and run claude.");
} catch (error) {
  console.error(
    error instanceof ClaudeCliError || error instanceof SkillError ? error.message : error,
  );
  process.exit(1);
}
