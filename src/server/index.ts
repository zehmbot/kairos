import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import pkg from "../../package.json" with { type: "json" };
import { DEFAULT_HUB_PORT, DEV_WEB_PORT, HOST } from "../shared/ports.ts";
import { healthRoutes } from "./routes/health.ts";
import { allowedHostsFor, checkRequest } from "./security.ts";

const { values: args } = parseArgs({
  options: {
    dev: { type: "boolean", default: false },
    port: { type: "string" },
  },
});

const dev = args.dev;
const port = Number(args.port ?? process.env.KAIROS_PORT ?? DEFAULT_HUB_PORT);
const url = `http://${HOST}:${port}`;
const webDir = fileURLToPath(new URL("../../dist/web/", import.meta.url));

const app = Fastify({ logger: false });

// In dev, the Vite UI on DEV_WEB_PORT calls this API through its proxy.
const allowedHosts = allowedHostsFor(dev ? [port, DEV_WEB_PORT] : [port]);
app.addHook("onRequest", async (request, reply) => {
  const secFetchSite = request.headers["sec-fetch-site"];
  const result = checkRequest(
    {
      host: request.headers.host,
      origin: request.headers.origin,
      secFetchSite: typeof secFetchSite === "string" ? secFetchSite : undefined,
    },
    allowedHosts,
  );
  if (!result.ok) {
    return reply.code(403).send({ error: "forbidden", reason: result.reason });
  }
});

healthRoutes(app, { version: pkg.version, url, dev });

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

try {
  await app.listen({ host: HOST, port });
  console.log(`Kairos hub running at ${url}${dev ? " (dev)" : ""}`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Close the other app or set KAIROS_PORT.`);
  } else {
    console.error(error);
  }
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.close().finally(() => process.exit(0));
  });
}
