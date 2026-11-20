/**
 * Casting: a fitting fish.audio voice for each speaker, picked at random among well-used public voices of the
 * right type (woman, man, girl, boy, old woman, old man, narrator). The automatic pick only takes plain voices:
 * every tag an ordinary word (gender, age, tone, use) and a plain name, so copies of real people and known
 * characters are left out. You can still choose any voice yourself in the picker.
 */
import type { FilmVoice, FilmVoices, VoiceType } from "../shared/types.ts";
import { type FishOptions, type VoiceCandidate, voiceCandidates } from "./fish.ts";

/** Tags of plain voices: who they are and how they sound or are used. Anything else (a show, a game, a name)
 * marks a copy. */
const PLAIN_TAGS = new Set([
  "male",
  "female",
  "neutral",
  "young",
  "middle-aged",
  "old",
  "elderly",
  "mature",
  "child",
  "kid",
  "teenage",
  "youthful",
  "narration",
  "narrative",
  "narrator",
  "storytelling",
  "audiobook",
  "documentary",
  "educational",
  "teacher",
  "professional",
  "conversational",
  "social-media",
  "advertisement",
  "entertainment",
  "podcast",
  "radio",
  "host",
  "news",
  "meditation",
  "motivational",
  "energetic",
  "enthusiastic",
  "lively",
  "upbeat",
  "dynamic",
  "animated",
  "expressive",
  "playful",
  "cheerful",
  "bright",
  "friendly",
  "warm",
  "gentle",
  "soft",
  "calm",
  "relaxed",
  "measured",
  "slow",
  "fast",
  "normal pace",
  "clear",
  "crisp",
  "smooth",
  "deep",
  "low",
  "low-pitched",
  "medium",
  "high",
  "raspy",
  "husky",
  "gravelly",
  "breathy",
  "whisper",
  "intimate",
  "authoritative",
  "confident",
  "serious",
  "dramatic",
  "intense",
  "cinematic",
  "mysterious",
  "dark",
  "atmospheric",
  "sincere",
  "empathetic",
  "motherly",
  "sad",
  "angry",
  "monotone",
  "articulate",
  "deliberate",
  "intellectual",
  "introspective",
  "melodic",
  "soulful",
  "neutral-tone",
  "english",
  "en-us",
  "british",
  "british accent",
  "american",
  "american accent",
  "neutral american",
]);

/** Words a plain voice title may be made of ("Friendly Women", "Calm Narrator"). */
const PLAIN_TITLE_WORDS = new Set([
  ...PLAIN_TAGS,
  "voice",
  "voices",
  "narrator",
  "storyteller",
  "woman",
  "women",
  "man",
  "men",
  "lady",
  "guy",
  "girl",
  "boy",
  "kid",
  "grandpa",
  "grandma",
  "reader",
  "speaker",
  "the",
  "a",
  "and",
]);

/** Common first names: a one-word title must be one of these (a nickname or a made-up word may be a famous
 * character or a brand). */
const FIRST_NAMES = new Set(
  (
    "sarah laura paula emma olivia ava sophia isabella mia charlotte amelia harper evelyn abigail emily ella " +
    "elizabeth sofia avery scarlett grace chloe victoria riley aria lily aubrey zoey hannah nora layla zoe " +
    "anna leah natalie lucy audrey claire stella violet hazel aurora savannah maya kate katie rachel rebecca " +
    "jessica jennifer amanda ashley megan lauren nicole stephanie heather michelle melissa amy angela helen " +
    "julia diana alice ruth rose ellen jane mary linda susan karen nancy lisa betty sandra donna carol sharon " +
    "martha judy joan janet ann anne marie clara eva nina lena sara rita monica sophie camille manon lucia " +
    "elena carmen ana maria fatima aisha mariam leila yasmin noor sienna jade freya isla poppy daisy james " +
    "john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark " +
    "donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob " +
    "gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank " +
    "patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle ethan " +
    "walter noah jeremy christian keith roger terry gerald harold sean austin carl arthur lawrence dylan jesse " +
    "jordan bryan billy joe bruce gabriel logan albert willie alan juan wayne elijah randy roy vincent ralph " +
    "eugene russell bobby mason philip louis liam oliver lucas leo theo oscar max finn adrian marcus victor " +
    "hugo felix julian simon martin oskar luca marco mateo diego carlos pablo omar ali hassan karim yusuf " +
    "ibrahim amir tom tim ben sam alex chris nick mike dan matt will jake luke owen evan ian colin grant"
  ).split(" "),
);

/** One-word names often copied from famous people and characters. */
const COPIED_NAMES = new Set(
  (
    "drake eminem beyonce rihanna adele shakira oprah mrbeast pewdiepie xqc ishowspeed speed kanye ye trump " +
    "biden obama elon musk goku naruto pikachu mario luigi sonic spongebob peppa bluey miku teto morty rick " +
    "homer bart shrek yoda gandalf batman joker deadpool kirby zelda link optimus jarvis siri alexa ronaldo " +
    "messi neymar gon killua luffy zoro tanjiro nezuko gojo itachi sasuke vegeta"
  ).split(" "),
);

const tagsOf = (voice: VoiceCandidate) => voice.tags.map((tag) => tag.toLowerCase());
const has = (voice: VoiceCandidate, ...tags: string[]) =>
  tagsOf(voice).some((tag) => tags.includes(tag));

/** A plain title: one name ("Sarah"), or only ordinary words ("Calm Narrator"). */
export function plainTitle(title: string): boolean {
  if (/[()[\]{}/\\#@'"’|:0-9]/.test(title)) return false;
  const words = title
    .trim()
    .split(/[\s\-–—_.,]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return false;
  if (words.length === 1) {
    const [word = ""] = words;
    return FIRST_NAMES.has(word) && !COPIED_NAMES.has(word);
  }
  return words.every((word) => PLAIN_TITLE_WORDS.has(word));
}

/** Fewer likes than this: too little known to pick blindly. */
const MIN_LIKES = 50;

const FEMALE_WORDS = /\b(female|woman|girl|she|her|lady)\b/i;
const MALE_WORDS = /\b(male|man|boy|he|his|guy)\b/i;

/** The description says the other gender than the tags (a mislabeled voice). */
function contradicts(voice: VoiceCandidate): boolean {
  const text = voice.description;
  if (has(voice, "female")) return MALE_WORDS.test(text) && !FEMALE_WORDS.test(text);
  if (has(voice, "male")) return FEMALE_WORDS.test(text) && !MALE_WORDS.test(text);
  return false;
}

/** The description names the voice itself ("ronaldo voice"): a copy of someone. */
function namesItself(voice: VoiceCandidate): boolean {
  const name = voice.name.trim().toLowerCase();
  return name.length >= 3 && !name.includes(" ") && voice.description.toLowerCase().includes(name);
}

/** A voice the automatic pick may use: plain tags and a plain name, liked enough, a sample to listen to. */
export function isPlain(voice: VoiceCandidate): boolean {
  const tags = tagsOf(voice);
  return (
    voice.likes >= MIN_LIKES &&
    !contradicts(voice) &&
    !namesItself(voice) &&
    tags.length > 0 &&
    tags.every((tag) => PLAIN_TAGS.has(tag)) &&
    plainTitle(voice.name) &&
    !/\b(impression|parody|imitat\w*|voice of|character from|clone)\b/i.test(voice.description) &&
    voice.sample !== null
  );
}

const adult = (voice: VoiceCandidate) => !has(voice, "child", "kid", "teenage");
const light = (voice: VoiceCandidate) =>
  has(voice, "high", "bright", "cheerful", "playful", "youthful", "soft");

/** For each type, where to look (one fish.audio tag) and what fits, best first. */
const STEPS: Record<VoiceType, { tag: string; fits: (voice: VoiceCandidate) => boolean }[]> = {
  narrator: [
    {
      tag: "narration",
      fits: (v) =>
        adult(v) && has(v, "narration", "narrator", "storytelling", "audiobook", "documentary"),
    },
    { tag: "male", fits: (v) => adult(v) && has(v, "middle-aged") },
  ],
  woman: [
    { tag: "female", fits: (v) => adult(v) && has(v, "female") && has(v, "young", "middle-aged") },
    { tag: "female", fits: (v) => adult(v) && has(v, "female") },
  ],
  man: [
    { tag: "male", fits: (v) => adult(v) && has(v, "male") && has(v, "young", "middle-aged") },
    { tag: "male", fits: (v) => adult(v) && has(v, "male") },
  ],
  "old-woman": [
    { tag: "old", fits: (v) => has(v, "female") && has(v, "old", "elderly") },
    {
      tag: "female",
      fits: (v) =>
        adult(v) &&
        has(v, "female") &&
        has(v, "middle-aged") &&
        has(v, "warm", "gentle", "soft", "motherly", "calm"),
    },
    { tag: "female", fits: (v) => adult(v) && has(v, "female") && has(v, "middle-aged") },
  ],
  "old-man": [
    { tag: "old", fits: (v) => has(v, "male") && has(v, "old", "elderly") },
    {
      tag: "male",
      fits: (v) => adult(v) && has(v, "male") && has(v, "deep", "low", "raspy", "gravelly"),
    },
  ],
  // Kid voices are rare: a light young woman's voice is the usual stand-in (as in cartoons).
  girl: [
    { tag: "child", fits: (v) => has(v, "child", "kid") && !has(v, "male") },
    { tag: "female", fits: (v) => has(v, "female") && has(v, "young") && light(v) },
    { tag: "female", fits: (v) => has(v, "female") && has(v, "young") },
  ],
  boy: [
    { tag: "child", fits: (v) => has(v, "child", "kid") && !has(v, "female") },
    { tag: "female", fits: (v) => has(v, "female") && has(v, "young") && light(v) },
    { tag: "male", fits: (v) => has(v, "male") && has(v, "young") },
  ],
};

const POOL_TTL = 60 * 60 * 1000;
/** How many of the best-liked fitting voices the pick chooses from. */
const TOP = 15;
const pools = new Map<string, { at: number; voices: Promise<VoiceCandidate[]> }>();

/** The 300 most used voices with a tag (three pages); kept for an hour. */
function pool(options: FishOptions, tag: string, language: string): Promise<VoiceCandidate[]> {
  const key = `${options.baseUrl ?? ""}|${tag}|${language}`;
  const known = pools.get(key);
  if (known && Date.now() - known.at < POOL_TTL) return known.voices;
  const voices = Promise.allSettled(
    [1, 2, 3].map((page) => voiceCandidates(options, { tag, language, page })),
  ).then((pages) => {
    const read = pages.flatMap((page) => (page.status === "fulfilled" ? [page.value] : []));
    // Not one page came back: say why (no internet, fish.audio down...).
    const failed = pages.find((page) => page.status === "rejected");
    if (read.length === 0 && failed) throw failed.reason;
    const seen = new Set<string>();
    return read.flat().filter((voice) => !seen.has(voice.id) && seen.add(voice.id));
  });
  pools.set(key, { at: Date.now(), voices });
  // A failed or empty answer isn't kept: the next cast asks again.
  voices.then(
    (list) => {
      if (list.length === 0) pools.delete(key);
    },
    () => pools.delete(key),
  );
  return voices;
}

/** Forgets the cached voice lists (tests). */
export function forgetPools(): void {
  pools.clear();
}

/** A random plain voice of this type that the film doesn't use yet, or null when none is found. */
export async function pickVoice(
  options: FishOptions,
  type: VoiceType,
  { language = "en", avoid = new Set<string>(), random = Math.random } = {} as {
    language?: string;
    avoid?: ReadonlySet<string>;
    random?: () => number;
  },
): Promise<FilmVoice | null> {
  for (const step of STEPS[type]) {
    const candidates = (await pool(options, step.tag, language))
      .filter((voice) => isPlain(voice) && step.fits(voice) && !avoid.has(voice.id))
      .sort((a, b) => b.likes - a.likes || b.uses - a.uses)
      .slice(0, TOP);
    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
      if (chosen) {
        return {
          id: chosen.id,
          name: chosen.name,
          type,
          auto: true,
          ...(chosen.sample ? { sample: chosen.sample } : {}),
        };
      }
    }
  }
  return null;
}

export interface CastResult {
  voices: FilmVoices;
  /** Speakers no voice was found for (plain words). */
  problems: string[];
}

/**
 * Gives every speaker a voice. A speaker that has one keeps it (its type is noted); a character you gave a
 * voice before gets that voice again (`remembered`); everyone else gets a random fitting voice. No two speakers
 * share a voice.
 */
export async function castVoices(
  options: FishOptions,
  current: FilmVoices,
  speakers: readonly { speaker: string; type: VoiceType }[],
  {
    language = "en",
    remembered = {},
    random = Math.random,
  }: {
    language?: string;
    remembered?: Readonly<Record<string, FilmVoice>>;
    random?: () => number;
  } = {},
): Promise<CastResult> {
  const voices: FilmVoices = { ...current };
  const problems: string[] = [];
  const used = () => new Set(Object.values(voices).map((voice) => voice.id));
  for (const { speaker, type } of speakers) {
    const known = voices[speaker];
    if (known) {
      if (!known.type) voices[speaker] = { ...known, type };
      continue;
    }
    const again = speaker === "narrator" ? undefined : remembered[speaker];
    if (again && !used().has(again.id)) {
      voices[speaker] = {
        id: again.id,
        name: again.name,
        type,
        ...(again.sample ? { sample: again.sample } : {}),
      };
      continue;
    }
    const picked = await pickVoice(options, type, { language, avoid: used(), random });
    if (picked) voices[speaker] = picked;
    else
      problems.push(
        `No ${type.replace("-", " ")} voice was found for ${speaker}: choose one in the Voice tab.`,
      );
  }
  return { voices, problems };
}
