/**
 * The asset library: `<workspace>/assets/{images,videos,sounds,fonts}/`. Files are sorted into the folder of
 * their kind when they come in, and copied into a film when it uses them.
 */
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { KIND_FOLDERS, MEDIA_KINDS, type MediaKind, mediaKindOf } from "../shared/media.ts";
import type { Asset } from "../shared/types.ts";
import { checkUploadName, freeName, oneAtATime, saveUpload, UploadError } from "./uploads.ts";
import { resolveInside } from "./workspace.ts";

const kindOfFolder = (folder: string): MediaKind | null =>
  MEDIA_KINDS.find((kind) => KIND_FOLDERS[kind] === folder) ?? null;

/** The file of an asset id ("sounds/rain.mp3"), or null when the id isn't a library file. */
export function assetFile(
  assetsDir: string,
  id: string,
): { path: string; kind: MediaKind; name: string } | null {
  const [folder, name, ...rest] = id.split("/");
  if (!folder || !name || rest.length) return null;
  const kind = kindOfFolder(folder);
  if (!kind || mediaKindOf(name) !== kind) return null;
  const path = resolveInside(assetsDir, `${folder}/${name}`);
  return path ? { path, kind, name } : null;
}

/** Every file in the library, newest first. */
export async function listAssets(assetsDir: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  for (const kind of MEDIA_KINDS) {
    const folder = KIND_FOLDERS[kind];
    const entries = await readdir(join(assetsDir, folder), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".") || mediaKindOf(entry.name) !== kind)
        continue;
      const info = await stat(join(assetsDir, folder, entry.name)).catch(() => null);
      if (!info) continue;
      assets.push({
        id: `${folder}/${entry.name}`,
        kind,
        name: entry.name,
        size: info.size,
        addedAt: info.mtime.toISOString(),
      });
    }
  }
  return assets.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.name.localeCompare(b.name));
}

/** Saves an uploaded file into the library, in the folder of its kind. */
export async function importAsset(
  assetsDir: string,
  body: Readable,
  name: string | undefined,
): Promise<Asset> {
  const clean = checkUploadName(name, MEDIA_KINDS);
  const kind = mediaKindOf(clean) as MediaKind;
  const folder = KIND_FOLDERS[kind];
  const saved = await saveUpload(body, join(assetsDir, folder), clean);
  const info = await stat(join(assetsDir, folder, saved));
  return {
    id: `${folder}/${saved}`,
    kind,
    name: saved,
    size: info.size,
    addedAt: info.mtime.toISOString(),
  };
}

export async function deleteAsset(assetsDir: string, id: string): Promise<void> {
  const file = assetFile(assetsDir, id);
  if (!file) throw new UploadError("This asset doesn't exist (any more).");
  await rm(file.path, { force: true });
}

/**
 * Copies a library file into a film: sounds into `audio/`, everything else into `assets/<kind folder>/`.
 * A file with the same name and size already there is reused. Returns its path inside the film.
 */
export async function copyAssetToFilm(
  assetsDir: string,
  id: string,
  filmDir: string,
): Promise<string> {
  const file = assetFile(assetsDir, id);
  const source = file ? await stat(file.path).catch(() => null) : null;
  if (!file || !source?.isFile()) throw new UploadError("This asset doesn't exist (any more).");
  const folder = file.kind === "sound" ? "audio" : `assets/${KIND_FOLDERS[file.kind]}`;
  const dir = join(filmDir, ...folder.split("/"));
  await mkdir(dir, { recursive: true });
  return oneAtATime(dir, async () => {
    const same = await stat(join(dir, file.name)).catch(() => null);
    if (same?.isFile() && same.size === source.size) return `${folder}/${file.name}`;
    const name = await freeName(dir, file.name);
    await copyFile(file.path, join(dir, name));
    return `${folder}/${name}`;
  });
}
