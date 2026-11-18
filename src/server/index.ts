import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import pkg from "../../package.json" with { type: "json" };
import { DEFAULT_FILM_PORT, DEFAULT_HUB_PORT, DEV_WEB_PORT, HOST } from "../shared/ports.ts";
import { Camera, findBrowser } from "./camera.ts";
import { kairosHome } from "./config.ts";
import { buildFilmServer } from "./film-server.ts";
import { eventRoutes } from "./routes/events.ts";
import { filmRoutes } from "./routes/films.ts";
import { healthRoutes } from "./routes/health.ts";
import { noteRoutes } from "./routes/notes.ts";
import { workspaceRoutes } from "./routes/workspace.ts";
import { allowedHostsFor, requestGuard } from "./security.ts";
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
const templateDir = fileURLToPath(new URL("../../templates/starter/", import.meta.url));

// In dev, the Vite UI on DEV_WEB_PORT calls this API through its proxy.
const uiHosts = allowedHostsFor(dev ? [port, DEV_WEB_PORT] : [port]);
const uiOrigins = [...uiHosts].map((host) => `http://${host}`);

const studio = await Studio.open({ home: kairosHome(), templateDir });
const camera = new Camera(findBrowser());

const app = Fastify({ logger: false, forceCloseConnections: true });
app.addHook("onRequest", requestGuard(uiHosts));

healthRoutes(app, { version: pkg.version, url, dev, filmPort });
workspaceRoutes(app, studio);
filmRoutes(app, studio);
eventRoutes(app, studio.events);
noteRoutes(app, { studio, camera, filmServerUrl: `http://${HOST}:${filmPort}` });

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
    Promise.allSettled([app.close(), filmServer.close(), camera.close()]).finally(() =>
      process.exit(0),
    );
  });
}
