import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import pkg from "../../package.json" with { type: "json" };
import { DEFAULT_FILM_PORT, DEFAULT_HUB_PORT, DEV_WEB_PORT, HOST } from "../shared/ports.ts";
import { Camera, findBrowser } from "./camera.ts";
import { claudeTools } from "./claude-cli.ts";
import { kairosHome } from "./config.ts";
import { probeExport } from "./ffmpeg.ts";
import { buildFilmServer } from "./film-server.ts";
import { Renderer } from "./renderer.ts";
import { claudeRoutes } from "./routes/claude.ts";
import { eventRoutes } from "./routes/events.ts";
import { filmRoutes } from "./routes/films.ts";
import { filmPicture, frameRoutes } from "./routes/frames.ts";
import { healthRoutes } from "./routes/health.ts";
import { noteRoutes } from "./routes/notes.ts";
import { renderRoutes } from "./routes/renders.ts";
import { skillRoutes } from "./routes/skills.ts";
import { templateRoutes } from "./routes/templates.ts";
import { workspaceRoutes } from "./routes/workspace.ts";
import { allowedHostsFor, requestGuard } from "./security.ts";
import { claudeSkillsDir, Skills } from "./skills.ts";
import { Studio } from "./studio.ts";

const { values: args } = parseArgs({
  options: {
    dev: { type: "boolean", default: false },
    port: { type: "string" },
    "film-port": { type: "string" },
  },
});

const dev = args.dev;
const port = Number(args.port ?? process.env.KAIROS_PORT ?? DEFAULT_HUB_PORT);
const filmPort = Number(args["film-port"] ?? process.env.KAIROS_FILM_PORT ?? DEFAULT_FILM_PORT);
const url = `http://${HOST}:${port}`;
const webDir = fileURLToPath(new URL("../../dist/web/", import.meta.url));
const templatesDir = fileURLToPath(new URL("../../templates/", import.meta.url));
const mcpServerPath = fileURLToPath(new URL("../mcp/server.ts", import.meta.url));
const builtinSkillsDir = fileURLToPath(new URL("../../skills/", import.meta.url));

// In dev, the Vite UI on DEV_WEB_PORT calls this API through its proxy.
const uiHosts = allowedHostsFor(dev ? [port, DEV_WEB_PORT] : [port]);
const uiOrigins = [...uiHosts].map((host) => `http://${host}`);

const studio = await Studio.open({ home: kairosHome(), templatesDir });
const camera = new Camera(findBrowser());
const skills = new Skills({
  builtinDir: builtinSkillsDir,
  userDir: join(kairosHome(), "skills"),
  claudeDir: claudeSkillsDir(),
});
// Kairos ships newer skills from time to time: refresh the copies that are on (and weren't edited).
try {
  const updated = await skills.refresh();
  if (updated.length > 0) console.log(`Updated skills: ${updated.join(", ")}`);
} catch (error) {
  console.warn(`Could not update the skills: ${(error as Error).message}`);
}

const app = Fastify({ logger: false, forceCloseConnections: true });
app.addHook("onRequest", requestGuard(uiHosts));

healthRoutes(app, { version: pkg.version, url, dev, filmPort });
workspaceRoutes(app, studio);
const filmServerUrl = `http://${HOST}:${filmPort}`;
filmRoutes(app, studio, { picture: filmPicture({ studio, camera, filmServerUrl }) });
templateRoutes(app, studio);
eventRoutes(app, studio.events);
noteRoutes(app, { studio, camera, filmServerUrl });
frameRoutes(app, { studio, camera, filmServerUrl });
claudeRoutes(
  app,
  studio,
  claudeTools({ serverPath: mcpServerPath, hubPort: port, defaultPort: DEFAULT_HUB_PORT }),
  () => skills.turnOnDefaults(),
);
skillRoutes(app, skills);

// Video export: find ffmpeg and test its encoders once, in the background (it takes a few seconds).
const exportInfo = probeExport();
void exportInfo.then((info) =>
  console.log(
    info.ffmpeg
      ? `Video export: ffmpeg ${info.ffmpeg.version}, ${info.encoders.map((encoder) => encoder.name).join(", ")}`
      : "Video export: ffmpeg not found, rendering is off",
  ),
);
const renderer = new Renderer({
  studio,
  browser: camera.browser,
  filmServerUrl,
  exportInfo: () => exportInfo,
});
renderRoutes(app, { studio, renderer, exportInfo: () => exportInfo });

if (existsSync(webDir)) {
  await app.register(fastifyStatic, { root: webDir });
  // Single-page app: unknown non-API paths get index.html so client routes work on reload.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });
} else {
  app.get("/", async (_request, reply) =>
    reply
      .type("text/plain")
      .send(
        dev
          ? `Kairos hub is running. Open the dev UI at http://${HOST}:${DEV_WEB_PORT}`
          : "Kairos hub is running, but the UI is not built yet. Run: npm run build",
      ),
  );
}

const filmServer = await buildFilmServer({
  filmsDir: () => studio.filmsDir,
  port: filmPort,
  parentOrigins: uiOrigins,
});

async function listen(server: FastifyInstance, serverPort: number, envName: string): Promise<void> {
  try {
    await server.listen({ host: HOST, port: serverPort });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(`Port ${serverPort} is already in use. Close the other app or set ${envName}.`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

await listen(app, port, "KAIROS_PORT");
await listen(filmServer, filmPort, "KAIROS_FILM_PORT");
console.log(`Kairos hub running at ${url}${dev ? " (dev)" : ""}`);
if (studio.workspace) console.log(`Workspace: ${studio.workspace}`);
console.log(
  camera.browser
    ? `Frame camera: ${camera.browser.name}`
    : "Frame camera: no Chrome or Edge found, notes will have no pictures",
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    studio.close();
    Promise.allSettled([renderer.close(), app.close(), filmServer.close(), camera.close()]).finally(
      () => process.exit(0),
    );
  });
}
