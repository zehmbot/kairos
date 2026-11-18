/**
 * Kairos tools for Claude Code, over stdio. Claude Code starts it (see `claude mcp add` in
 * src/server/claude-cli.ts) and it calls the running Kairos hub. Stdout carries the protocol:
 * write logs to stderr only.
 */
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../../package.json" with { type: "json" };
import { openUrl } from "../server/open-folder.ts";
import { DEFAULT_HUB_PORT, HOST } from "../shared/ports.ts";
import { HubClient } from "./hub-client.ts";
import { createKairosServer } from "./tools.ts";

const port = Number(process.env.KAIROS_PORT ?? DEFAULT_HUB_PORT);
const server = createKairosServer({
  hub: new HubClient(`http://${HOST}:${port}`),
  cwd: process.cwd(),
  openUrl,
  kairosDir: fileURLToPath(new URL("../../", import.meta.url)),
  version: pkg.version,
});

await server.connect(new StdioServerTransport());
