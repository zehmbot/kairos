/** Timeline tracks ("lanes") for a film's sounds: shared by the hub and the timeline. */

/** The lane of each sound track: its own `lane`, or one lane each in order when it has none. */
export function lanesOf(tracks: readonly { lane?: number }[]): number[] {
  return tracks.map((track, index) => track.lane ?? index);
}

/** A free lane under all the others, for a new sound. */
export function nextLane(tracks: readonly { lane?: number }[]): number {
  const lanes = lanesOf(tracks);
  return lanes.length ? Math.min(31, Math.max(...lanes) + 1) : 0;
}
