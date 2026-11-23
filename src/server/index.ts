import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import pkg from "../../package.json" with { type: "json" };
import { DEFAULT_FILM_PORT, DEFAULT_HUB_PORT, DEV_WEB_PORT, HOST } from "../shared/ports.ts";
import { ActivityBoard, narrationActivity } from "./activity.ts";
import { Camera, findBrowser } from "./camera.ts";
import { claudeTools, findClaude } from "./claude-cli.ts";
import { HooksFileError, installHooks } from "./claude-hooks.ts";
import { ClaudeJobs } from "./claude-jobs.ts";
import { kairosHome } from "./config.ts";
import { probeExport } from "./ffmpeg.ts";
import { buildFilmServer } from "./film-server.ts";
import { scanFilms } from "./films.ts";
import { FilmSoundsSchema, syncEffectSounds } from "./fx.ts";
import { Renderer } from "./renderer.ts";
import { assetRoutes } from "./routes/assets.ts";
import { claudeRoutes } from "./routes/claude.ts";
import { claudeWorkRoutes } from "./routes/claude-work.ts";
import { eventRoutes } from "./routes/events.ts";
import { filmRoutes } from "./routes/films.ts";
import { filmPicture, framePicture, frameRoutes } from "./routes/frames.ts";
import { healthRoutes } from "./routes/health.ts";
import { noteRoutes } from "./routes/notes.ts";
import { referenceRoutes } from "./routes/references.ts";
import { renderRoutes } from "./routes/renders.ts";
import { scriptRoutes } from "./routes/script.ts";
import { skillRoutes } from "./routes/skills.ts";
import { soundRoutes } from "./routes/sounds.ts";
import { templateRoutes } from "./routes/templates.ts";
import { trashRoutes } from "./routes/trash.ts";
import { voiceRoutes } from "./routes/voice.ts";
import { workspaceRoutes } from "./routes/workspace.ts";
import { allowedHostsFor, requestGuard } from "./security.ts";
import { claudeSkillsDir, Skills } from "./skills.ts";
import { Studio } from "./studio.ts";
import { acceptUploads } from "./uploads.ts";
import { Writers } from "./writer.ts";

// Secrets (the fish.audio key) can sit in the Kairos folder's own .env, which git ignores.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No .env: fine.
}

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
// Frame pictures take video clips' frames with ffmpeg (found below, in the background).
const camera = new Camera(findBrowser(), undefined, {
  ffmpeg: async () => (await exportInfo).ffmpeg?.path ?? null,
});
const skills = new Skills({
  builtinDir: builtinSkillsDir,
  userDir: join(kairosHome(), "skills"),
  claudeDir: claudeSkillsDir(),
});
// Kairos ships newer skills from time to time: refresh the copies that are on (and weren't edited), and remove
// the copies of skills it no longer ships.
try {
  const updated = await skills.refresh();
  if (updated.length > 0) console.log(`Updated skills: ${updated.join(", ")}`);
  const retired = await skills.retire();
  if (retired.length > 0)
    console.log(`Removed skills Kairos no longer ships: ${retired.join(", ")}`);
} catch (error) {
  console.warn(`Could not update the skills: ${(error as Error).message}`);
}

const app = Fastify({ logger: false, forceCloseConnections: true });
app.addHook("onRequest", requestGuard(uiHosts));
acceptUploads(app);

healthRoutes(app, { version: pkg.version, url, dev, filmPort });
workspaceRoutes(app, studio);
const filmServerUrl = `http://${HOST}:${filmPort}`;
templateRoutes(app, studio);
trashRoutes(app, studio);
eventRoutes(app, studio.events);
noteRoutes(app, { studio, camera, filmServerUrl });
frameRoutes(app, { studio, camera, filmServerUrl });

// Claude at work on a film: Kairos' own runs, and Claude in your terminal (the film folder's hooks).
const activity = new ActivityBoard({
  publish: (id, now, ended) =>
    studio.events.publish({ type: "claude-activity", id, activity: now, ended }),
});
const kairosMcp = { node: process.execPath, script: mcpServerPath, hubPort: port };
const jobs = new ClaudeJobs({ claudePath: () => findClaude(), mcp: kairosMcp, activity });
claudeWorkRoutes(app, studio, { jobs, activity });
/** Puts the hooks in a film folder (your own settings there stay). */
const hooksIn = (dir: string) =>
  installHooks(dir, port).catch((error: Error) => {
    if (!(error instanceof HooksFileError)) console.warn(`Claude hooks: ${error.message}`);
    else console.warn(error.message);
  });
/** Every film of the workspace gets the hooks (written only where they are missing or old). */
const hooksEverywhere = async () => {
  const dir = studio.filmsDir;
  if (!dir) return;
  for (const film of await scanFilms(dir)) await hooksIn(film.path);
};
void hooksEverywhere();
studio.events.subscribe((event) => {
  if (event.type === "workspace-changed") void hooksEverywhere();
});

claudeRoutes(
  app,
  studio,
  claudeTools({ serverPath: mcpServerPath, hubPort: port, defaultPort: DEFAULT_HUB_PORT }),
  () => skills.turnOnDefaults(),
  hooksIn,
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
  syncSounds: async (dir, sounds) => {
    const parsed = FilmSoundsSchema.safeParse(sounds);
    if (parsed.success) await syncEffectSounds(dir, parsed.data);
  },
});
renderRoutes(app, {
  studio,
  renderer,
  exportInfo: () => exportInfo,
  picture: camera.browser ? framePicture({ studio, camera, filmServerUrl }) : undefined,
});
assetRoutes(app, studio);
soundRoutes(app, studio);
voiceRoutes(app, studio);
const writers = new Writers({
  claudePath: () => findClaude(),
  mcp: kairosMcp,
  onChange: (id, writer) => {
    studio.events.publish({ type: "writer-progress", id, writer });
    narrationActivity(activity, id, writer);
  },
  busy: (id) => jobs.running(id),
});
scriptRoutes(app, studio, writers);
referenceRoutes(app, studio, { ffmpeg: async () => (await exportInfo).ffmpeg?.path ?? null });
filmRoutes(app, studio, {
  picture: filmPicture({ studio, camera, filmServerUrl }),
  afterCreate: async (film, { make }) => {
    await hooksIn(film.path);
    if (make) await jobs.startOrNote({ id: film.id, dir: film.path }, { kind: "make" });
  },
  // A film can't be deleted while a render of it runs or waits.
  rendering: (filmId) =>
    renderer
      .jobs()
      .some(
        (job) =>
          job.filmId === filmId &&
          (job.state === "queued" || job.state === "running" || job.state === "joining"),
      ),
});

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
    activity.close();
    Promise.allSettled([
      jobs.close(),
      renderer.close(),
      app.close(),
      filmServer.close(),
      camera.close(),
    ]).finally(() => process.exit(0));
  });
}
