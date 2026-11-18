import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import type { FilmChange, FilmSummary, Note, NoteStatus } from "../shared/types.ts";
import { type Hub, HubError, HubOfflineError } from "./hub-client.ts";
import { createKairosServer, MAX_NOTES } from "./tools.ts";

const WORKSPACE = join("/", "ws");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const film = (id: string, extra: Partial<FilmSummary> = {}): FilmSummary => ({
  id,
  path: join(WORKSPACE, "films", id),
  config: {
    title: id.toUpperCase(),
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 5,
    status: "draft",
    page: "index.html",
  },
  problem: null,
  previewPath: `/${id}/index.html`,
  updatedAt: 0,
  ...extra,
});

const note = (id: string, t: number, extra: Partial<Note> = {}): Note => ({
  id,
  text: `Fix ${id}`,
  status: "open",
  t,
  until: null,
  shapes: [{ type: "box", x: 10, y: 20, w: 300, h: 200 }],
  image: `notes/${id}.png`,
  createdAt: "2026-11-18T10:00:00.000Z",
  updatedAt: "2026-11-18T10:00:00.000Z",
  ...extra,
});

class FakeHub implements Hub {
  offline = false;
  films_ = [film("intro"), film("outro")];
  notes_: Note[] = [];
  opened: string[] = [];
  frameError: string | null = null;
  changes: FilmChange[] = [];

  #check() {
    if (this.offline) throw new HubOfflineError("offline");
  }
  async health() {
    this.#check();
    return {
      ok: true as const,
      name: "kairos" as const,
      version: "0.0.0",
      url: "http://127.0.0.1:7340",
      dev: false,
      filmPort: 7342,
    };
  }
  async workspace() {
    this.#check();
    return { path: WORKSPACE, suggested: WORKSPACE };
  }
  async films() {
    this.#check();
    return this.films_;
  }
  async film(id: string) {
    this.#check();
    const found = this.films_.find((entry) => entry.id === id);
    if (!found) throw new HubError("This film doesn't exist (any more).", 404);
    return found;
  }
  async notes(id: string) {
    await this.film(id);
    return this.notes_;
  }
  async noteImage() {
    this.#check();
    return PNG;
  }
  async updateNote(_id: string, noteId: string, status: NoteStatus) {
    const found = this.notes_.find((entry) => entry.id === noteId);
    if (!found) throw new HubError("This note doesn't exist (any more).", 404);
    found.status = status;
    return found;
  }
  async frame() {
    this.#check();
    if (this.frameError) throw new HubError(this.frameError, 422);
    return PNG;
  }
  async changeFilm(id: string, change: FilmChange) {
    this.changes.push(change);
    const current = await this.film(id);
    return { ...current, config: current.config && { ...current.config, ...change } };
  }
}

let client: Client;

async function connect(hub: Hub, cwd = join(WORKSPACE, "films", "intro", "scenes")) {
  const opened: string[] = [];
  const server = createKairosServer({
    hub,
    cwd,
    openUrl: (url) => opened.push(url),
    kairosDir: "/kairos",
    version: "0.0.0",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { opened };
}

afterEach(async () => {
  await client?.close();
});

const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as CallToolResult;
const texts = (result: CallToolResult) =>
  result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
const images = (result: CallToolResult) => result.content.filter((part) => part.type === "image");

describe("Kairos tools", () => {
  it("lists the tools and tells Claude how to use them", async () => {
    await connect(new FakeHub());
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "kairos_film_settings",
      "kairos_films",
      "kairos_frame",
      "kairos_note_update",
      "kairos_notes",
      "kairos_open_preview",
      "kairos_status",
    ]);
    expect(client.getInstructions()).toContain("kairos_notes");
  });

  it("works on the film whose folder Claude runs in", async () => {
    const hub = new FakeHub();
    hub.notes_ = [note("n_aaaaaa", 1)];
    await connect(hub);
    const status = texts(await call("kairos_status"));
    expect(status).toContain('intro: "INTRO", 1920×1080, 30 fps, 5 s (150 frames)');
    expect(status).toContain("Open notes: 1");
    expect(status).toContain("http://127.0.0.1:7340/films/intro");
  });

  it("asks which film outside a film folder", async () => {
    await connect(new FakeHub(), join("/", "elsewhere"));
    const result = await call("kairos_notes");
    expect(result.isError).toBe(true);
    expect(texts(result)).toContain("Which film?");
    expect(texts(await call("kairos_notes", { film: "outro" }))).toContain(
      'No open notes on "outro"',
    );
  });

  it("returns notes with their pictures, a page at a time", async () => {
    const hub = new FakeHub();
    hub.notes_ = [
      note("n_bbbbbb", 2, { until: 3 }),
      note("n_aaaaaa", 1),
      note("n_cccccc", 4, { status: "fixed" }),
      note("n_dddddd", 4.5, { image: null }),
    ];
    await connect(hub);
    const result = await call("kairos_notes", { limit: 2 });
    const words = texts(result);
    expect(words).toContain("3 open notes");
    expect(words.indexOf("n_aaaaaa")).toBeLessThan(words.indexOf("n_bbbbbb"));
    expect(words).toContain("t = 2 s to 3 s (frames 61 to 91)");
    expect(words).toContain("box from (10, 20), 300 wide and 200 high");
    expect(words).toContain("call again with offset 2");
    expect(words).not.toContain("n_cccccc");
    expect(images(result)).toHaveLength(2);

    const rest = await call("kairos_notes", { offset: 2 });
    expect(texts(rest)).toContain("(No picture yet.)");
    expect(images(rest)).toHaveLength(0);

    const tooMany = await call("kairos_notes", { limit: MAX_NOTES + 1 });
    expect(tooMany.isError).toBe(true);
  });

  it("shows a frame, or the film's error", async () => {
    const hub = new FakeHub();
    await connect(hub);
    const result = await call("kairos_frame", { t: 2 });
    expect(texts(result)).toContain('"intro" at t = 2 s (frame 61 of 150)');
    expect(images(result)).toHaveLength(1);

    hub.frameError = "The film could not draw this frame: boom is not defined";
    const broken = await call("kairos_frame", { t: 2 });
    expect(broken.isError).toBe(true);
    expect(texts(broken)).toContain("boom is not defined");
  });

  it("marks notes fixed and changes settings", async () => {
    const hub = new FakeHub();
    hub.notes_ = [note("n_aaaaaa", 1)];
    await connect(hub);
    expect(
      texts(await call("kairos_note_update", { note: "n_aaaaaa", status: "fixed" })),
    ).toContain("is now fixed");
    expect(hub.notes_[0]?.status).toBe("fixed");

    expect(texts(await call("kairos_film_settings", { duration: 8 }))).toContain(
      "8 s (240 frames)",
    );
    expect(hub.changes).toEqual([{ duration: 8 }]);
    expect((await call("kairos_film_settings", {})).isError).toBe(true);
  });

  it("opens the preview in the browser", async () => {
    const { opened } = await connect(new FakeHub());
    await call("kairos_open_preview");
    expect(opened).toEqual(["http://127.0.0.1:7340/films/intro"]);
  });

  it("says plainly when Kairos isn't running", async () => {
    const hub = new FakeHub();
    hub.offline = true;
    await connect(hub);
    const result = await call("kairos_status");
    expect(result.isError).toBe(true);
    expect(texts(result)).toContain("Kairos isn't running");
    expect(texts(result)).toContain("npm run dev");
  });
});
