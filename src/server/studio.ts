import { mkdir } from "node:fs/promises";
import type { AppConfig, FilmVoice } from "../shared/types.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { EventBus } from "./events.ts";
import type { Film } from "./films.ts";
import { trashDirOf } from "./trash.ts";
import { type FilmWatcher, watchFilms } from "./watcher.ts";
import { filmsDirOf, templatesDirOf } from "./workspace.ts";

export interface StudioOptions {
  /** Kairos' settings folder (`~/.kairos`). */
  home: string;
  /** Folder of the templates Kairos ships (one folder per template). */
  templatesDir: string;
}

/** The hub's live state: the chosen workspace, its file watcher and the event bus. */
export class Studio {
  readonly events = new EventBus();
  readonly home: string;
  readonly templatesDir: string;
  #config: AppConfig;
  #watcher: FilmWatcher | null = null;

  private constructor(options: StudioOptions, config: AppConfig) {
    this.home = options.home;
    this.templatesDir = options.templatesDir;
    this.#config = config;
  }

  static async open(options: StudioOptions): Promise<Studio> {
    const studio = new Studio(options, await loadConfig(options.home));
    await studio.#startWatcher();
    return studio;
  }

  /** The workspace folder, or `null` until the user picks one. */
  get workspace(): string | null {
    return this.#config.workspace ?? null;
  }

  get filmsDir(): string | null {
    return this.workspace ? filmsDirOf(this.workspace) : null;
  }

  /** Deleted films (`<workspace>/.trash`), or `null` until a workspace is chosen. */
  get trashDir(): string | null {
    return this.workspace ? trashDirOf(this.workspace) : null;
  }

  /** The user's own templates (`<workspace>/templates`), or `null` until a workspace is chosen. */
  get userTemplatesDir(): string | null {
    return this.workspace ? templatesDirOf(this.workspace) : null;
  }

  /** Switches to `path` (absolute), creating `<path>/films` if needed. Throws if the folder can't be made. */
  async setWorkspace(path: string): Promise<void> {
    await mkdir(filmsDirOf(path), { recursive: true });
    this.#config = { ...this.#config, workspace: path };
    await saveConfig(this.home, this.#config);
    await this.#startWatcher();
    this.events.publish({ type: "workspace-changed" });
  }

  /** fish.audio settings: the speech model, the voices used lately, and each character's voice. */
  get voiceSettings(): {
    model: string | null;
    recent: FilmVoice[];
    remembered: Record<string, FilmVoice>;
  } {
    return {
      model: this.#config.voice?.model ?? null,
      recent: this.#config.voice?.recent ?? [],
      remembered: this.#config.voice?.remembered ?? {},
    };
  }

  async #saveVoice(change: Partial<NonNullable<AppConfig["voice"]>>): Promise<void> {
    const { model, recent, remembered } = this.voiceSettings;
    this.#config = {
      ...this.#config,
      voice: { model: model ?? undefined, recent, remembered, ...change },
    };
    await saveConfig(this.home, this.#config);
  }

  setVoiceModel(model: string): Promise<void> {
    return this.#saveVoice({ model });
  }

  /** Puts a voice first in the "used lately" list (at most 12). */
  rememberVoice(voice: FilmVoice): Promise<void> {
    const plain = { id: voice.id, name: voice.name };
    const recent = [plain, ...this.voiceSettings.recent.filter((v) => v.id !== voice.id)];
    return this.#saveVoice({ recent: recent.slice(0, 12) });
  }

  /** A character's voice for the next films too (the narrator changes every film, so it isn't kept). */
  rememberCharacter(speaker: string, voice: FilmVoice): Promise<void> {
    if (speaker === "narrator") return Promise.resolve();
    const remembered = { ...this.voiceSettings.remembered };
    remembered[speaker] = {
      ...(voice.sample ? { sample: voice.sample } : {}),
      id: voice.id,
      name: voice.name,
      ...(voice.type ? { type: voice.type } : {}),
    };
    return this.#saveVoice({ remembered });
  }

  /** Path of a film's page on the film server, or `null` when the film can't be previewed. */
  previewPath(film: Film): string | null {
    if (!film.config || film.problem) return null;
    const page = film.config.page
      .split("/")
      .filter((part) => part !== "" && part !== ".")
      .map(encodeURIComponent)
      .join("/");
    return `/${encodeURIComponent(film.id)}/${page}`;
  }

  close(): void {
    this.#watcher?.close();
    this.#watcher = null;
  }

  async #startWatcher(): Promise<void> {
    this.#watcher?.close();
    this.#watcher = null;
    const dir = this.filmsDir;
    if (!dir) return;
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      console.warn(`The films folder ${dir} is not available: ${(error as Error).message}`);
      return;
    }
    this.#watcher = watchFilms(dir, (ids) => this.events.publish({ type: "films-changed", ids }));
  }
}
