// When each shot plays. The voice leads: a spoken shot starts just before its line, and the shots between two
// lines share the time until the next one. Silent shots keep their own `seconds`. Pure: same story and voices,
// same timing.

/** A spoken shot starts this long before its voice, and lasts at least this long after it (seconds). */
export const LEAD = 0.12;
export const BREATH = 0.25;
/** No shot is shorter than this. */
export const MIN_SHOT = 0.3;

/** Words to compare: no *stars*, case or punctuation. */
export const plainWords = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[*]/g, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

/**
 * Which voice line each shot shows: the one named by its `line` key, otherwise the first unused line with the same
 * words, between the lines of the shots around it. Links stay in time order.
 */
export function linkLines(shots, lines) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const used = new Set();
  const keyed = shots.map((shot) => {
    const line = shot?.line !== undefined ? byId.get(String(shot.line)) : undefined;
    if (!line || used.has(line.id)) return null;
    used.add(line.id);
    return line;
  });
  const linked = [];
  let last = -Infinity;
  shots.forEach((shot, i) => {
    let line = keyed[i] && keyed[i].start >= last ? keyed[i] : null;
    if (!line && shot?.say) {
      // Only a line after the previous link and before the next keyed one.
      const before = keyed.slice(i + 1).find(Boolean)?.start ?? Infinity;
      const words = plainWords(shot.say);
      line =
        lines.find(
          (entry) =>
            !used.has(entry.id) &&
            entry.start >= last &&
            entry.start < before &&
            (plainWords(entry.text) === words || plainWords(entry.said) === words),
        ) ?? null;
      if (line) used.add(line.id);
    }
    linked.push(line);
    if (line) last = line.start;
  });
  return linked;
}

const lengthOf = (shot) => Math.max(0.2, Number(shot?.seconds) || 2.5);

/**
 * The film's timeline: `{ entries: [{ shot, index, start, seconds, line }], duration }`. `line` is the shot's voice
 * line (or null). Without voices, every shot plays its own `seconds`, one after the other.
 */
export function planShots(shots, lines = []) {
  const sorted = [...lines].sort((a, b) => a.start - b.start);
  const linked = linkLines(shots, sorted);
  const start = shots.map(() => 0);
  const length = shots.map(() => 0);
  // Each run starts at a spoken shot (or the first shot) and holds the silent shots after it.
  const heads = shots.map((_, i) => i).filter((i) => i === 0 || linked[i]);
  let at = 0;
  heads.forEach((head, h) => {
    const next = heads[h + 1];
    const members = [];
    for (let i = head; i < (next ?? shots.length); i++) members.push(i);
    const line = linked[head];
    const first = head === 0 ? 0 : Math.max(at, line.start - LEAD);
    // A spoken shot lasts at least its own seconds and its line; it can only be cut to the end of its line.
    const natural = line
      ? Math.max(lengthOf(shots[head]), line.end + BREATH - first)
      : lengthOf(shots[head]);
    const shortest = line ? Math.max(MIN_SHOT, line.end - first) : MIN_SHOT;
    const lens = [natural, ...members.slice(1).map((i) => lengthOf(shots[i]))];
    if (next !== undefined) {
      const goal = linked[next].start - LEAD - first;
      const total = lens.reduce((sum, d) => sum + d, 0);
      if (total < goal) {
        // The last shot holds until the next voice.
        lens[lens.length - 1] += goal - total;
      } else if (total > goal) {
        // Too long: the silent shots shrink first (to MIN_SHOT), then the spoken one (to the end of its line).
        let over = total - goal;
        const silent = lens.slice(1);
        const room = silent.reduce((sum, d) => sum + (d - MIN_SHOT), 0);
        if (room > 0) {
          const cut = Math.min(over, room);
          for (let k = 1; k < lens.length; k++) lens[k] -= (cut * (lens[k] - MIN_SHOT)) / room;
          over -= cut;
        }
        lens[0] -= Math.min(over, Math.max(0, lens[0] - shortest));
      }
    }
    let t = first;
    members.forEach((i, k) => {
      start[i] = t;
      length[i] = lens[k];
      t += lens[k];
    });
    at = t;
  });
  return {
    entries: shots.map((shot, index) => ({
      shot,
      index,
      start: start[index],
      seconds: length[index],
      line: linked[index] ?? null,
    })),
    duration: at,
  };
}

/** The voice line being said at `t` (or just said: captions stay a moment after), or null. */
export function lineAt(lines, t, linger = 0) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.start <= t) return t < line.end + linger ? line : null;
  }
  return null;
}
