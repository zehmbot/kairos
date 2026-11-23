// When each shot plays. The narration never stops: the voice is one stream of words (every line, in time order),
// and each shot cuts in on its first word and lasts until the next shot's. A shot without words (`beat`) is a
// quick reaction under the voice. Without voices, the words are spread at a natural speaking rate, also with no
// gaps. Pure: the same story and voices give the same timing.

/** A shot cuts in this long before its first word (seconds). */
export const LEAD = 0.08;
/** The film holds this long after the last word. */
export const TAIL = 0.7;
/** No shot is shorter than this. */
export const MIN_SHOT = 0.3;
/** A beat (a shot without words) lasts this long when it doesn't say. */
export const BEAT = 0.5;
/** Words per second without voices, and the pause after a sentence or a comma. */
export const RATE = 2.6;
const SENTENCE_PAUSE = 0.28;
const COMMA_PAUSE = 0.12;

/** One word to compare: no *stars*, case or punctuation. */
export const plainWord = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[*]/g, "")
    .replace(/[^\p{L}\p{N}']/gu, "");

/** "Hello *world*, again" -> [{ text: "Hello", key: false }, { text: "world,", key: true }, ...]. */
export function sayWords(say) {
  return String(say ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ text: raw.replace(/\*/g, ""), key: /^\*.*\*[.,!?;:…"']*$/.test(raw) }))
    .filter((word) => plainWord(word.text));
}

/** The narration's words, timed: every voice line's words in time order, each with its speaker. */
export function wordStream(lines) {
  const words = [];
  for (const line of [...lines].sort((a, b) => a.start - b.start)) {
    for (const word of line.words ?? []) words.push({ ...word, speaker: line.speaker });
  }
  return words.sort((a, b) => a.start - b.start);
}

/** Words spread at a speaking rate, from `start` (no voices yet). */
export function spokenWords(shots, start = 0.15) {
  const words = [];
  let t = start;
  for (const shot of shots) {
    for (const word of sayWords(shot.say)) {
      const length = (0.18 + plainWord(word.text).length * 0.055) * (2.6 / RATE);
      words.push({ text: word.text, start: t, end: t + length, speaker: shot.talk ?? null });
      t +=
        length +
        (/[.!?…]$/.test(word.text)
          ? SENTENCE_PAUSE
          : /[,;:]$/.test(word.text)
            ? COMMA_PAUSE
            : 0.02);
    }
  }
  return words;
}

/**
 * Which words of the stream each shot says: shots take the stream's words in order. A shot's first word is
 * looked for a few words ahead (the voice may say a word the story doesn't), and the shot then takes as many
 * words as its `say` has. Returns, per shot, `[from, to)` indexes into the stream (empty for a beat).
 */
export function matchShots(shots, stream) {
  const ranges = [];
  let at = 0;
  for (const shot of shots) {
    const own = sayWords(shot.say);
    if (own.length === 0 || at >= stream.length) {
      ranges.push([at, at]);
      continue;
    }
    const first = plainWord(own[0].text);
    let from = at;
    for (let k = at; k < Math.min(stream.length, at + 6); k++) {
      if (plainWord(stream[k].text) === first) {
        from = k;
        break;
      }
    }
    const to = Math.min(stream.length, from + own.length);
    ranges.push([from, to]);
    at = to;
  }
  // Words the story doesn't have, at the very end, belong to the last speaking shot.
  const last = ranges.findLastIndex(([from, to]) => to > from);
  if (last >= 0) ranges[last][1] = Math.max(ranges[last][1], stream.length);
  return ranges;
}

/**
 * The film's timeline: `{ entries: [{ shot, index, start, seconds, words }], duration, words }`. `words` are the
 * shot's timed words (with `key` from its `say`), `words` at the top the whole narration.
 */
export function planStory(shots, lines = []) {
  const voiced = lines.some((line) => (line.words ?? []).length > 0);
  const stream = voiced ? wordStream(lines) : spokenWords(shots);
  const ranges = matchShots(shots, stream);
  const starts = shots.map(() => null);
  ranges.forEach(([from, to], i) => {
    if (to > from) starts[i] = Math.max(0, stream[from].start - LEAD);
  });
  starts[0] = 0;
  // Beats sit just before the next spoken shot, cutting into the end of the one before (the voice goes on).
  for (let i = 1; i < shots.length; i++) {
    if (starts[i] !== null) continue;
    const next = starts.slice(i + 1).find((value) => value !== null);
    const own = Math.min(0.6, Math.max(MIN_SHOT, Number(shots[i].seconds) || BEAT));
    const end = next ?? (stream.at(-1)?.end ?? 0) + TAIL + own;
    starts[i] = end - own;
  }
  // Keep the order and a shortest length.
  for (let i = 1; i < shots.length; i++) {
    starts[i] = Math.max(starts[i], starts[i - 1] + MIN_SHOT);
  }
  const lastWord = stream.at(-1)?.end ?? 0;
  const lastBeat = shots.length && sayWords(shots.at(-1).say).length === 0;
  const duration = Math.max(
    (starts.at(-1) ?? 0) + MIN_SHOT,
    lastBeat
      ? (starts.at(-1) ?? 0) + Math.min(0.6, Number(shots.at(-1).seconds) || BEAT)
      : lastWord + TAIL,
  );
  const entries = shots.map((shot, index) => {
    const [from, to] = ranges[index];
    const keys = sayWords(shot.say);
    const words = stream
      .slice(from, to)
      .map((word, k) => ({ ...word, key: Boolean(keys[k]?.key) }));
    const start = starts[index];
    const end = index + 1 < shots.length ? starts[index + 1] : duration;
    return { shot, index, start, seconds: Math.max(MIN_SHOT, end - start), words };
  });
  return { entries, duration: Math.round(duration * 1000) / 1000, words: stream };
}

/** When an effect happens: on its `at` word in the shot (the first one that matches), else a moment in. */
export function effectTime(entry, at) {
  if (at !== undefined && at !== null) {
    const wanted = plainWord(at);
    const word = entry.words.find((w) => plainWord(w.text) === wanted);
    if (word) return word.start;
  }
  return entry.start + Math.min(0.12, entry.seconds * 0.2);
}
