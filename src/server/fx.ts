/**
 * Effect sounds on the timeline. A film that places sound effects (Blocky Story: `window.KAIROS_SOUNDS`, one per
 * effect, with a key) gets them as tracks on the timeline's Effects lane (`sfx: true`, with their `key`):
 * - a new effect gets its sound;
 * - an effect that moved in the story moves its sound, unless you moved that sound yourself (`moved`);
 * - an effect that is gone takes its sound away;
 * - a sound you deleted stays deleted (`sfxRemoved` in kairos.json), and sounds you added (no key) are never
 *   touched.
 */
import { z } from "zod";
import { nextLane } from "../shared/lanes.ts";
import type { AudioTrack } from "../shared/types.ts";
import { AudioTrackSchema } from "../shared/types.ts";
import { changeFilm, readFilmConfig } from "./films.ts";
import { SOUND_NAMES, soundInFilm } from "./sounds.ts";
import { oneAtATime } from "./uploads.ts";

/** One sound a film asks for. */
export const FilmSoundSchema = z.object({
  key: z.string().min(1).max(120),
  sound: z.string().min(1).max(40),
  t: z.number().min(0).max(36000),
  volume: z.number().min(0).max(2).default(0.6),
});
export type FilmSound = z.infer<typeof FilmSoundSchema>;
export const FilmSoundsSchema = z.array(FilmSoundSchema).max(2000);

const round = (t: number) => Math.round(t * 1000) / 1000;

/** The Effects lane: where the effect sounds already are, or a free lane under the others. */
export function effectsLane(tracks: readonly AudioTrack[]): number {
  const index = tracks.findIndex((track) => track.sfx);
  if (index >= 0) return tracks[index]?.lane ?? index;
  return nextLane(tracks);
}

/** The film's tracks with its effect sounds brought in step with what the film asks for. */
export function withEffectSounds(
  tracks: readonly AudioTrack[],
  asked: readonly FilmSound[],
  removed: readonly string[],
  fileOf: (sound: string) => string,
): AudioTrack[] {
  const wanted = new Map<string, FilmSound>();
  for (const sound of asked) {
    if (SOUND_NAMES.includes(sound.sound) && !wanted.has(sound.key)) wanted.set(sound.key, sound);
  }
  const lane = effectsLane(tracks);
  const gone = new Set(removed);
  const next: AudioTrack[] = [];
  for (const track of tracks) {
    if (!track.sfx || !track.key) {
      next.push(track);
      continue;
    }
    const want = wanted.get(track.key);
    if (!want) continue;
    wanted.delete(track.key);
    const file = fileOf(want.sound);
    next.push(
      track.moved
        ? { ...track, file }
        : { ...track, file, start: round(want.t), volume: want.volume },
    );
  }
  for (const want of wanted.values()) {
    if (gone.has(want.key)) continue;
    next.push(
      AudioTrackSchema.parse({
        file: fileOf(want.sound),
        start: round(want.t),
        volume: want.volume,
        lane,
        sfx: true,
        key: want.key,
      }),
    );
  }
  return next;
}

const same = (a: readonly AudioTrack[], b: readonly AudioTrack[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Brings the film's effect sounds in step with what it asks for: copies the sounds it needs into `audio/fx/`
 * and changes `kairos.json` only when something changed. Returns true when it did.
 */
export function syncEffectSounds(filmDir: string, asked: readonly FilmSound[]): Promise<boolean> {
  return oneAtATime(`${filmDir}|fx`, async () => {
    const config = (await readFilmConfig(filmDir))?.config;
    if (!config) return false;
    const names = [...new Set(asked.map((sound) => sound.sound))].filter((name) =>
      SOUND_NAMES.includes(name),
    );
    const files = new Map<string, string>();
    for (const name of names) files.set(name, await soundInFilm(filmDir, name));
    const next = withEffectSounds(
      config.audio,
      asked,
      config.sfxRemoved ?? [],
      (name) => files.get(name) ?? `audio/fx/${name}.wav`,
    );
    if (same(next, config.audio)) return false;
    await changeFilm(filmDir, { audio: next });
    return true;
  });
}

/**
 * You changed the timeline: an effect sound the film placed that you moved keeps its new place, and one you deleted
 * is remembered, so it doesn't come back. Returns the tracks to save and the keys to remember.
 */
export function noteEffectEdits(
  before: readonly AudioTrack[],
  after: readonly AudioTrack[],
): { tracks: AudioTrack[]; removed: string[] } {
  const old = new Map(before.filter((t) => t.sfx && t.key).map((t) => [t.key as string, t]));
  const kept = new Set<string>();
  const tracks = after.map((track) => {
    if (!track.sfx || !track.key) return track;
    kept.add(track.key);
    const was = old.get(track.key);
    if (was && !track.moved && Math.abs(was.start - track.start) > 0.004) {
      return { ...track, moved: true };
    }
    return track;
  });
  const removed = [...old.keys()].filter((key) => !kept.has(key));
  return { tracks, removed };
}
