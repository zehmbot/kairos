import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import type { EventBus } from "../events.ts";

/** GET /api/events: a Server-Sent Events stream of hub events (film changes, workspace changes). */
export function eventRoutes(app: FastifyInstance, bus: EventBus): void {
  const streams = new Set<ServerResponse>();

  app.addHook("onClose", async () => {
    for (const stream of streams) stream.end();
  });

  app.get("/api/events", (request, reply) => {
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    stream.write(": connected\n\n");

    const unsubscribe = bus.subscribe((event) => {
      stream.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    // Comments keep the connection open through proxies that drop idle streams.
    const ping = setInterval(() => stream.write(": ping\n\n"), 25_000);
    streams.add(stream);

    request.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
      streams.delete(stream);
    });
  });
}
