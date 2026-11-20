/**
 * The Kairos tools for Claude Code (an MCP server). They let Claude see the user's frame notes with their
 * pictures, look at any frame, mark notes fixed and change film settings. Everything goes through the hub.
 */
import { isAbsolute, join, relative, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { formatSize } from "../shared/media.ts";
import { DEV_WEB_PORT, HOST } from "../shared/ports.ts";
import { scriptLineStatus } from "../shared/script.ts";
import {
  type Asset,
  FilmStatusSchema,
  type FilmSummary,
  FpsSchema,
  LINE_ID_PATTERN,
  type Note,
  type NoteShape,
  NoteStatusSchema,
  type VoiceType,
  VoiceTypeSchema,
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
const image = (bytes: Buffer, mimeType = "image/png") => ({
  type: "image" as const,
  data: bytes.toString("base64"),
  mimeType,
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
          const references = (await hub.references(id)).length;
          if (references) {
            lines.push(
              `References: ${references} (look at them with kairos_references before building)`,
            );
          }
          const script = await hub.script(id).catch(() => null);
          if (script?.lines.length) {
            lines.push(
              `Script: ${script.lines.length} line${script.lines.length === 1 ? "" : "s"} (read it with kairos_script)`,
            );
          }
          const clips = summary.config.video;
          if (clips.length) {
            lines.push(
              `Video clips over the film: ${clips
                .map((clip) => `${clip.file} at ${seconds(clip.start)}`)
                .join(", ")} (kairos.json "video")`,
            );
          }
          const speakers = Object.keys(summary.config.voices ?? {});
          const spoken = speakers.length ? (await hub.lines(id)).length : 0;
          if (speakers.length) {
            lines.push(
              `Voices: ${speakers.join(", ")}; ${spoken} spoken line${spoken === 1 ? "" : "s"} in voice/ (word timings in voice/*.words.json, or kairos_words)`,
            );
          }
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
      const { png, length } = await hub.frame(id, t);
      const config = summary.config;
      const where = config
        ? ` (frame ${frameNumber(t, config.fps)} of ${Math.max(1, Math.round(config.duration * config.fps))})`
        : "";
      // A film that times itself (Blocky follows its voices) says how long its story lasts.
      const story = length !== null ? Math.round(length * 10) / 10 : null;
      const fit =
        story !== null && config && Math.abs(story - config.duration) >= 0.05
          ? `\nNote: the story lasts ${seconds(story)}, but the film is ${seconds(config.duration)} long. Set duration to ${story} with kairos_film_settings.`
          : "";
      return { content: [text(`"${id}" at t = ${seconds(t)}${where}:${fit}`), image(png)] };
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

  server.registerTool(
    "kairos_assets",
    {
      title: "List the user's assets",
      description:
        "The user's asset library: images, videos, sounds and fonts shared by all films. Use one in a film with kairos_use_asset.",
      inputSchema: {
        kind: z
          .enum(["image", "video", "sound", "font"])
          .optional()
          .describe("Only this kind of file."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async ({ kind }: { kind?: Asset["kind"] }) => {
      const assets = (await hub.assets()).filter((asset) => !kind || asset.kind === kind);
      if (assets.length === 0) {
        return {
          content: [
            text(
              kind
                ? `No ${kind} files in the asset library.`
                : "The asset library is empty. The user adds files on the Assets page in Kairos.",
            ),
          ],
        };
      }
      const lines = assets.map((asset) => `${asset.id} (${asset.kind}, ${formatSize(asset.size)})`);
      return {
        content: [
          text(
            `${lines.join("\n")}\n\nUse one in the film with kairos_use_asset (its id, like "${assets[0]?.id}").`,
          ),
        ],
      };
    }),
  );

  server.registerTool(
    "kairos_use_asset",
    {
      title: "Use an asset in a film",
      description:
        "Copies a file from the user's asset library into the film folder and gives its path. Images, videos and fonts go to assets/<kind>/; a sound becomes a sound track in kairos.json (starting at `start` seconds). With `start`, a video or a picture also goes on the timeline as a video clip over the film (kairos.json `video`: change its size, place, fit, opacity or length there).",
      inputSchema: {
        asset: z.string().describe('The asset id from kairos_assets, like "images/logo.png".'),
        start: z
          .number()
          .min(0)
          .optional()
          .describe(
            "For sounds: when the track starts, in seconds. For videos and pictures: put it on the timeline from then.",
          ),
        film: filmArg,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(async ({ asset, start, film }: { asset: string; start?: number; film?: string }) => {
      const id = await filmId(film);
      const path = await hub.useAsset(asset, id, start);
      const sound = path.startsWith("audio/");
      const clip = !sound && start !== undefined && /^assets\/(videos|images)\//.test(path);
      return {
        content: [
          text(
            sound
              ? `Added ${path} as a sound track starting at ${seconds(start ?? 0)}. Kairos plays it with the preview and mixes it into the video.`
              : clip
                ? `Added ${path} as a video clip over the film from ${seconds(start ?? 0)} (kairos.json "video"). Kairos draws it in the preview, the frames and the video.`
                : `Copied to ${path} in the film folder. Load it from the film page with that path.`,
          ),
        ],
      };
    }),
  );

  server.registerTool(
    "kairos_references",
    {
      title: "Look at the film's references",
      description:
        "The videos and pictures the user added as references for this film, with what to take from each (their note). For videos: length, size, number of shots and shot lengths, plus frame sheets (one picture from the middle of each shot, left to right, top to bottom). Look at them before building or restyling the film.",
      inputSchema: {
        film: filmArg,
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Sheets come in pages of 6 pictures; start with 1."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safely(async ({ film, page = 1 }: { film?: string; page?: number }) => {
      const id = await filmId(film);
      const references = await hub.references(id);
      if (references.length === 0) {
        return {
          content: [
            text(
              "This film has no references. The user adds them in the References panel on the film page.",
            ),
          ],
        };
      }
      const lines: string[] = [];
      const sheets: { ref: string; n: number; label: string }[] = [];
      for (const [i, reference] of references.entries()) {
        const name = reference.file.split("/").pop() ?? reference.file;
        lines.push(`Reference ${i + 1}: ${name} (${reference.kind})`);
        lines.push(
          `  What to take from it: ${reference.note.trim() || "(no note: ask the user, or take the overall style)"}`,
        );
        if (reference.status === "processing")
          lines.push("  Kairos is still looking inside it. Ask again in a moment.");
        if (reference.status === "failed") lines.push(`  Problem: ${reference.problem}`);
        const info = reference.info;
        if (info) {
          lines.push(
            `  ${info.width}×${info.height}${info.fps ? `, ${info.fps} fps` : ""}, ${seconds(info.duration)}, ${info.shots.length} shots: typical ${seconds(info.medianShot)}, shortest ${seconds(info.shortestShot)}, longest ${seconds(info.longestShot)}.`,
          );
          lines.push(
            `  Shot starts: ${info.shots.map((t, s) => `${s + 1}@${t.toFixed(1)}s`).join(", ")}`,
          );
        }
        const perSheet = info ? (info.height > info.width ? 18 : 12) : 1;
        for (let n = 1; n <= reference.sheets; n++) {
          const shots = info?.pictured.slice((n - 1) * perSheet, n * perSheet) ?? [];
          sheets.push({
            ref: reference.id,
            n,
            label: info
              ? `Reference ${i + 1}, sheet ${n}: shots ${shots.join(", ")} (left to right, top to bottom).`
              : `Reference ${i + 1}: the picture.`,
          });
        }
      }
      const PER_PAGE = 6;
      const pages = Math.max(1, Math.ceil(sheets.length / PER_PAGE));
      const shown = sheets.slice((page - 1) * PER_PAGE, page * PER_PAGE);
      const content: CallToolResult["content"] = [text(lines.join("\n"))];
      for (const sheet of shown) {
        content.push(text(sheet.label));
        content.push(image(await hub.referenceSheet(id, sheet.ref, sheet.n), "image/jpeg"));
      }
      if (sheets.length) {
        content.push(
          text(
            pages > page
              ? `Page ${page} of ${pages}. Ask for page ${page + 1} to see more sheets.`
              : `Page ${page} of ${pages}.`,
          ),
        );
      }
      return { content };
    }),
  );

  const wordList = (words: readonly { text: string; start: number }[], shift = 0) =>
    words.map((word) => `${word.text}@${(word.start + shift).toFixed(2)}`).join(" ");

  server.registerTool(
    "kairos_voices",
    {
      title: "Film voices",
      description:
        "Who speaks in the film (speaker name → fish.audio voice and type). `cast` gives speakers voices automatically by type (free: narrator, woman, man, girl, boy, old-woman, old-man); speakers that have a voice keep it, and characters keep their voice from film to film. The library: search with `query`, or `mine` for the user's own voices; `choose` sets one voice yourself.",
      inputSchema: {
        film: filmArg,
        cast: z
          .array(
            z.object({
              speaker: z
                .string()
                .describe('A speaker name: small letters, like "narrator" or "ruby".'),
              type: VoiceTypeSchema.describe("Who the speaker is."),
            }),
          )
          .optional()
          .describe(
            "Speakers and their types: Kairos picks a fitting voice for each one without a voice.",
          ),
        query: z.string().optional().describe("Search the voice library by name."),
        mine: z.boolean().optional().describe("List the user's own (cloned) voices."),
        choose: z
          .object({
            speaker: z
              .string()
              .describe('A speaker name: small letters, like "narrator" or "ruby".'),
            id: z.string().describe("The voice id from the library."),
            name: z.string().describe("The voice's name."),
          })
          .optional()
          .describe("Give a speaker this voice."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safely(
      async ({
        film,
        cast,
        query,
        mine,
        choose,
      }: {
        film?: string;
        cast?: { speaker: string; type: VoiceType }[];
        query?: string;
        mine?: boolean;
        choose?: { speaker: string; id: string; name: string };
      }) => {
        const id = await filmId(film);
        let voices = await hub.filmVoices(id);
        const problems: string[] = [];
        if (cast?.length) {
          const result = await hub.cast(id, cast);
          voices = result.voices;
          problems.push(...result.problems);
        }
        if (choose) {
          voices = await hub.setFilmVoices(id, {
            ...voices,
            [choose.speaker]: {
              ...voices[choose.speaker],
              id: choose.id,
              name: choose.name,
              auto: false,
            },
          });
        }
        const lines = [
          Object.keys(voices).length
            ? `Speakers: ${Object.entries(voices)
                .map(
                  ([speaker, voice]) =>
                    `${speaker}${voice.type ? ` (${voice.type})` : ""} = ${voice.name} (${voice.id})`,
                )
                .join("; ")}`
            : "No speakers yet: cast them by type with `cast`.",
          ...problems,
        ];
        if (query !== undefined || mine) {
          const found = await hub.voiceLibrary(query ?? "", Boolean(mine));
          lines.push(
            found.length
              ? found
                  .map(
                    (voice) =>
                      `${voice.id}: ${voice.name}${voice.author ? ` by ${voice.author}` : ""}${voice.languages.length ? ` [${voice.languages.join(", ")}]` : ""}${voice.description ? ` - ${voice.description.slice(0, 120)}` : ""}`,
                  )
                  .join("\n")
              : "No voices found.",
          );
        }
        return { content: [text(lines.join("\n"))] };
      },
    ),
  );

  server.registerTool(
    "kairos_say",
    {
      title: "Make spoken lines",
      description:
        "Makes speech with fish.audio for a speaker (one file per line, with word timings) and places the lines on the film's timeline one after the other. Costs the user's fish.audio credits: only when the user asked for a voice. The same line again is reused, not paid twice. Answers with each line's file, start, length and words (word@seconds on the film).",
      inputSchema: {
        film: filmArg,
        speaker: z
          .string()
          .optional()
          .describe('Who speaks (default "narrator"); give it a voice with kairos_voices.'),
        lines: z.array(z.string()).min(1).describe("The words of each line, in order."),
        speed: z.number().min(0.5).max(2).optional().describe("1 = normal speed."),
        start: z
          .number()
          .min(0)
          .optional()
          .describe(
            "Where the first line starts on the film (seconds). Default: after the voice lines already there.",
          ),
        gap: z
          .number()
          .min(0)
          .max(10)
          .optional()
          .describe("Silence between lines, in seconds (default 0.3)."),
        place: z
          .boolean()
          .optional()
          .describe("false: make the files only, don't put them on the timeline."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safely(
      async (args: {
        film?: string;
        speaker?: string;
        lines: string[];
        speed?: number;
        start?: number;
        gap?: number;
        place?: boolean;
      }) => {
        const id = await filmId(args.film);
        const gap = args.gap ?? 0.3;
        let start = args.start;
        if (args.place !== false && start === undefined) {
          // After the voice lines already on the timeline.
          const known = await hub.lines(id);
          const audio = (await hub.film(id)).config?.audio ?? [];
          const ends = audio
            .filter((track) => track.file.startsWith("voice/"))
            .map(
              (track) =>
                track.start +
                (track.length ?? known.find((line) => line.file === track.file)?.duration ?? 0),
            );
          start = ends.length ? Math.round((Math.max(...ends) + gap) * 100) / 100 : 0;
        }
        const made = await hub.makeLines(id, {
          speaker: args.speaker ?? "narrator",
          lines: args.lines,
          speed: args.speed ?? 1,
          gap,
          by: "claude",
          ...(args.place === false ? {} : { start }),
        });
        const report = made.lines.map((line, i) => {
          const at = made.placed[i];
          return `${i + 1}. ${line.file}, ${seconds(line.duration)}${at ? `, starts at ${seconds(at.start)}` : ""}\n   ${wordList(line.words, at?.start ?? 0)}`;
        });
        const end = made.placed.at(-1);
        return {
          content: [
            text(
              `${report.join("\n")}${end ? `\nThe last line ends at ${seconds(end.start + end.duration)}. Make the film at least that long (kairos_film_settings).` : ""}`,
            ),
          ],
        };
      },
    ),
  );

  server.registerTool(
    "kairos_words",
    {
      title: "Word timings of a sound",
      description:
        "Each word of a sound in the film and when it is said (seconds into the file). Lines made with kairos_say have them already; for a recording, Kairos asks fish.audio speech-to-text (uses credits) when `transcribe` is true. Use them to time captions and mouths to the voice.",
      inputSchema: {
        film: filmArg,
        file: z
          .string()
          .describe('The sound file in the film folder, like "voice/narrator-1.mp3".'),
        transcribe: z
          .boolean()
          .optional()
          .describe("Ask fish.audio when there are no timings yet."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safely(
      async ({ film, file, transcribe }: { film?: string; file: string; transcribe?: boolean }) => {
        const id = await filmId(film);
        const found = await hub.words(id, file, Boolean(transcribe)).catch((error: unknown) => {
          if (error instanceof HubError && error.status === 404 && !transcribe) {
            throw new ToolProblem(
              `${file} has no word timings yet. Call kairos_words again with transcribe: true to find them with fish.audio speech-to-text (uses the user's credits).`,
            );
          }
          throw error;
        });
        return {
          content: [
            text(
              `"${found.text}" (${seconds(found.duration)}, ${found.source === "speech" ? "made with the voice" : "from speech-to-text"})\n${wordList(found.words)}`,
            ),
          ],
        };
      },
    ),
  );

  server.registerTool(
    "kairos_script",
    {
      title: "The film's script",
      description:
        "What the voices say and when (voice/script.json). Without arguments: the script, each line with its start, speaker, words and whether its voice is made. `lines` replaces the script (each line: speaker, text, start in seconds on the film; lines in time order, short enough to end before the next one, about 2.5 words per second). `make: true` makes the voices with fish.audio (uses the user's credits; unchanged lines are reused) and places each at its start, after the line before when they would overlap; it answers with each line's real start, length and words. Give speakers voices first (kairos_voices with cast).",
      inputSchema: {
        film: filmArg,
        lines: z
          .array(
            z.object({
              id: z
                .string()
                .regex(LINE_ID_PATTERN)
                .optional()
                .describe(
                  'A short key for the line, like "joke". In a Blocky film, the same as the shot\'s `line` in story.js, so the shot follows its voice. It stays when the line changes.',
                ),
              speaker: z.string().describe('"narrator", or a character in small letters.'),
              text: z.string().describe("The words."),
              start: z.number().min(0).describe("When it starts on the film, in seconds."),
            }),
          )
          .optional()
          .describe("The whole script, replacing the one there."),
        style: z.string().optional().describe("How it sounds (storyteller, funny...)."),
        language: z.string().optional().describe('A fish.audio language code (default "en").'),
        note: z.string().optional().describe("A short note for the user about the script."),
        make: z.boolean().optional().describe("Make the voices now (uses credits)."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    safely(
      async (args: {
        film?: string;
        lines?: { id?: string; speaker: string; text: string; start: number }[];
        style?: string;
        language?: string;
        note?: string;
        make?: boolean;
      }) => {
        const id = await filmId(args.film);
        const out: string[] = [];
        if (args.lines) {
          // A line the user wrote (same speaker and words) stays theirs, with its voice.
          const before = (await hub.script(id))?.lines ?? [];
          const lines = args.lines.map((line) => {
            const same = before.find(
              (entry) => entry.speaker === line.speaker && entry.text === line.text.trim(),
            );
            return same ? { ...same, id: line.id ?? same.id, start: line.start } : line;
          });
          const saved = await hub.saveScript(id, {
            writtenBy: "claude",
            style: args.style,
            language: args.language,
            note: args.note,
            lines,
          });
          out.push(
            `Saved the script: ${saved.lines.length} line${saved.lines.length === 1 ? "" : "s"}.`,
          );
        }
        if (args.make) {
          const made = await hub.makeScript(id);
          out.push(
            `Made ${made.made} voice${made.made === 1 ? "" : "s"}${made.reused ? `, reused ${made.reused}` : ""}:`,
          );
          for (const at of made.placed) {
            out.push(
              `- ${at.speaker} at ${seconds(at.start)}, ${seconds(at.duration)} (${at.file})\n  ${wordList(at.words, at.start)}`,
            );
          }
          const end = Math.max(0, ...made.placed.map((at) => at.start + at.duration));
          if (made.placed.length) out.push(`The voices end at ${seconds(end)}.`);
          out.push(...made.warnings.map((warning) => `Note: ${warning}`));
          return { content: [text(out.join("\n"))] };
        }
        const script = await hub.script(id);
        if (!script) {
          out.push("This film has no script yet. Write one with `lines`.");
          return { content: [text(out.join("\n"))] };
        }
        const [made, voices, film] = await Promise.all([
          hub.lines(id),
          hub.filmVoices(id),
          hub.film(id),
        ]);
        const words = {
          made: "voice made",
          changed: "changed since its voice was made",
          new: "no voice yet",
          "no-voice": "the speaker has no voice",
          off: "voice made, not on the timeline",
        };
        out.push(
          `Script (${script.language}${script.style ? `, ${script.style}` : ""}). Lines marked "by the user" are theirs: keep them unless they ask.`,
        );
        for (const line of [...script.lines].sort((a, b) => a.start - b.start)) {
          const status = scriptLineStatus(line, made, voices, film.config?.audio);
          const speed = line.speed !== 1 ? `, speed ${line.speed}` : "";
          out.push(
            `- [${line.id}] ${seconds(line.start)} ${line.speaker}: "${line.text}" (${line.by === "you" ? "by the user" : "by Claude"}, ${words[status]}${speed})`,
          );
        }
        if (script.note) out.push(`Note: ${script.note}`);
        return { content: [text(out.join("\n"))] };
      },
    ),
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
