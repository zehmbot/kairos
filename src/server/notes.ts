/**
 * Frame notes, stored in each film folder: `.kairos/notes.json` and `.kairos/notes/<id>.png`.
 * Writes are atomic (temp file + rename) and run one at a time per film, so notes are never lost.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  type NewNote,
  NewNoteSchema,
  NOTE_ID_PATTERN,
  type Note,
  NotesFileSchema,
  type NoteUpdate,
} from "../shared/types.ts";
import { writeFileAtomic } from "./atomic-write.ts";

export const KAIROS_DIR = ".kairos";
const NOTES_FILE = "notes.json";
const IMAGES_DIR = "notes";

/** The notes file exists but can't be read. Kairos never overwrites it, so nothing the user wrote is lost. */
export class NotesFileError extends Error {}

export function isNoteId(id: string): boolean {
  return NOTE_ID_PATTERN.test(id);
}

function notesFile(filmDir: string): string {
  return join(filmDir, KAIROS_DIR, NOTES_FILE);
}

/** Relative image path stored in a note (`notes/n_abc123.png`). */
export function noteImageName(id: string): string {
  if (!isNoteId(id)) throw new Error(`Bad note id: ${id}`);
  return `${IMAGES_DIR}/${id}.png`;
}

/** Absolute path of a note's picture. */
export function noteImagePath(filmDir: string, id: string): string {
  return join(filmDir, KAIROS_DIR, noteImageName(id));
}

async function readNotes(filmDir: string): Promise<Note[]> {
  let text: string;
  try {
    text = await readFile(notesFile(filmDir), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new NotesFileError(
      `This film's notes file (.kairos/notes.json) is not valid JSON: ${(error as Error).message}`,
    );
  }
  const parsed = NotesFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new NotesFileError(
      `This film's notes file (.kairos/notes.json) has a problem:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data.notes;
}

async function writeNotes(filmDir: string, notes: Note[]): Promise<void> {
  await mkdir(join(filmDir, KAIROS_DIR), { recursive: true });
  await writeFileAtomic(notesFile(filmDir), `${JSON.stringify({ version: 1, notes }, null, 2)}\n`);
}

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier change to the same film's notes has finished. */
function oneAtATime<T>(filmDir: string, task: () => Promise<T>): Promise<T> {
  const before = queues.get(filmDir) ?? Promise.resolve();
  const result = before.then(task, task);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  queues.set(filmDir, settled);
  settled.then(() => {
    if (queues.get(filmDir) === settled) queues.delete(filmDir);
  });
  return result;
}

function newId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = `n_${Array.from(randomBytes(6), (byte) => (byte % 36).toString(36)).join("")}`;
    if (!taken.has(id)) return id;
  }
}

export function listNotes(filmDir: string): Promise<Note[]> {
  return readNotes(filmDir);
}

export async function addNote(filmDir: string, input: NewNote, now = new Date()): Promise<Note> {
  const data = NewNoteSchema.parse(input);
  return await oneAtATime(filmDir, async () => {
    const notes = await readNotes(filmDir);
    const stamp = now.toISOString();
    const note: Note = {
      id: newId(new Set(notes.map((n) => n.id))),
      text: data.text,
      status: "open",
      t: data.t,
      until: data.until,
      shapes: data.shapes,
      image: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await writeNotes(filmDir, [...notes, note]);
    return note;
  });
}

/** Changes a note. Returns `null` when there is no such note. */
export function updateNote(
  filmDir: string,
  id: string,
  change: NoteUpdate & { image?: string | null },
  now = new Date(),
): Promise<Note | null> {
  return oneAtATime(filmDir, async () => {
    const notes = await readNotes(filmDir);
    const index = notes.findIndex((note) => note.id === id);
    const current = notes[index];
    if (!current) return null;
    const updated: Note = { ...current, ...change, updatedAt: now.toISOString() };
    notes[index] = updated;
    await writeNotes(filmDir, notes);
    return updated;
  });
}

/** Deletes a note and its picture. Returns `false` when there is no such note. */
export function removeNote(filmDir: string, id: string): Promise<boolean> {
  return oneAtATime(filmDir, async () => {
    const notes = await readNotes(filmDir);
    const kept = notes.filter((note) => note.id !== id);
    if (kept.length === notes.length) return false;
    await writeNotes(filmDir, kept);
    if (isNoteId(id)) await rm(noteImagePath(filmDir, id), { force: true });
    return true;
  });
}

/** Saves a note's picture and links it to the note. Returns `false` if the note was deleted meanwhile. */
export async function saveNoteImage(
  filmDir: string,
  id: string,
  png: Uint8Array,
): Promise<boolean> {
  const path = noteImagePath(filmDir, id);
  await mkdir(join(filmDir, KAIROS_DIR, IMAGES_DIR), { recursive: true });
  await writeFile(path, png);
  const note = await updateNote(filmDir, id, { image: noteImageName(id) });
  if (!note) await rm(path, { force: true });
  return note !== null;
}
