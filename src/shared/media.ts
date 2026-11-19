/** The kinds of files Kairos takes in: assets, sounds and references. */
export type MediaKind = "image" | "video" | "sound" | "font";

export const MEDIA_KINDS: readonly MediaKind[] = ["image", "video", "sound", "font"];

/** File extensions of each kind, with the type the browser needs to show or play them. */
export const MEDIA_TYPES: Record<MediaKind, Record<string, string>> = {
  image: {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
  },
  video: { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" },
  sound: {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
  },
  font: { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" },
};

/** The folder each kind goes in, in the asset library and in films (`assets/images/`...). */
export const KIND_FOLDERS: Record<MediaKind, string> = {
  image: "images",
  video: "videos",
  sound: "sounds",
  font: "fonts",
};

const extension = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

/** The kind of a file from its name, or null when Kairos doesn't take it. */
export function mediaKindOf(name: string): MediaKind | null {
  if (!name.includes(".")) return null;
  const ext = extension(name);
  return MEDIA_KINDS.find((kind) => ext in MEDIA_TYPES[kind]) ?? null;
}

/** The content type to serve a file with (from its name). */
export function contentTypeOf(name: string): string {
  const kind = mediaKindOf(name);
  return kind
    ? (MEDIA_TYPES[kind][extension(name)] ?? "application/octet-stream")
    : "application/octet-stream";
}

/** What the file picker accepts for some kinds (`.png,.jpg,...`). */
export function acceptFor(kinds: readonly MediaKind[]): string {
  return kinds.flatMap((kind) => Object.keys(MEDIA_TYPES[kind]).map((ext) => `.${ext}`)).join(",");
}

/** "a picture", "a video"... for messages. */
export const KIND_WORDS: Record<MediaKind, string> = {
  image: "picture",
  video: "video",
  sound: "sound",
  font: "font",
};

/** "12.4 MB" */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
