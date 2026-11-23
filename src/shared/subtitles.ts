/**
 * Subtitles (`.srt`) from timed words: short cues that are easy to read, made from what the film shows as captions
 * or from the word timings of the sounds on its timeline. Pure, so the hub and tests share it.
 */

export interface TimedWord {
  text: string;
  /** Seconds on the film's clock. */
  start: number;
  end: number;
}

export interface Cue {
  start: number;
  end: number;
  /** One or two lines, joined with "\n". */
  text: string;
}

export interface CueRules {
  /** Letters on one line. */
  lineChars: number;
  /** Lines in one cue. */
  lines: number;
  /** A cue lasts at most about this long. */
  maxSeconds: number;
  /** A silence this long starts a new cue. */
  pause: number;
  /** A cue shows at least this long (when the next one leaves room). */
  minSeconds: number;
  /** A cue stays up this long after its last word (when the next one leaves room). */
  linger: number;
}

export const CUE_RULES: CueRules = {
  lineChars: 42,
  lines: 2,
  maxSeconds: 6,
  pause: 0.6,
  minSeconds: 0.8,
  linger: 0.3,
};

/** A track on the film's timeline, as far as its words go. */
export interface TimelineSound {
  file: string;
  start: number;
  from?: number;
  length?: number;
  muted?: boolean;
  /** An effect sound (they don't speak). */
  sfx?: boolean;
}

/**
 * The words the film's sounds say, on the film's clock: each unmuted sound with word timings (`wordsOf`, timed from
 * the start of its file) placed where its clip starts, without the words its trim cuts off.
 */
export function timelineWords(
  tracks: readonly TimelineSound[],
  wordsOf: (file: string) => readonly TimedWord[] | null | undefined,
): TimedWord[] {
  const words: TimedWord[] = [];
  for (const track of tracks) {
    if (track.muted || track.sfx) continue;
    const from = track.from ?? 0;
    const until = track.length !== undefined ? from + track.length : Number.POSITIVE_INFINITY;
    for (const word of wordsOf(track.file) ?? []) {
      if (word.start < from - 0.01 || word.start >= until) continue;
      words.push({
        text: word.text,
        start: track.start + word.start - from,
        end: track.start + Math.min(word.end, until) - from,
      });
    }
  }
  return words.sort((a, b) => a.start - b.start);
}

const sentenceEnd = (text: string) => /[.!?…]["'”’)\]]*$/.test(text);
const clauseEnd = (text: string) => /[,;:—–]["'”’)\]]*$/.test(text);
/** Words a phrase often starts with: a good place to break before (English; other languages just go by length). */
const JOINERS = new Set([
  "and",
  "but",
  "or",
  "so",
  "then",
  "because",
  "while",
  "when",
  "until",
  "before",
  "after",
]);
const joins = (text: string) => JOINERS.has(text.toLowerCase().replace(/[^a-z]/g, ""));

/** How good a break is between `before` and `after`: a comma is the best place, a joining word a good one. */
const breakBonus = (before: string, after: string, size: number) =>
  (clauseEnd(before) ? size : 0) + (joins(after) ? size / 2 : 0);

/**
 * Splits a cue's words into lines of at most `lineChars`, as even as can be and at a comma or before a joining word
 * when one is near (null when they don't fit).
 */
export function cueLines(words: readonly string[], rules: CueRules = CUE_RULES): string[] | null {
  const one = words.join(" ");
  if (one.length <= rules.lineChars) return [one];
  if (rules.lines < 2) return null;
  let best: { lines: string[]; score: number } | null = null;
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    if (lines.some((line) => line.length > rules.lineChars)) continue;
    const longest = Math.max(...lines.map((line) => line.length));
    // A good break counts only when neither line comes out stubby.
    const shortest = Math.min(...lines.map((line) => line.length));
    const bonus =
      shortest >= rules.lineChars / 3
        ? breakBonus(words[k - 1] ?? "", words[k] ?? "", rules.lineChars / 3)
        : 0;
    const score = -longest + bonus;
    if (!best || score > best.score) best = { lines, score };
  }
  return best?.lines ?? null;
}

/** Does a run of words fit one cue: on its lines, and in its time? */
const fits = (run: readonly TimedWord[], rules: CueRules) =>
  run.length <= 1 ||
  (cueLines(
    run.map((w) => w.text),
    rules,
  ) !== null &&
    (run.at(-1)?.end ?? 0) - (run[0]?.start ?? 0) <= rules.maxSeconds);

/**
 * Cuts a run of words that doesn't fit one cue in two where it balances best, preferring a comma or a joining word,
 * then each half again if needed: no word is left alone at the end of a long sentence.
 */
function splitRun(run: TimedWord[], rules: CueRules): TimedWord[][] {
  if (fits(run, rules)) return [run];
  const length = (part: readonly TimedWord[]) => part.map((w) => w.text).join(" ").length;
  let best = 1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let k = 1; k < run.length; k++) {
    const left = run.slice(0, k);
    const right = run.slice(k);
    const score =
      -Math.abs(length(left) - length(right)) +
      breakBonus(run[k - 1]?.text ?? "", run[k]?.text ?? "", rules.lineChars);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return [...splitRun(run.slice(0, best), rules), ...splitRun(run.slice(best), rules)];
}

/**
 * Groups timed words into subtitle cues: each sentence (or stretch between pauses) is one cue when it fits, else it
 * is cut where it balances best (see `splitRun`).
 */
export function subtitleCues(words: readonly TimedWord[], rules: CueRules = CUE_RULES): Cue[] {
  const runs: TimedWord[][] = [];
  let run: TimedWord[] = [];
  for (const raw of words) {
    const text = raw.text.trim();
    if (!text) continue;
    const last = run.at(-1);
    if (last && (sentenceEnd(last.text) || raw.start - last.end >= rules.pause)) {
      runs.push(run);
      run = [];
    }
    run.push({ ...raw, text });
  }
  if (run.length) runs.push(run);
  const groups = runs.flatMap((sentence) => splitRun(sentence, rules));

  return groups.map((cue, i) => {
    const first = cue[0] as TimedWord;
    const last = cue.at(-1) as TimedWord;
    const next = groups[i + 1]?.[0]?.start ?? Number.POSITIVE_INFINITY;
    // Up a little after its last word and never too short, but gone when the next one starts.
    const end = Math.min(next, Math.max(last.end + rules.linger, first.start + rules.minSeconds));
    const texts = cue.map((w) => w.text);
    const lines = cueLines(texts, rules) ?? [texts.join(" ")];
    return { start: first.start, end: Math.max(end, first.start + 0.05), text: lines.join("\n") };
  });
}

/** `83.5` → `00:01:23,500` */
export function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** SRT as WebVTT, for the browser's video player: a header, and dots before the milliseconds. */
export function srtToVtt(srt: string): string {
  const body = srt.replaceAll("\r\n", "\n").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body.trim()}\n`;
}

/** The `.srt` file: numbered cues, CRLF line ends (what every player and upload page reads). */
export function toSrt(cues: readonly Cue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\r\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\r\n${cue.text.replaceAll("\n", "\r\n")}\r\n`,
    )
    .join("\r\n");
}
