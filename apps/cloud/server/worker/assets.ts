// What happens to everything derived from a stored original when the original
// is deleted, renamed, moved or copied: its R2 object, its cached derivatives,
// its video jobs and its media_duration row move together, so no caller can
// leave one behind. Storage metering stays with the caller, which knows whose
// account to credit.

import { posix as path } from "node:path";
import { getUniqueFilePath, stripUrlHostile } from "@openinary/core/url";
import {
  copyDuration,
  deleteDuration,
  deleteDurationsUnder,
  moveDuration,
} from "./media-duration.js";
import * as r2 from "./r2-storage.js";
import { deleteVideoJobs, deleteVideoJobsUnder } from "./video-jobs.js";

/** Runs a promise past the response (ctx.waitUntil). */
type Defer = (promise: Promise<unknown>) => void;

/**
 * Drops the cached derivatives an asset had under a path it no longer has -
 * one call covers a file or a whole folder.
 *
 * Nothing serves those objects afterwards (the cache key hashes the full
 * path), but nothing collected them either: they kept the old path in
 * "x-original-path", which is what both this sweep and the /storage/stats
 * recalculation match on. Left alone they accumulate for good, and dashboard
 * thumbnails make that certain rather than theoretical:
 * /storage/thumbnails-missing reports the new path as missing, the client
 * re-uploads, and every rename strands one more thumbnail.
 *
 * Deferred: it is garbage collection for a change that already succeeded, so
 * it must neither add a full cache scan to the response time nor turn a
 * completed move into a 500.
 */
function purgeCache(bucket: R2Bucket, fullPath: string, defer: Defer): void {
  defer(
    r2
      .deleteCachedTransformations(bucket, fullPath)
      .catch((error) => console.error("Failed to purge cache", error)),
  );
}

/**
 * Removes one file and everything derived from it. Null when there is no such
 * file, so callers can tell that apart from a delete that happened.
 */
export async function deleteFile(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
): Promise<{
  bytes: number;
  jobsDeleted: number;
  cloudCacheFilesDeleted: number;
} | null> {
  const meta = await r2.getOriginalMetadata(bucket, tenantRoot, filePath);
  if (!meta) return null;
  const fullPath = `${tenantRoot}/${filePath}`;
  const jobsDeleted = await deleteVideoJobs(fullPath);
  const cloudCacheFilesDeleted = await r2.deleteCachedTransformations(
    bucket,
    fullPath,
  );
  await r2.deleteOriginal(bucket, tenantRoot, filePath);
  await deleteDuration(fullPath);
  return { bytes: meta.size, jobsDeleted, cloudCacheFilesDeleted };
}

/** A folder, recursively. Returns the bytes freed. */
export async function deleteFolder(
  bucket: R2Bucket,
  tenantRoot: string,
  folderPath: string,
  defer: Defer,
): Promise<number> {
  const { bytes } = await r2.deleteFolder(bucket, tenantRoot, folderPath);
  const fullPath = `${tenantRoot}/${folderPath}`;
  await deleteDurationsUnder(fullPath);
  await deleteVideoJobsUnder(fullPath);
  purgeCache(bucket, fullPath, defer);
  return bytes;
}

/**
 * Everything one bucket holds. R2 before Postgres: a half-failed sweep leaves
 * an emptied bucket that can just be deleted again, whereas dropping the rows
 * first orphans every object - nothing else maps a tenant root back to an
 * account. Returns the bytes of originals freed.
 *
 * ponytail: lists and deletes in pages of 1000, so a Worker's
 * 1000-subrequest budget covers roughly 500k objects per bucket - move to a
 * Queue if a tenant ever outgrows that.
 */
export async function deleteTenant(
  bucket: R2Bucket,
  tenantRoot: string,
): Promise<number> {
  const { bytes } = await r2.deleteFolder(bucket, tenantRoot, "");
  await r2.deleteCacheForTenant(bucket, tenantRoot);
  await deleteDurationsUnder(tenantRoot);
  await deleteVideoJobsUnder(tenantRoot);
  return bytes;
}

/** A file or a folder, to a path already checked to be free. */
export async function moveAsset(
  bucket: R2Bucket,
  tenantRoot: string,
  from: string,
  to: string,
  { folder }: { folder: boolean },
  defer: Defer,
): Promise<void> {
  if (folder) await r2.renameFolder(bucket, tenantRoot, from, to);
  else await r2.renameOriginal(bucket, tenantRoot, from, to);
  await moveDuration(`${tenantRoot}/${from}`, `${tenantRoot}/${to}`, { folder });
  purgeCache(bucket, `${tenantRoot}/${from}`, defer);
}

/**
 * "{name} copy.{ext}" next to the target, made unique. The source keeps its
 * derivatives: they are still live, and purging them would evict a cache
 * nobody invalidated. Returns the new path and the bytes it added.
 */
export async function copyFile(
  bucket: R2Bucket,
  tenantRoot: string,
  filePath: string,
  targetDir: string,
): Promise<{ path: string; bytes: number }> {
  const baseName = stripUrlHostile(path.basename(filePath));
  const ext = path.extname(baseName);
  const copyName = `${ext ? baseName.slice(0, -ext.length) : baseName} copy${ext}`;
  const newPath = await uniquePath(
    bucket,
    tenantRoot,
    targetDir ? `${targetDir}/${copyName}` : copyName,
  );
  await r2.copyOriginal(bucket, tenantRoot, filePath, newPath);
  await copyDuration(`${tenantRoot}/${filePath}`, `${tenantRoot}/${newPath}`);
  const meta = await r2.getOriginalMetadata(bucket, tenantRoot, newPath);
  return { path: newPath, bytes: meta?.size ?? 0 };
}

/** `candidate`, or "name (1).ext" and so on until nothing is stored there. */
export function uniquePath(
  bucket: R2Bucket,
  tenantRoot: string,
  candidate: string,
): Promise<string> {
  return getUniqueFilePath(candidate, (p) =>
    r2.existsOriginal(bucket, tenantRoot, p),
  );
}
