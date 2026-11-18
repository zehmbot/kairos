import type { FastifyInstance } from "fastify";
import type { Health } from "../../shared/types.ts";

export function healthRoutes(app: FastifyInstance, info: Omit<Health, "ok" | "name">): void {
  app.get("/api/health", async (): Promise<Health> => ({ ok: true, name: "kairos", ...info }));
}
