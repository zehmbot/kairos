import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteFilmForGood,
  deleteFromTrash,
  emptyTrash,
  listTrash,
  moveToTrash,
  restoreFromTrash,
  TrashError,
} from "./trash.ts";

let root: string;
let films: string;
let trash: string;

async function film(id: string, title = id) {
  await mkdir(join(films, id, "renders"), { recursive: true });
  await writeFile(join(films, id, "kairos.json"), JSON.stringify({ title }));
  await writeFile(join(films, id, "renders", "v1.mp4"), "video");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-trash-"));
  films = join(root, "films");
  trash = join(root, ".trash");
  await mkdir(films);
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe("trash", () => {
  it("moves a film to the trash with all its files and lists it", async () => {
    await film("intro", "My intro");
    const entry = await moveToTrash(films, trash, "intro");
    expect(entry).toMatch(/^\d{13}-intro$/);
    expect(await readdir(films)).toEqual([]);
    expect(await readFile(join(trash, entry, "renders", "v1.mp4"), "utf8")).toBe("video");
    expect(await listTrash(trash)).toEqual([
      { entry, id: "intro", title: "My intro", deletedAt: expect.any(String) },
    ]);
  });

  it("restores a film under its old name, or with a number when the name is taken", async () => {
    await film("intro");
    const first = await moveToTrash(films, trash, "intro");
    expect(await restoreFromTrash(films, trash, first)).toBe("intro");
    expect(await readdir(films)).toEqual(["intro"]);

    const second = await moveToTrash(films, trash, "intro");
    await film("intro", "A new intro");
    expect(await restoreFromTrash(films, trash, second)).toBe("intro-2");
    expect((await readdir(films)).sort()).toEqual(["intro", "intro-2"]);
    expect(await listTrash(trash)).toEqual([]);
  });

  it("deletes for good: a film, one trashed film, or the whole trash", async () => {
    await film("a");
    await film("b");
    await film("c");
    await deleteFilmForGood(films, "a");
    const b = await moveToTrash(films, trash, "b");
    await moveToTrash(films, trash, "c");
    await deleteFromTrash(trash, b);
    expect((await listTrash(trash)).map((item) => item.id)).toEqual(["c"]);
    await emptyTrash(trash);
    expect(await listTrash(trash)).toEqual([]);
    expect(await readdir(films)).toEqual([]);
  });

  it("refuses names that aren't films or trash entries, and touches nothing else", async () => {
    await film("keep");
    await writeFile(join(root, "outside.txt"), "safe");
    await expect(moveToTrash(films, trash, "../outside.txt")).rejects.toBeInstanceOf(TrashError);
    await expect(moveToTrash(films, trash, "missing")).rejects.toBeInstanceOf(TrashError);
    await expect(deleteFilmForGood(films, "..")).rejects.toBeInstanceOf(TrashError);
    await expect(deleteFromTrash(trash, "../films")).rejects.toBeInstanceOf(TrashError);
    await expect(deleteFromTrash(trash, "1234567890123-..")).rejects.toBeInstanceOf(TrashError);
    await expect(restoreFromTrash(films, trash, "keep")).rejects.toBeInstanceOf(TrashError);
    expect(await readdir(films)).toEqual(["keep"]);
    expect(await readFile(join(root, "outside.txt"), "utf8")).toBe("safe");
  });

  it("lists nothing when there is no trash yet", async () => {
    expect(await listTrash(trash)).toEqual([]);
    await emptyTrash(trash);
  });
});
