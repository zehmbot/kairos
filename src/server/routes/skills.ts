import { homedir } from "node:os";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  NewSkillSchema,
  type PickSkillResult,
  SKILL_NAME_PATTERN,
  type Skill,
} from "../../shared/types.ts";
import { pickFolder } from "../folder-picker.ts";
import { openFolder } from "../open-folder.ts";
import { SkillError, type Skills } from "../skills.ts";
import { sendError } from "./errors.ts";

export const SKILL_PICKER_TITLE = "Choose a skill folder (the one that holds SKILL.md)";

export interface SkillRoutesOptions {
  pick?: typeof pickFolder;
  open?: (path: string) => void;
}

interface NameParams {
  name: string;
}

/** The Skills page: Kairos skills and the user's own, on or off in Claude Code. */
export function skillRoutes(
  app: FastifyInstance,
  skills: Skills,
  options: SkillRoutesOptions = {},
): void {
  const pick = options.pick ?? pickFolder;
  const open = options.open ?? openFolder;

  /** Runs a change, then answers with the new list. Skill problems become plain-words 409s. */
  async function change(
    reply: FastifyReply,
    action: () => Promise<unknown>,
  ): Promise<Skill[] | FastifyReply> {
    try {
      await action();
    } catch (error) {
      if (error instanceof SkillError) return sendError(reply, 409, "skill", error.message);
      throw error;
    }
    return skills.list();
  }

  const badName = (reply: FastifyReply) =>
    sendError(reply, 404, "not-found", "There's no skill with this name.");

  app.get("/api/skills", async () => skills.list());

  for (const [path, action] of [
    ["on", (name: string) => skills.turnOn(name)],
    ["off", (name: string) => skills.turnOff(name)],
    ["update", (name: string) => skills.turnOn(name)],
  ] as const) {
    app.post<{ Params: NameParams }>(`/api/skills/:name/${path}`, async (request, reply) => {
      const { name } = request.params;
      if (!SKILL_NAME_PATTERN.test(name)) return badName(reply);
      return change(reply, () => action(name));
    });
  }

  app.delete<{ Params: NameParams }>("/api/skills/:name", async (request, reply) => {
    const { name } = request.params;
    if (!SKILL_NAME_PATTERN.test(name)) return badName(reply);
    return change(reply, () => skills.remove(name));
  });

  app.post<{ Params: NameParams }>("/api/skills/:name/open-folder", async (request, reply) => {
    const skill = (await skills.list()).find((entry) => entry.name === request.params.name);
    if (!skill) return badName(reply);
    open(skill.path);
    return reply.code(204).send();
  });

  app.post("/api/skills", async (request, reply) => {
    const body = NewSkillSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "bad-request", body.error.issues[0]?.message ?? "Bad request.");
    }
    const result = await change(reply, () => skills.create(body.data));
    return Array.isArray(result) ? reply.code(201).send(result) : result;
  });

  // Opens the system folder window and adds the chosen skill folder.
  let picking = false;
  app.post("/api/skills/pick", async (_request, reply) => {
    if (picking) {
      return sendError(
        reply,
        409,
        "busy",
        "The folder window is already open. Look for it on your screen.",
      );
    }
    picking = true;
    try {
      const result = await pick(SKILL_PICKER_TITLE, homedir());
      if (result.status === "picked") {
        const added = await change(reply, () => skills.addFolder(result.path));
        if (!Array.isArray(added)) return added;
      }
      const answer: PickSkillResult = { status: result.status };
      return answer;
    } catch (error) {
      return sendError(
        reply,
        500,
        "picker-failed",
        `Kairos could not open the folder window: ${(error as Error).message}`,
      );
    } finally {
      picking = false;
    }
  });
}
