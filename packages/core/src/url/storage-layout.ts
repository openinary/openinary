import { extOf, isTransformableImageExt, isVideoExt } from "./media-types";

/**
 * Bucket layout: originals under the media prefix ("public/" unless
 * configured), derivatives under cache/{md5}.{ext} carrying an
 * x-original-path metadata entry, folder markers as empty "{folder}/" objects.
 */

/** The media prefix every deployment used before it became configurable. */
export const DEFAULT_MEDIA_PREFIX = "public";

/**
 * Namespaces the product owns at the bucket root. Media must not be configured
 * into either: cache cleanup lists and deletes everything under `cache/`, so a
 * prefix inside it would have the media deleted out from under it.
 */
const RESERVED_PREFIXES = ["cache", ".openinary"];

/**
 * Normalizes a configured prefix into a value that is safe to concatenate: no
 * leading slash, exactly one trailing slash when non-empty.
 *
 * An explicitly empty prefix means "store media at the bucket root" and yields
 * "". Leaving it undefined keeps the historical "public/" layout.
 *
 * Throws on a prefix that collides with a reserved namespace. Startup is the
 * only place this is cheap to catch: the alternative is discovering it when the
 * cache sweep removes the media.
 */
export function normalizeMediaPrefix(prefix: string | undefined): string {
  if (prefix === undefined) return `${DEFAULT_MEDIA_PREFIX}/`;
  const trimmed = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return "";
  // Only the first segment matters, and comparison is case-sensitive because S3
  // keys are: "Cache/" is a different namespace, "cache/media" is not.
  const head = trimmed.split("/")[0];
  if (RESERVED_PREFIXES.includes(head)) {
    throw new Error(
      `Invalid storage prefix ${JSON.stringify(trimmed)}: "${head}/" is reserved ` +
        `for Openinary's own use. Pick a prefix outside ` +
        `${RESERVED_PREFIXES.map((r) => `"${r}/"`).join(" and ")}.`,
    );
  }
  return `${trimmed}/`;
}

/**
 * True when a delivery path would land in a namespace the product owns. Only
 * possible with the empty prefix: under any other prefix the key is nested
 * below it and cannot reach cache/ or .openinary/.
 */
export function isReservedMediaPath(mediaPrefix: string, path: string): boolean {
  if (mediaPrefix !== "") return false;
  const head = path.replace(/^\/+/, "").split("/")[0];
  return RESERVED_PREFIXES.includes(head);
}

/**
 * A relative storage key from request input: "\" read as "/", empty and edge
 * segments dropped. Null when it holds a "." or ".." segment or a NUL, since
 * without a bucket keys are joined onto the public folder on local disk.
 */
export function cleanStorageKey(raw: string): string | null {
  if (raw.includes("\0")) return null;
  const segments = raw.split(/[/\\]+/).filter(Boolean);
  return segments.some((s) => s === "." || s === "..") ? null : segments.join("/");
}

/**
 * The first free path among "a.jpg", "a (1).jpg", "a (2).jpg", ... A
 * duplicate is the same full path (folders + filename).
 */
export async function getUniqueFilePath(
  originalPath: string,
  exists: (filePath: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  if (!(await exists(originalPath))) return originalPath;

  const slash = originalPath.lastIndexOf("/");
  const dir = originalPath.slice(0, slash + 1);
  const baseName = originalPath.slice(slash + 1);
  const ext = extOf(baseName) ? baseName.slice(baseName.lastIndexOf(".")) : "";
  const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;

  for (let i = 1; i <= maxAttempts; i++) {
    const candidatePath = `${dir}${nameWithoutExt} (${i})${ext}`;
    if (!(await exists(candidatePath))) return candidatePath;
  }
  throw new Error(
    `Unable to generate unique file path after ${maxAttempts} attempts for ${originalPath}`,
  );
}

export type MediaType = "image" | "video";

export type FolderPreviewItem = { path: string; type: MediaType };

export type LevelFile = {
  name: string;
  path: string;
  size?: number;
  mtime?: string;
};

export type LevelFolder = {
  name: string;
  path: string;
};

export type FolderSummary = {
  itemCount: number;
  truncated: boolean;
  previewItems: FolderPreviewItem[];
};

type ListedObject = { key: string; size?: number; lastModified?: Date };

export const FOLDER_SUMMARY_MAX_KEYS = 100;
export const FOLDER_PREVIEW_LIMIT = 4;

export function getMediaType(name: string): MediaType | null {
  const ext = extOf(name);
  if (isTransformableImageExt(ext)) return "image";
  if (isVideoExt(ext)) return "video";
  return null;
}

/**
 * Normalizes a user-provided folder path.
 * Returns "" for the root, null when the path is invalid (empty segments,
 * "." or "..", critical to prevent traversal in the local-FS fallback).
 */
export function normalizeLevelPath(raw: string): string | null {
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";

  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      return null;
    }
  }
  return segments.join("/");
}

/**
 * Shapes one delimiter-listed directory level into folder names and files.
 * `storagePrefix` is the raw listing prefix (e.g. "public/cows/"), `folderPath`
 * the relative path of the listed folder ("" for root). The folder marker
 * object (key === storagePrefix) is excluded.
 */
export function shapeLevel(
  storagePrefix: string,
  folderPath: string,
  delimited: { prefixes: string[]; objects: ListedObject[] },
): { folderNames: string[]; files: LevelFile[] } {
  const folderNames = delimited.prefixes
    .map((prefix) => prefix.slice(storagePrefix.length).replace(/\/+$/, ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const files = delimited.objects
    .filter((obj) => obj.key !== storagePrefix)
    .map((obj) => {
      const name = obj.key.slice(storagePrefix.length);
      return {
        name,
        path: folderPath ? `${folderPath}/${name}` : name,
        size: obj.size,
        mtime: obj.lastModified?.toISOString(),
      };
    })
    .filter((file) => file.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { folderNames, files };
}

/**
 * Shapes a bounded single-page listing of a folder into its summary:
 * direct child count (capped by the page size), truncation flag and up to
 * FOLDER_PREVIEW_LIMIT media preview items.
 */
export function shapeFolderSummary(
  storagePrefix: string,
  folderPath: string,
  page: { prefixes: string[]; objects: ListedObject[]; isTruncated: boolean },
  previewLimit = FOLDER_PREVIEW_LIMIT,
): FolderSummary {
  const children = page.objects.filter((obj) => obj.key !== storagePrefix);

  const previewItems: FolderPreviewItem[] = [];
  for (const obj of children) {
    if (previewItems.length >= previewLimit) break;
    const name = obj.key.slice(storagePrefix.length);
    const type = getMediaType(name);
    if (type) {
      previewItems.push({
        path: folderPath ? `${folderPath}/${name}` : name,
        type,
      });
    }
  }

  return {
    itemCount: page.prefixes.length + children.length,
    truncated: page.isTruncated,
    previewItems,
  };
}

/**
 * Derives every folder path (including intermediate ones) from a flat list of
 * relative keys. Marker keys ("a/b/") count as folders themselves.
 */
export function deriveFolderPaths(keys: string[]): string[] {
  const folders = new Set<string>();

  for (const key of keys) {
    const normalized = key.replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    const dirDepth = normalized.endsWith("/") ? parts.length : parts.length - 1;

    for (let i = 1; i <= dirDepth; i++) {
      folders.add(parts.slice(0, i).join("/"));
    }
  }

  return [...folders].sort((a, b) => a.localeCompare(b));
}
