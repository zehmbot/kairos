/**
 * The Kairos tools for Claude Code (an MCP server). They let Claude see the user's frame notes with their
 * pictures, look at any frame, mark notes fixed and change film settings. Everything goes through the hub.
 */
import { isAbsolute, join, relative, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DEV_WEB_PORT, HOST } from "../shared/ports.ts";
import {
  FilmStatusSchema,
  type FilmSummary,
  FpsSchema,
  type Note,
  type NoteShape,
  NoteStatusSchema,
} from "../shared/types.ts";
import { type Hub, HubError, HubOfflineError } from "./hub-client.ts";

export interface ToolContext {
  hub: Hub;
  /** Folder Claude Code runs in: inside a film folder, that film is the default. */
  cwd: string;
  openUrl(url: string): void;
  /** The Kairos folder, to tell the user how to start it. */
  kairosDir: string;
  version: string;
}

/** Most note pictures in one answer: each costs about 1,200 tokens, and Claude Code allows 25,000. */
export const MAX_NOTES = 12;
const DEFAULT_NOTES = 6;

const INSTRUCTIONS = `Kairos is the local studio where the user previews and reviews this video. A film is a folder with
kairos.json (title, width, height, fps, duration in seconds, status) and a web page whose window.renderOut(t)
draws the frame at time t (seconds). Kairos reloads the preview every time a file is saved.

The user leaves frame notes: a time (or time range), marks drawn on the frame (point, box, arrow, freehand,
in film pixels) and a text saying what should change. Each note has a picture of the marked frame.

Use these tools when the user asks to fix notes, review the film, or check how a frame looks:
1. kairos_notes: read the open notes, with their pictures. Start here when asked to "fix the notes".
2. Edit the film files to make the change.
3. kairos_frame: look at the frame again to check the result (and to catch errors the film throws).
4. kairos_note_update: mark the note "fixed" once it is done. Never edit the .kairos folder by hand.
Tools default to the film whose folder Claude Code runs in; pass "film" (an id from kairos_films) otherwise.`;

/** Tool input: which film. */
const filmArg = z
  .string()
  .optional()
  .describe("Film id (its folder name). Leave out to use the film this session runs in.");

class ToolProblem extends Error {}

const text = (value: string) => ({ type: "text" as const, text: value });
const image = (png: Buffer) => ({
  type: "image" as const,
  data: png.toString("base64"),
  mimeType: "image/png",
});
const problem = (message: string): CallToolResult => ({ content: [text(message)], isError: true });

const seconds = (t: number) => `${Number(t.toFixed(3))} s`;

/** Frame number (from 1) showing at time `t`. */
const frameNumber = (t: number, fps: number) => Math.floor(t * fps + 1e-6) + 1;

function describeShape(shape: NoteShape): string {
  switch (shape.type) {
    case "point":
      return `point at (${shape.x}, ${shape.y})`;
    case "box":
      return `box from (${shape.x}, ${shape.y}), ${shape.w} wide and ${shape.h} high`;
    case "arrow":
      return `arrow from (${shape.x1}, ${shape.y1}) pointing to (${shape.x2}, ${shape.y2})`;
    case "pen": {
      const xs = shape.points.map((point) => point[0]);
      const ys = shape.points.map((point) => point[1]);
      return `freehand line inside (${Math.min(...xs)}, ${Math.min(...ys)}) to (${Math.max(...xs)}, ${Math.max(...ys)})`;
    }
  }
}

function describeFilm(film: FilmSummary): string {
  const { config } = film;
  if (!config) return `${film.id}: can't be read (${film.problem ?? "unknown problem"})`;
  const frames = Math.max(1, Math.round(config.duration * config.fps));
  const problemText = film.problem ? `\n  Problem: ${film.problem}` : "";
  return `${film.id}: "${config.title}", ${config.width}×${config.height}, ${config.fps} fps, ${seconds(config.duration)} (${frames} frames), status ${config.status}${problemText}`;
}

export function createKairosServer(context: ToolContext): McpServer {
  const { hub } = context;
  const server = new McpServer(
    { name: "kairos", title: "Kairos", version: context.version },
    { instructions: INSTRUCTIONS },
  );

  /** The film id from the tool input, or from the folder Claude Code runs in. */
  async function filmId(explicit: string | undefined): Promise<string> {
    if (explicit) return explicit;
    const workspace = await hub.workspace();
    if (workspace.path) {
      const rel = relative(join(workspace.path, "films"), context.cwd);
      const first = rel.split(sep)[0];
      if (rel && first && first !== ".." && !isAbsolute(rel)) return first;
    }
    throw new ToolProblem(
      'Which film? This session isn\'t inside a film folder. Pass "film" with an id from kairos_films.',
    );
  }

  async function uiUrl(): Promise<string> {
    const health = await hub.health();
    return health.dev ? `http://${HOST}:${DEV_WEB_PORT}` : health.url;
  }

  /** Runs a tool and turns the usual failures into plain answers Claude can act on. */
  const safely =
    <A>(run: (args: A) => Promise<CallToolResult>) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        return await run(args);
      } catch (error) {
        if (error instanceof HubOfflineError) {
          return problem(
            `Kairos isn't running. Ask the user to start it: run "npm run dev" (or "npm start") in ${context.kairosDir}, then try again.`,
          );
        }
        if (error instanceof HubError || error instanceof ToolProblem)
          return problem(error.message);
        throw error;
      }
    };

  server.registerTool(
    "kairos_status",
    {
      title: "Kairos status",
      description:
        "Is Kairos running, which workspace it uses, and the film this session works on (size, fps, length, problems, open notes).",
      inputSchema: { film: filmArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async ({ film }: { film?: string }) => {
      const health = await hub.health();
      const workspace = await hub.workspace();
      const lines = [
        `Kairos ${health.version} is running.`,
        `Workspace: ${workspace.path ?? "not chosen yet"}`,
      ];
      let id: string | null = null;
      try {
        id = await filmId(film);
      } catch (error) {
        if (!(error instanceof ToolProblem)) throw error;
        lines.push("This session isn't inside a film folder. See kairos_films.");
      }
      if (id) {
        const summary = await hub.film(id);
        lines.push(`Film: ${describeFilm(summary)}`);
        if (summary.hasBrief)
          lines.push(
            "Brief: brief.md in the film folder (what the user asked for: read it first).",
          );
        if (summary.config) {
          const open = (await hub.notes(id)).filter((note) => note.status === "open").length;
          lines.push(`Open notes: ${open}${open ? " (read them with kairos_notes)" : ""}`);
        }
        lines.push(`Preview: ${await uiUrl()}/films/${encodeURIComponent(id)}`);
      }
      return { content: [text(lines.join("\n"))] };
    }),
  );

  server.registerTool(
    "kairos_films",
    {
      title: "List films",
      description:
        "Lists the films in the Kairos workspace, with their size, frame rate and length.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async () => {
      const films = await hub.films();
      if (films.length === 0) return { content: [text("The workspace has no films yet.")] };
      return { content: [text(films.map(describeFilm).join("\n"))] };
    }),
  );

  server.registerTool(
    "kairos_notes",
    {
      title: "Read frame notes",
      description:
        "The user's frame notes on a film, each with its time, text, the marks drawn on the frame (in film pixels) and a picture of the marked frame. Start here when asked to fix notes.",
      inputSchema: {
        film: filmArg,
        status: z
          .enum(["open", "fixed", "all"])
          .default("open")
          .describe('Which notes: "open" (to do), "fixed", or "all".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_NOTES)
          .default(DEFAULT_NOTES)
          .describe(`How many notes (with pictures) to return, up to ${MAX_NOTES}.`),
        offset: z.number().int().min(0).default(0).describe("Skip this many notes (for paging)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(
      async (args: {
        film?: string;
        status: "open" | "fixed" | "all";
        limit: number;
        offset: number;
      }) => {
        const id = await filmId(args.film);
        const summary = await hub.film(id);
        const fps = summary.config?.fps ?? 30;
        const all = (await hub.notes(id))
          .filter((note) => args.status === "all" || note.status === args.status)
          .sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt));
        const page = all.slice(args.offset, args.offset + args.limit);
        const which = args.status === "all" ? "" : `${args.status} `;
        if (page.length === 0) {
          return {
            content: [text(all.length ? `No more ${which}notes.` : `No ${which}notes on "${id}".`)],
          };
        }
        const size = summary.config ? `${summary.config.width}×${summary.config.height}` : "";
        const content: CallToolResult["content"] = [
          text(
            `${all.length} ${which}note${all.length === 1 ? "" : "s"} on "${id}"${size ? ` (${size} film pixels)` : ""}. Showing ${args.offset + 1} to ${args.offset + page.length}.`,
          ),
        ];
        for (const note of page) {
          content.push(text(describeNote(note, fps)));
          if (note.image) {
            try {
              content.push(image(await hub.noteImage(id, note)));
            } catch (error) {
              if (error instanceof HubOfflineError) throw error;
              content.push(text("(The picture of this note can't be read.)"));
            }
          } else {
            content.push(text("(No picture yet.)"));
          }
        }
        if (args.offset + page.length < all.length) {
          content.push(text(`More notes: call again with offset ${args.offset + page.length}.`));
        }
        return { content };
      },
    ),
  );

  server.registerTool(
    "kairos_frame",
    {
      title: "Look at a frame",
      description:
        "A fresh picture of the frame at time t (seconds), drawn by the film right now. Use it to check a change. If the film throws while drawing, the error comes back as text.",
      inputSchema: {
        film: filmArg,
        t: z.number().min(0).describe("Time of the frame, in seconds from the start."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async ({ film, t }: { film?: string; t: number }) => {
      const id = await filmId(film);
      const summary = await hub.film(id);
      const png = await hub.frame(id, t);
      const config = summary.config;
      const where = config
        ? ` (frame ${frameNumber(t, config.fps)} of ${Math.max(1, Math.round(config.duration * config.fps))})`
        : "";
      return { content: [text(`"${id}" at t = ${seconds(t)}${where}:`), image(png)] };
    }),
  );

  server.registerTool(
    "kairos_note_update",
    {
      title: "Mark a note fixed",
      description: 'Marks a frame note "fixed" once the change is done, or "open" again.',
      inputSchema: {
        film: filmArg,
        note: z.string().describe('Note id, like "n_k3x9q2", from kairos_notes.'),
        status: NoteStatusSchema.describe('"fixed" when done, "open" to reopen.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    safely(
      async ({ film, note, status }: { film?: string; note: string; status: "open" | "fixed" }) => {
        const id = await filmId(film);
        const updated = await hub.updateNote(id, note, status);
        return { content: [text(`Note ${updated.id} on "${id}" is now ${updated.status}.`)] };
      },
    ),
  );

  server.registerTool(
    "kairos_film_settings",
    {
      title: "Change film settings",
      description:
        "Changes the film's title, length (seconds), frame rate (1 to 120) or status in kairos.json, with checks. Keep constants in the film's code in step with the new values.",
      inputSchema: {
        film: filmArg,
        title: z.string().min(1).max(80).optional(),
        duration: z.number().positive().optional().describe("Length in seconds."),
        fps: FpsSchema.optional(),
        status: FilmStatusSchema.optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    safely(
      async (args: {
        film?: string;
        title?: string;
        duration?: number;
        fps?: number;
        status?: "draft" | "review" | "approved" | "published" | "archived";
      }) => {
        const { film, ...change } = args;
        const entries = Object.entries(change).filter(([, value]) => value !== undefined);
        if (entries.length === 0)
          return problem("Say what to change: title, duration, fps or status.");
        const id = await filmId(film);
        const updated = await hub.changeFilm(id, Object.fromEntries(entries));
        return { content: [text(`Saved. ${describeFilm(updated)}`)] };
      },
    ),
  );

  server.registerTool(
    "kairos_open_preview",
    {
      title: "Open the preview",
      description: "Opens the film in Kairos in the user's browser, to show them the result.",
      inputSchema: { film: filmArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async ({ film }: { film?: string }) => {
      const id = await filmId(film);
      await hub.film(id);
      const url = `${await uiUrl()}/films/${encodeURIComponent(id)}`;
      context.openUrl(url);
      return { content: [text(`Opened ${url} in the browser.`)] };
    }),
  );

  server.registerTool(
    "kairos_render",
    {
      title: "Render a video",
      description:
        "Puts the film in the Kairos render queue to make an MP4 (in the film's renders/ folder). Rendering draws every frame and takes a while: check on it with kairos_renders. Render when the user asks for a video, not to check a frame (use kairos_frame for that).",
      inputSchema: {
        film: filmArg,
        quality: z
          .enum(["high", "small"])
          .default("high")
          .describe('"high" looks like the film; "small" makes a smaller file.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    safely(async ({ film, quality }: { film?: string; quality: "high" | "small" }) => {
      const id = await filmId(film);
      const job = await hub.startRender(id, quality);
      return {
        content: [
          text(
            `Render ${job.id} of "${id}" is ${job.state === "queued" ? "in the queue" : "running"}: ${job.total} frames. The user can follow it on the Renders page; check with kairos_renders.`,
          ),
        ],
      };
    }),
  );

  server.registerTool(
    "kairos_renders",
    {
      title: "Renders",
      description:
        "Renders that are running or waiting (with progress), recent failures with their reason, and the finished videos of a film.",
      inputSchema: { film: filmArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async ({ film }: { film?: string }) => {
      let id: string | null = null;
      try {
        id = await filmId(film);
      } catch (error) {
        if (!(error instanceof ToolProblem)) throw error;
      }
      const overview = await hub.renders();
      const jobs = overview.jobs.filter((job) => !id || job.filmId === id);
      const videos = overview.videos.filter((video) => !id || video.filmId === id);
      const lines: string[] = [];
      for (const job of jobs) {
        const where =
          job.state === "running"
            ? `rendering, ${job.done} of ${job.total} frames`
            : job.state === "failed"
              ? `failed: ${job.error}`
              : job.state === "done"
                ? `done (version ${job.version})`
                : job.state;
        lines.push(`Render ${job.id} of "${job.filmId}": ${where}`);
      }
      for (const video of videos.slice(0, 10)) {
        lines.push(
          `Video "${video.filmId}" v${video.version}: ${video.file}, ${video.width}×${video.height}, ${video.fps} fps, ${seconds(video.duration)}, made ${video.createdAt}`,
        );
      }
      return { content: [text(lines.length ? lines.join("\n") : "No renders yet.")] };
    }),
  );

  return server;
}

function describeNote(note: Note, fps: number): string {
  const when =
    note.until === null
      ? `t = ${seconds(note.t)} (frame ${frameNumber(note.t, fps)})`
      : `t = ${seconds(note.t)} to ${seconds(note.until)} (frames ${frameNumber(note.t, fps)} to ${frameNumber(note.until, fps)})`;
  const marks = note.shapes.length
    ? `Marks: ${note.shapes.map(describeShape).join("; ")}.`
    : "No marks drawn.";
  return `Note ${note.id} (${note.status}), ${when}:\n"${note.text}"\n${marks}`;
}
