import type { FastifyInstance } from "fastify";
import type { SystemCheck } from "../../shared/types.ts";

/** POST /api/system/recheck: looks for ffmpeg and the browser again (the setup card's Check again). */
export function systemRoutes(
  app: FastifyInstance,
  options: { recheck: () => Promise<SystemCheck> },
): void {
  app.post("/api/system/recheck", async () => options.recheck());
}
