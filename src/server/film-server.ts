/**
 * The film server shows film pages to the Kairos player.
 *
 * It runs on its own port, so films live on a different origin from the Kairos UI and API: film code
 * can't call the API (the hub's Origin check refuses this port). It only serves files inside film folders,
 * never caches (so live reload always gets fresh files), only lets Kairos embed films, and adds the bridge
 * script to each film page as it serves it.
 */
import { readFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { readFilmConfig } from "./films.ts";
import { allowedHostsFor, requestGuard } from "./security.ts";
import { isSafeFilmId, resolveInside } from "./workspace.ts";

export const BRIDGE_PATH = "/__kairos/bridge.js";
const bridgeDir = fileURLToPath(new URL("../film/", import.meta.url));

/** three.js for 3D films, one pinned version for preview, pictures and render (works offline). */
export const THREE_PATH = "/__kairos/lib/three/";
// "three" resolves to <package>/build/three.module.js.
const threeDir = dirname(dirname(fileURLToPath(import.meta.resolve("three"))));
/** Only these parts of the three.js package are served. */
const THREE_FOLDERS = ["build/", "examples/jsm/"];

/**
 * Rapier, the physics of Blocky Cinema: its deterministic build (the same results on every computer), one file
 * with its WebAssembly inside. Films map the package's own name to it with their import map.
 */
export const RAPIER_PATH = "/__kairos/lib/rapier/rapier.mjs";
const rapierFile = fileURLToPath(import.meta.resolve("@dimforge/rapier3d-deterministic-compat"));

export interface FilmServerOptions {
  /** Current films folder (it changes when the user picks another workspace). */
  filmsDir: () => string | null;
  port: number;
  /** Origins of the Kairos UI, the only pages allowed to embed and drive films. */
  parentOrigins: readonly string[];
}

/** Adds the bridge `<script>` as early as possible in the page, so it sees every error. */
export function injectBridge(html: string, parentOrigins: readonly string[]): string {
  const tag = `<script src="${BRIDGE_PATH}" data-parents="${parentOrigins.join(" ")}"></script>`;
  for (const pattern of [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i]) {
    const match = pattern.exec(html);
    if (match) {
      const at = match.index + match[0].length;
      return html.slice(0, at) + tag + html.slice(at);
    }
  }
  return tag + html;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
}

export async function buildFilmServer(options: FilmServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, forceCloseConnections: true });
  const frameAncestors = options.parentOrigins.join(" ");

  app.addHook("onRequest", requestGuard(allowedHostsFor([options.port])));
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "no-store");
    reply.header("content-security-policy", `frame-ancestors ${frameAncestors}`);
    reply.header("x-content-type-options", "nosniff");
    return payload;
  });

  await app.register(fastifyStatic, { root: bridgeDir, serve: false });

  app.get(BRIDGE_PATH, (_request, reply) => reply.sendFile("bridge.js"));

  // Films import three.js with an import map: "three" -> /__kairos/lib/three/build/three.module.js.
  app.get<{ Params: { "*": string } }>(`${THREE_PATH}*`, (request, reply) => {
    const path = request.params["*"];
    const file = resolveInside(threeDir, path);
    if (!file || !THREE_FOLDERS.some((folder) => path.startsWith(folder))) return notFound(reply);
    return reply.sendFile(relative(threeDir, file).split(sep).join("/"), threeDir);
  });
  app.get(RAPIER_PATH, (_request, reply) =>
    reply
      .type("text/javascript; charset=utf-8")
      .sendFile(basename(rapierFile), dirname(rapierFile)),
  );

  app.get("/", (_request, reply) =>
    reply
      .type("text/plain; charset=utf-8")
      .send("Kairos film server. Open your films from the Kairos app."),
  );

  // "/my-intro" -> "/my-intro/", so relative links in the page work. Only for real films.
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const filmsDir = options.filmsDir();
    const { id } = request.params;
    if (!filmsDir || !isSafeFilmId(id) || !(await readFilmConfig(join(filmsDir, id)))) {
      return notFound(reply);
    }
    return reply.redirect(`/${encodeURIComponent(id)}/`);
  });

  app.get<{ Params: { id: string; "*": string } }>("/:id/*", async (request, reply) => {
    const filmsDir = options.filmsDir();
    const { id } = request.params;
    if (!filmsDir || !isSafeFilmId(id)) return notFound(reply);

    const dir = join(filmsDir, id);
    const film = await readFilmConfig(dir);
    if (!film) return notFound(reply);

    const page = film.config?.page ?? "index.html";
    const file = resolveInside(dir, request.params["*"] || page);
    if (!file) return notFound(reply);

    // The film page, and other pages at the film's top level (a template's sheets), get the bridge.
    if (file === resolveInside(dir, page) || (/\.html?$/i.test(file) && dirname(file) === dir)) {
      const html = await readFile(file, "utf8").catch(() => null);
      if (html === null) return notFound(reply);
      return reply.type("text/html; charset=utf-8").send(injectBridge(html, options.parentOrigins));
    }
    return reply.sendFile(relative(dir, file).split(sep).join("/"), dir);
  });

  return app;
}
