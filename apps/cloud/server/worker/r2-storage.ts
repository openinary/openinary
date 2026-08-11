// Worker-native port of @openinary/core's CloudStorage (dist/utils/storage/cloud-storage.js)
// onto the Worker's own R2 binding, so /storage, /upload, /download etc. no
// longer need the container's S3-over-HTTPS client. Every function takes the
// binding + tenantRoot explicitly instead of the container's per-request
// AsyncLocalStorage context (scoped-storage.ts) - there's no request-scoped
// storage instance here, just plain calls.
//
// Key conventions mirrored exactly from core (must match, since the
// container's transform route and VideoWorker still write through the S3
// API to the same bucket):
//   - originals:        public/{tenantRoot}/{path}
//   - folder markers:   public/{tenantRoot}/{folder}/  (empty object,
//                        Content-Type application/x-directory)
//   - transform cache:  cache/{md5(fullPath+JSON(params))}.{ext}, with
//                        customMetadata["x-original-path"] = encodeURIComponent(fullPath)
//                        (see transform-cache.ts's generateCacheKey - fullPath
//                        there is "{tenantRoot}/{relativePath}", same as here)

import { posix as path } from "node:path";

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".psd",
];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];
const FOLDER_SUMMARY_MAX_KEYS = 100;
const FOLDER_PREVIEW_LIMIT = 4;

export type FileEntry = {
  name: string;
  path: string;
  size: number;
  mtime?: string;
};
export type Level = { folderNames: string[]; files: FileEntry[] };
export type FolderSummaryItem = { path: string; type: "image" | "video" };
export type FolderSummary = {
  itemCount: number;
  truncated: boolean;
  previewItems: FolderSummaryItem[];
};
export type OriginalMetadata = {
  size: number;
  createdAt: string;
  updatedAt: string;
};

function getMediaType(name: string): "image" | "video" | null {
  const lower = name.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "image";
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
  return null;
}

// Mirrors utils/storage-level.js's normalizeLevelPath: "" for root, null for
// an invalid path (empty segments, "." or "..").
export function normalizeLevelPath(raw: string): string | null {
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === "." || segment === "..") return null;
  }
  return trimmed;
}

// Every reader addresses an R2 key through a URL, and these characters make
// that impossible no matter how the reader is written:
//   "#" ends the path there - the rest is a fragment the browser never sends,
//       so "The #1.mp4" is fetched as "The " and 404s;
//   "?" does the same as a query string;
//   "%" survives the round trip as a *different* key, because every read path
//       decodes ("50%20off.mp4" is looked up as "50 off.mp4");
//   control characters would land in the x-original-path and
//       Content-Disposition headers we write from the key.
// Stripped at every write instead of encoded at every read: the readers are
// @openinary/ui, the playground, and whatever the customer hand-writes into
// their own <video src> - only the write side is ours to fix. Spaces and
// accents are deliberately kept; those survive a URL fine.
export function stripUrlHostile(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  return value.replace(/[#?%\u0000-\u001f]/g, "");
}

function publicPrefix(tenantRoot: string, folderPath: string): string {
  return folderPath
    ? `public/${tenantRoot}/${folderPath}/`
    : `public/${tenantRoot}/`;
}

function publicKey(tenantRoot: string, filePath: string): string {
  return `public/${tenantRoot}/${filePath}`;
}

// Mirrors utils/storage-level.js's shapeLevel.
function shapeLevel(
  storagePrefix: string,
  folderPath: string,
  prefixes: string[],
  objects: R2Object[],
): Level {
  const folderNames = prefixes
    .map((prefix) => prefix.slice(storagePrefix.length).replace(/\/+$/, ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const files = objects
    .filter((obj) => obj.key !== storagePrefix)
    .map((obj) => {
      const name = obj.key.slice(storagePrefix.length);
      return {
        name,
        path: folderPath ? `${folderPath}/${name}` : name,
        size: obj.size,
        mtime: obj.uploaded.toISOString(),
      };
    })
    .filter((file) => file.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { folderNames, files };
}

// One directory level (delimiter "/"), all pages merged.
export async function listLevel(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
): Promise<Level> {
  const storagePrefix = publicPrefix(tenantRoot, folderPath);
  const prefixes = new Set<string>();
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix: storagePrefix,
      delimiter: "/",
      cursor,
      limit: 1000,
    });
    for (const p of page.delimitedPrefixes) prefixes.add(p);
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return shapeLevel(storagePrefix, folderPath, [...prefixes], objects);
}

// Bounded single-page summary (mirrors getFolderSummary/shapeFolderSummary).
export async function folderSummary(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
): Promise<FolderSummary> {
  const storagePrefix = publicPrefix(tenantRoot, folderPath);
  const page = await bucket.list({
    prefix: storagePrefix,
    delimiter: "/",
    limit: FOLDER_SUMMARY_MAX_KEYS,
  });
  const children = page.objects.filter((obj) => obj.key !== storagePrefix);
  const previewItems: FolderSummaryItem[] = [];
  for (const obj of children) {
    if (previewItems.length >= FOLDER_PREVIEW_LIMIT) break;
    const name = obj.key.slice(storagePrefix.length);
    const type = getMediaType(name);
    if (type)
      previewItems.push({
        path: folderPath ? `${folderPath}/${name}` : name,
        type,
      });
  }
  return {
    itemCount: page.delimitedPrefixes.length + children.length,
    truncated: page.truncated,
    previewItems,
  };
}

// Full (non-delimited) listing under a raw prefix, all cursor pages merged.
// Used for /storage/folders, folder rename/delete, and cache invalidation.
export async function listAll(
  bucket: R2Bucket,
  prefix: string,
): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

// Mirrors utils/storage-level.js's deriveFolderPaths, scoped to one tenant's
// public/ objects (marker keys count as folders themselves).
export function deriveFolderPaths(
  objects: R2Object[],
  tenantRoot: string,
): string[] {
  const tenantPrefix = `public/${tenantRoot}/`;
  const folders = new Set<string>();
  for (const obj of objects) {
    if (!obj.key.startsWith(tenantPrefix)) continue;
    const relative = obj.key.slice(tenantPrefix.length);
    const parts = relative.split("/").filter(Boolean);
    const dirDepth = relative.endsWith("/") ? parts.length : parts.length - 1;
    for (let i = 1; i <= dirDepth; i++)
      folders.add(parts.slice(0, i).join("/"));
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

export async function createFolder(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
): Promise<void> {
  await bucket.put(publicPrefix(tenantRoot, folderPath), "", {
    httpMetadata: { contentType: "application/x-directory" },
  });
}

export async function folderExists(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
): Promise<boolean> {
  const markerKey = publicPrefix(tenantRoot, folderPath);
  if (await bucket.head(markerKey)) return true;
  const page = await bucket.list({ prefix: markerKey, limit: 1 });
  return page.objects.length > 0;
}

export async function existsOriginal(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
): Promise<boolean> {
  return (await bucket.head(publicKey(tenantRoot, filePath))) !== null;
}

export async function getOriginalMetadata(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
): Promise<OriginalMetadata | null> {
  const obj = await bucket.head(publicKey(tenantRoot, filePath));
  if (!obj) return null;
  // R2 only tracks one upload timestamp, same simplification core makes with
  // S3's lastModified for both createdAt/updatedAt.
  const iso = obj.uploaded.toISOString();
  return { size: obj.size, createdAt: iso, updatedAt: iso };
}

export async function deleteOriginal(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
): Promise<void> {
  await bucket.delete(publicKey(tenantRoot, filePath));
}

export async function uploadOriginal(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
  body: ReadableStream | ArrayBuffer | Blob,
  contentType: string,
): Promise<void> {
  await bucket.put(publicKey(tenantRoot, filePath), body, {
    httpMetadata: { contentType },
  });
}

export async function downloadOriginal(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(publicKey(tenantRoot, filePath));
}

// Partial read for /download/*'s Range support - mediabunny's UrlSource
// (used to pull one video frame client-side for thumbnail generation, see
// generate-video-thumbnail.ts) needs this to fetch just the moov atom and a
// keyframe's worth of bytes instead of the whole file.
export async function downloadOriginalRange(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
  range: R2Range,
): Promise<R2ObjectBody | null> {
  return bucket.get(publicKey(tenantRoot, filePath), { range });
}

// R2 binding has no server-side copy command - streams a get straight into a
// put, preserving http/custom metadata, instead of buffering in Worker memory.
export async function copyObject(
  bucket: R2Bucket,
  sourceKey: string,
  destKey: string,
): Promise<void> {
  const source = await bucket.get(sourceKey);
  if (!source) throw new Error(`Source object not found: ${sourceKey}`);
  await bucket.put(destKey, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata,
  });
}

export async function copyOriginal(
  bucket: R2Bucket,
  tenantRoot: string,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  await copyObject(
    bucket,
    publicKey(tenantRoot, sourcePath),
    publicKey(tenantRoot, destPath),
  );
}

export async function renameOriginal(
  bucket: R2Bucket,
  tenantRoot: string,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  await copyOriginal(bucket, tenantRoot, sourcePath, destPath);
  await deleteOriginal(bucket, tenantRoot, sourcePath);
}

// ponytail: sequential get+put+delete per object (mirrors core's own
// renameFolder loop) - the 1000-subrequest/request ceiling caps this at
// roughly 300 objects per folder; batch or move to a Queue if that's hit.
export async function renameFolder(
  bucket: R2Bucket,
  tenantRoot: string,
  oldFolderPath: string,
  newFolderPath: string,
): Promise<void> {
  const prefix = publicPrefix(tenantRoot, oldFolderPath);
  const newPrefix = publicPrefix(tenantRoot, newFolderPath);
  const objects = await listAll(bucket, prefix);
  for (const obj of objects) {
    const relativeKey = obj.key.slice(prefix.length);
    await copyObject(bucket, obj.key, `${newPrefix}${relativeKey}`);
    await bucket.delete(obj.key);
  }
}

// Deletes every object under a folder prefix (marker + contents). Returns
// the number of keys deleted and their total size, mirroring core's
// deleteFolder plus the byte count callers need for storage-quota tracking.
export async function deleteFolder(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
): Promise<{ count: number; bytes: number }> {
  const prefix = publicPrefix(tenantRoot, folderPath);
  const objects = await listAll(bucket, prefix);
  if (objects.length === 0) return { count: 0, bytes: 0 };
  const keys = objects.map((obj) => obj.key);
  const bytes = objects.reduce((sum, obj) => sum + obj.size, 0);
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
  return { count: keys.length, bytes };
}

// Every cache/ object belonging to one tenant, matched via customMetadata's
// "x-original-path" rather than an R2 prefix - cache/ keys are md5 hashes
// with no per-tenant grouping (see deleteCachedTransformations). Backs the
// per-bucket numbers in /storage/stats since a full cache/ scan is too
// expensive to do on every read (see schema/bucket.ts).
export async function listCacheForTenant(
  bucket: R2Bucket,
  tenantRoot: string,
): Promise<R2Object[]> {
  const prefix = encodeURIComponent(`${tenantRoot}/`);
  const matches: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix: "cache/",
      cursor,
      limit: 1000,
      include: ["customMetadata"],
    });
    for (const obj of page.objects) {
      if (obj.customMetadata?.["x-original-path"]?.startsWith(prefix))
        matches.push(obj);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return matches;
}

export async function deleteCacheForTenant(
  bucket: R2Bucket,
  tenantRoot: string,
): Promise<{ count: number; bytes: number }> {
  const objects = await listCacheForTenant(bucket, tenantRoot);
  if (objects.length === 0) return { count: 0, bytes: 0 };
  const keys = objects.map((obj) => obj.key);
  const bytes = objects.reduce((sum, obj) => sum + obj.size, 0);
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
  return { count: keys.length, bytes };
}

// fullPath is "{tenantRoot}/{relativePath}" - the same "originalPath" the
// container's TransformService hashes into cache/ keys (see
// transform-cache.ts's generateCacheKey and tryServeFromR2Cache).
//
// Matches that one file *and* anything beneath it as a folder, so a caller
// renaming a 500-file directory sweeps it in this one scan rather than 500 of
// them - cache/ keys are md5 hashes with no per-tenant grouping, so every call
// costs a full pass over every tenant's derivatives and calling it per file
// would exhaust the Worker's subrequest budget. The folder prefix ends at an
// encoded "/" ("a%2Fb%2F"), so "photos/" can't take "photos2/" with it, and
// for a file path it simply never matches (a file has no children), leaving
// the delete path's behaviour unchanged.
export async function deleteCachedTransformations(
  bucket: R2Bucket,
  fullPath: string,
): Promise<number> {
  const target = encodeURIComponent(fullPath);
  const folderPrefix = encodeURIComponent(`${fullPath}/`);
  const keysToDelete: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix: "cache/",
      cursor,
      limit: 1000,
      include: ["customMetadata"],
    });
    for (const obj of page.objects) {
      const original = obj.customMetadata?.["x-original-path"];
      if (original === target || original?.startsWith(folderPrefix))
        keysToDelete.push(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (keysToDelete.length === 0) return 0;
  for (let i = 0; i < keysToDelete.length; i += 1000) {
    await bucket.delete(keysToDelete.slice(i, i + 1000));
  }
  return keysToDelete.length;
}

// Mirrors utils/get-unique-file-path.js exactly: "(1)", "(2)", ... suffixes
// before the extension until an unused path is found.
export async function getUniqueFilePath(
  originalPath: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  if (!(await exists(originalPath))) return originalPath;
  const dir = path.dirname(originalPath);
  const baseName = path.basename(originalPath);
  const ext = path.extname(baseName);
  const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;
  for (let i = 1; i <= maxAttempts; i++) {
    const candidateName = `${nameWithoutExt} (${i})${ext}`;
    const candidatePath =
      dir === "." ? candidateName : `${dir}/${candidateName}`;
    if (!(await exists(candidatePath))) return candidatePath;
  }
  throw new Error(
    `Unable to generate unique file path after ${maxAttempts} attempts for ${originalPath}`,
  );
}
