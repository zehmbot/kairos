/**
 * `npm run setup`: connects Kairos to Claude Code from the terminal (the same as Settings → Claude Code →
 * Connect in the app). It adds the Kairos tools to Claude Code for all projects.
 */
import { fileURLToPath } from "node:url";
import { ClaudeCliError, claudeTools } from "./server/claude-cli.ts";
import { DEFAULT_HUB_PORT } from "./shared/ports.ts";

const claude = claudeTools({
  serverPath: fileURLToPath(new URL("./mcp/server.ts", import.meta.url)),
  hubPort: Number(process.env.KAIROS_PORT ?? DEFAULT_HUB_PORT),
  defaultPort: DEFAULT_HUB_PORT,
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
      ? "Kairos tools connected. Open a film folder in a terminal and run claude."
      : "Claude Code didn't confirm the Kairos tools. Try Settings → Claude Code in the app.",
  );
} catch (error) {
  console.error(error instanceof ClaudeCliError ? error.message : error);
  process.exit(1);
}
