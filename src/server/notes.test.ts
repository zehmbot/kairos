import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addNote,
  isNoteId,
  listNotes,
  NotesFileError,
  noteImagePath,
  removeNote,
  saveNoteImage,
  updateNote,
} from "./notes.ts";

let filmDir: string;

beforeEach(async () => {
  filmDir = await mkdtemp(join(tmpdir(), "kairos-notes-"));
});

afterEach(async () => {
  await rm(filmDir, { recursive: true, force: true });
});

const box = { type: "box", x: 10, y: 20, w: 300, h: 200 } as const;

describe("notes store", () => {
  it("starts empty, then adds, updates and removes notes", async () => {
    expect(await listNotes(filmDir)).toEqual([]);

    const note = await addNote(filmDir, { text: "  Bigger title  ", t: 1.5, shapes: [box] });
    expect(isNoteId(note.id)).toBe(true);
    expect(note).toMatchObject({
      text: "Bigger title",
      status: "open",
      t: 1.5,
      until: null,
      image: null,
    });
    expect(await listNotes(filmDir)).toEqual([note]);

    const fixed = await updateNote(filmDir, note.id, { status: "fixed" });
    expect(fixed?.status).toBe("fixed");
    expect((await listNotes(filmDir))[0]?.status).toBe("fixed");

    expect(await updateNote(filmDir, "n_zzzzzz", { status: "open" })).toBeNull();
    expect(await removeNote(filmDir, note.id)).toBe(true);
    expect(await removeNote(filmDir, note.id)).toBe(false);
    expect(await listNotes(filmDir)).toEqual([]);
  });

  it("keeps every note when many are added at once", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => addNote(filmDir, { text: `Note ${i}`, t: i / 10 })),
    );
    const notes = await listNotes(filmDir);
    expect(notes).toHaveLength(20);
    expect(new Set(notes.map((note) => note.id)).size).toBe(20);
  });

  it("saves pictures next to the notes and removes them with the note", async () => {
    const note = await addNote(filmDir, { text: "Look here", t: 0 });
    expect(await saveNoteImage(filmDir, note.id, new Uint8Array([1, 2, 3]))).toBe(true);
    expect((await listNotes(filmDir))[0]?.image).toBe(`notes/${note.id}.png`);
    expect([...(await readFile(noteImagePath(filmDir, note.id)))]).toEqual([1, 2, 3]);

    await removeNote(filmDir, note.id);
    await expect(stat(noteImagePath(filmDir, note.id))).rejects.toThrow();
  });

  it("drops the picture when its note was deleted first", async () => {
    const note = await addNote(filmDir, { text: "Gone soon", t: 0 });
    await removeNote(filmDir, note.id);
    expect(await saveNoteImage(filmDir, note.id, new Uint8Array([1]))).toBe(false);
    await expect(stat(noteImagePath(filmDir, note.id))).rejects.toThrow();
  });

  it("never overwrites a broken notes file", async () => {
    await mkdir(join(filmDir, ".kairos"), { recursive: true });
    const file = join(filmDir, ".kairos", "notes.json");
    await writeFile(file, "{ oops");
    await expect(listNotes(filmDir)).rejects.toBeInstanceOf(NotesFileError);
    await expect(addNote(filmDir, { text: "x", t: 0 })).rejects.toBeInstanceOf(NotesFileError);
    expect(await readFile(file, "utf8")).toBe("{ oops");
  });

  it("rejects bad notes", async () => {
    await expect(addNote(filmDir, { text: "   ", t: 0 })).rejects.toThrow(
      "Write what should change.",
    );
    await expect(addNote(filmDir, { text: "x", t: 2, until: 1 })).rejects.toThrow(
      "The range must end after it starts.",
    );
    await expect(
      addNote(filmDir, { text: "x", t: 0, shapes: [{ type: "pen", points: [[1, 1]] }] }),
    ).rejects.toThrow();
  });

  it("only accepts real note ids for picture paths", () => {
    expect(isNoteId("n_abc123")).toBe(true);
    for (const id of ["../x", "n_ABC123", "n_abc12", "n_abc1234", "x_abc123"]) {
      expect(isNoteId(id)).toBe(false);
      expect(() => noteImagePath(filmDir, id)).toThrow();
    }
  });
});
