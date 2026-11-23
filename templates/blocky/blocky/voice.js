// The film's real voices, read while the film loads: the lines Kairos made (voice/lines.json), what each one
// says and who says it (voice/script.json), and where each clip sits on the timeline (kairos.json "audio").
// Shots, captions and mouths follow them. Without voices the film plays with its own timing.

const ms = (t) => Math.round(t * 1000) / 1000;

/**
 * The spoken lines on the film's timeline, in film time (seconds), in time order:
 * `{ id, speaker, text, said, start, end, words: [{ text, start, end }] }`. `text` is the script's words, `said`
 * the words of the voice as made (they differ until the voice is made again).
 */
export function voiceLinesFrom(config, script, made) {
  const audio =
    typeof config?.audio === "string" ? [{ file: config.audio }] : (config?.audio ?? []);
  const voices = new Map((made ?? []).map((line) => [line.id, line]));
  const lines = [];
  for (const line of script?.lines ?? []) {
    const voice = voices.get(line.line);
    const clip = voice && audio.find((track) => track?.file === voice.file);
    if (!clip) continue;
    const at = Number(clip.start) || 0;
    const from = Number(clip.from) || 0;
    const length = Number(clip.length) || Math.max(0, (Number(voice.duration) || 0) - from);
    if (length <= 0) continue;
    // Only the part of the file that plays (a trimmed clip leaves words out).
    const words = (voice.words ?? [])
      .filter((word) => word.start >= from - 0.01 && word.start < from + length)
      .map((word) => ({
        text: String(word.text),
        start: ms(at + word.start - from),
        end: ms(at + Math.min(word.end, from + length) - from),
      }));
    lines.push({
      id: line.id,
      speaker: line.speaker,
      text: line.text,
      said: voice.text,
      start: ms(at),
      end: ms(at + length),
      words,
    });
  }
  return lines.sort((a, b) => a.start - b.start);
}

/** Reads the film's voices from its folder (no voices, or a broken file: none). */
export async function loadVoices() {
  const get = (path) =>
    fetch(path, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  const [config, script, made] = await Promise.all([
    get("kairos.json"),
    get("voice/script.json"),
    get("voice/lines.json"),
  ]);
  if (!config || !script) return [];
  try {
    return voiceLinesFrom(config, script, made?.lines ?? []);
  } catch {
    return [];
  }
}
