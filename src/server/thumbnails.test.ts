import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Film } from "./films.ts";
import { PictureKeeper, THUMB_FILE } from "./thumbnails.ts";

let filmsDir: string;

beforeEach(async () => {
  filmsDir = await mkdtemp(join(tmpdir(), "kairos-thumbs-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(filmsDir, { recursive: true, force: true });
});

async function makeFilm(id: string, options: { picture?: boolean; broken?: boolean } = {}) {
  const dir = join(filmsDir, id);
  await mkdir(join(dir, ".kairos"), { recursive: true });
  await writeFile(
    join(dir, "kairos.json"),
    options.broken ? "{ nope" : JSON.stringify({ title: id, duration: 3 }),
  );
  await writeFile(join(dir, "index.html"), "<!doctype html><title>x</title>");
  if (options.picture) await writeFile(join(dir, THUMB_FILE), "png");
}

function keeper(busy: (id: string) => boolean = () => false) {
  const taken: string[] = [];
  const pictures = new PictureKeeper({
    filmsDir: () => filmsDir,
    take: async (film: Film) => {
      taken.push(film.id);
    },
    busy,
    quietMs: 1000,
  });
  return { pictures, taken };
}

describe("PictureKeeper", () => {
  it("pictures the films that have none, one at a time", async () => {
    await makeFilm("new");
    await makeFilm("old", { picture: true });
    await makeFilm("broken", { broken: true });
    const { pictures, taken } = keeper();

    await pictures.sweep();
    await pictures.idle();

    expect(taken).toEqual(["new"]);
    pictures.close();
  });

  it("waits until a changed film has been quiet, then takes it once", async () => {
    await makeFilm("busy-film", { picture: true });
    vi.useFakeTimers();
    const { pictures, taken } = keeper();

    pictures.changed(["busy-film"]);
    await vi.advanceTimersByTimeAsync(600);
    pictures.changed(["busy-film"]);
    await vi.advanceTimersByTimeAsync(600);
    expect(taken).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    await pictures.idle();
    expect(taken).toEqual(["busy-film"]);
    pictures.close();
  });

  it("tries again later while Claude works on the film", async () => {
    await makeFilm("made", { picture: true });
    vi.useFakeTimers();
    let working = true;
    const { pictures, taken } = keeper(() => working);

    pictures.changed(["made"]);
    await vi.advanceTimersByTimeAsync(1100);
    await pictures.idle();
    expect(taken).toEqual([]);

    working = false;
    await vi.advanceTimersByTimeAsync(1100);
    await pictures.idle();
    expect(taken).toEqual(["made"]);
    pictures.close();
  });

  it("takes nothing once closed", async () => {
    await makeFilm("late");
    vi.useFakeTimers();
    const { pictures, taken } = keeper();

    pictures.changed(["late"]);
    pictures.close();
    await vi.advanceTimersByTimeAsync(2000);
    await pictures.sweep();
    await pictures.idle();
    expect(taken).toEqual([]);
  });
});
