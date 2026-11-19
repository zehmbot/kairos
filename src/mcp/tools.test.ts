import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import type {
  Asset,
  FilmChange,
  FilmSummary,
  Note,
  NoteStatus,
  Reference,
  RenderJob,
  RenderQuality,
  RendersOverview,
} from "../shared/types.ts";
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
    audio: [],
  },
  problem: null,
  previewPath: `/${id}/index.html`,
  updatedAt: 0,
  hasBrief: false,
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
  assets_: Asset[] = [
    {
      id: "images/logo.png",
      kind: "image",
      name: "logo.png",
      size: 2048,
      addedAt: "2026-11-19T10:00:00.000Z",
    },
    {
      id: "sounds/rain.mp3",
      kind: "sound",
      name: "rain.mp3",
      size: 1_500_000,
      addedAt: "2026-11-19T10:00:00.000Z",
    },
  ];
  used: { asset: string; film: string; start?: number }[] = [];
  references_: Reference[] = [];
  async assets() {
    this.#check();
    return this.assets_;
  }
  async useAsset(asset: string, filmId: string, start?: number) {
    await this.film(filmId);
    this.used.push({ asset, film: filmId, start });
    return asset.startsWith("sounds/") ? `audio/${asset.slice(7)}` : `assets/${asset}`;
  }
  async references(id: string) {
    await this.film(id);
    return this.references_;
  }
  async referenceSheet() {
    this.#check();
    return PNG;
  }
  jobs: RenderJob[] = [];
  async startRender(id: string, quality: RenderQuality) {
    await this.film(id);
    const job: RenderJob = {
      id: `r_${this.jobs.length + 1}`,
      filmId: id,
      title: id,
      state: "queued",
      quality,
      encoder: "h264_nvenc",
      done: 0,
      total: 150,
      queuedAt: "2026-11-19T10:00:00.000Z",
      startedAt: null,
      endedAt: null,
      error: null,
      version: null,
    };
    this.jobs.push(job);
    return job;
  }
  async renders(): Promise<RendersOverview> {
    this.#check();
    return {
      jobs: this.jobs,
      videos: [
        {
          version: 2,
          file: "renders/intro-v2.mp4",
          createdAt: "2026-11-19T09:00:00.000Z",
          quality: "high",
          encoder: "libx264",
          width: 1920,
          height: 1080,
          fps: 30,
          duration: 5,
          frames: 150,
          bytes: 1000,
          seconds: 4,
          filmId: "intro",
          title: "INTRO",
        },
      ],
    };
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
      "kairos_assets",
      "kairos_film_settings",
      "kairos_films",
      "kairos_frame",
      "kairos_note_update",
      "kairos_notes",
      "kairos_open_preview",
      "kairos_references",
      "kairos_render",
      "kairos_renders",
      "kairos_status",
      "kairos_use_asset",
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

  it("starts renders and reports on them", async () => {
    const hub = new FakeHub();
    await connect(hub);
    expect(texts(await call("kairos_render"))).toContain(
      'Render r_1 of "intro" is in the queue: 150 frames',
    );
    expect(hub.jobs[0]?.quality).toBe("high");
    const report = texts(await call("kairos_renders"));
    expect(report).toContain('Render r_1 of "intro": queued');
    expect(report).toContain('Video "intro" v2: renders/intro-v2.mp4, 1920×1080, 30 fps, 5 s');
    expect(texts(await call("kairos_renders", { film: "outro" }))).toBe("No renders yet.");
  });

  it("opens the preview in the browser", async () => {
    const { opened } = await connect(new FakeHub());
    await call("kairos_open_preview");
    expect(opened).toEqual(["http://127.0.0.1:7340/films/intro"]);
  });

  it("lists assets and copies them into the film", async () => {
    const hub = new FakeHub();
    await connect(hub);
    const list = texts(await call("kairos_assets"));
    expect(list).toContain("images/logo.png (image, 2 KB)");
    expect(list).toContain("sounds/rain.mp3 (sound, 1.4 MB)");
    expect(texts(await call("kairos_assets", { kind: "font" }))).toBe(
      "No font files in the asset library.",
    );
    expect(texts(await call("kairos_use_asset", { asset: "images/logo.png" }))).toContain(
      "Copied to assets/images/logo.png",
    );
    expect(texts(await call("kairos_use_asset", { asset: "sounds/rain.mp3", start: 2 }))).toContain(
      "Added audio/rain.mp3 as a sound track starting at 2 s",
    );
    expect(hub.used).toEqual([
      { asset: "images/logo.png", film: "intro", start: undefined },
      { asset: "sounds/rain.mp3", film: "intro", start: 2 },
    ]);
  });

  it("shows references with their numbers and frame sheets, in pages", async () => {
    const hub = new FakeHub();
    await connect(hub);
    expect(texts(await call("kairos_references"))).toContain("This film has no references.");
    const pictured = Array.from({ length: 36 }, (_, i) => i + 1);
    hub.references_ = [
      {
        id: "r_aaaaaaaa",
        file: "references/story.mp4",
        kind: "video",
        note: "the quick cuts",
        addedAt: "2026-11-19T10:00:00.000Z",
        status: "ready",
        problem: null,
        info: {
          duration: 90,
          width: 720,
          height: 1280,
          fps: 30,
          shots: Array.from({ length: 40 }, (_, i) => i * 2.25),
          medianShot: 2.25,
          shortestShot: 1,
          longestShot: 4,
          pictured,
        },
        sheets: 2,
      },
      {
        id: "r_bbbbbbbb",
        file: "references/mood.png",
        kind: "image",
        note: "",
        addedAt: "2026-11-19T10:00:00.000Z",
        status: "ready",
        problem: null,
        info: null,
        sheets: 1,
      },
      ...Array.from(
        { length: 4 },
        (_, i): Reference => ({
          id: `r_c000000${i}`,
          file: `references/pic${i}.png`,
          kind: "image",
          note: "",
          addedAt: "2026-11-19T10:00:00.000Z",
          status: "ready",
          problem: null,
          info: null,
          sheets: 1,
        }),
      ),
    ];
    const first = await call("kairos_references");
    const report = texts(first);
    expect(report).toContain("Reference 1: story.mp4 (video)");
    expect(report).toContain("What to take from it: the quick cuts");
    expect(report).toContain("720×1280, 30 fps, 90 s, 40 shots: typical 2.25 s");
    expect(report).toContain("Reference 1, sheet 2: shots 19, 20");
    expect(report).toContain("Page 1 of 2.");
    expect(images(first)).toHaveLength(6);
    const second = await call("kairos_references", { page: 2 });
    expect(images(second)).toHaveLength(1);
    expect(texts(second)).toContain("Page 2 of 2.");
    expect(texts(await call("kairos_status"))).toContain("References: 6");
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
