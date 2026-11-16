// Cloud's storage on the Worker's own R2 binding, in the bucket layout core
// defines (@openinary/core/url storage-layout): originals under
// public/{tenantRoot}/, derivatives under cache/ with an x-original-path
// entry. The container's transform route and VideoWorker write to the same
// bucket over S3, so the two must agree. Every function takes the binding and
// tenantRoot explicitly; there is no request-scoped storage instance here.
//
// Cloud pins the default "public" prefix: core's is configurable for
// self-hosters serving a bucket whose layout they do not own.

import {
  DEFAULT_MEDIA_PREFIX,
  deriveFolderPaths as deriveRelativeFolderPaths,
  FOLDER_SUMMARY_MAX_KEYS,
  shapeFolderSummary,
  shapeLevel,
  type FolderSummary,
  type LevelFile,
} from "@openinary/core/url";

type OriginalMetadata = {
  size: number;
  createdAt: string;
  updatedAt: string;
};

function publicPrefix(tenantRoot: string, folderPath: string): string {
  return folderPath
    ? `${DEFAULT_MEDIA_PREFIX}/${tenantRoot}/${folderPath}/`
    : `${DEFAULT_MEDIA_PREFIX}/${tenantRoot}/`;
}

function publicKey(tenantRoot: string, filePath: string): string {
  return `${DEFAULT_MEDIA_PREFIX}/${tenantRoot}/${filePath}`;
}

const listed = (obj: R2Object) => ({ key: obj.key, size: obj.size, lastModified: obj.uploaded });

// One directory level (delimiter "/"), all pages merged, in the shape
// GET /storage answers with.
export async function listLevel(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
): Promise<{
  path: string;
  folders: { name: string; path: string }[];
  files: LevelFile[];
}> {
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
  const { folderNames, files } = shapeLevel(storagePrefix, folderPath, {
    prefixes: [...prefixes],
    objects: objects.map(listed),
  });
  const folders = folderNames.map((name) => ({
    name,
    path: folderPath ? `${folderPath}/${name}` : name,
  }));
  return { path: folderPath, folders, files };
}

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
  return shapeFolderSummary(storagePrefix, folderPath, {
    prefixes: page.delimitedPrefixes,
    objects: page.objects.map(listed),
    isTruncated: page.truncated,
  });
}

// Full (non-delimited) listing under a raw prefix, all cursor pages merged.
async function listAll(
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

/** Every original of one tenant, folder markers left out. */
export async function listOriginals(
  bucket: R2Bucket,
  tenantRoot: string,
): Promise<R2Object[]> {
  const objects = await listAll(bucket, publicPrefix(tenantRoot, ""));
  return objects.filter((obj) => !obj.key.endsWith("/"));
}

/** Folder paths of one tenant's originals (marker keys count as folders). */
export async function listFolderPaths(
  bucket: R2Bucket,
  tenantRoot: string,
): Promise<string[]> {
  const tenantPrefix = publicPrefix(tenantRoot, "");
  const objects = await listAll(bucket, tenantPrefix);
  return deriveRelativeFolderPaths(
    objects.map((obj) => obj.key.slice(tenantPrefix.length)),
  );
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
  bucket: Pick<R2Bucket, "head">,
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
  options?: R2GetOptions,
): Promise<R2ObjectBody | null> {
  return bucket.get(publicKey(tenantRoot, filePath), options);
}

// R2 binding has no server-side copy command - streams a get straight into a
// put, preserving http/custom metadata, instead of buffering in Worker memory.
async function copyObject(
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
// expensive to do on every read (see shared/db/schema/bucket.ts).
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
// container's TransformService hashes into cache/ keys.
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
