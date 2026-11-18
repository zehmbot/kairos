import type { FastifyReply } from "fastify";

/** Sends an API error. `message` is shown to the user as-is, so keep it plain and friendly. */
export function sendError(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}
