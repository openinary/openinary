"use client";

import { useOpeninary, useStorageLevel } from "@openinary/ui";
import { useEffect, useRef } from "react";
import { fetchMissingThumbnails, uploadThumbnail } from "@/lib/thumbnails/api";
import { generateImageThumbnail } from "@/lib/thumbnails/generate-image-thumbnail";
import { generateVideoThumbnail } from "@/lib/thumbnails/generate-video-thumbnail";

// Matches the server's THUMBNAILS_MISSING_MAX_PATHS (worker/app.ts).
const MISSING_CHECK_BATCH_SIZE = 100;
const GENERATION_CONCURRENCY = 4;

// Two document-wide DOM hacks used to live here: one hiding any /t/ image that
// 404'd, one re-pointing it at a cache-busted URL once its thumbnail landed.
// Both existed because a bare <img> shows nothing useful while it waits and
// never retries on its own. @openinary/ui >= 0.8.0 renders every tile and
// preview through VideoThumbnail, which owns the skeleton and the retry, so
// they were deleted rather than reconciled - reaching into img.src behind
// React's back is also what made the sidebar keep reporting a failure on a
// preview that had since loaded.

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, next),
  );
}

/**
 * Headless: backfills client-generated dashboard thumbnails for whichever
 * folder is currently open, so the container is never woken just because a
 * customer browsed their library. Render next to MediaGrid, passing it the
 * same folderPath - useStorageLevel(folderPath) reads the exact same
 * react-query cache entry MediaGrid already populated, so this never fires
 * an extra network request on its own for the file listing itself.
 *
 * There's no real pagination in @openinary/ui today (a folder level is
 * fetched in one shot), so "per folder" is the finest lazy-loading
 * granularity available without forking that package.
 */
export function ThumbnailGenerator({
  folderPath,
}: {
  folderPath: string | null;
}) {
  const { apiBaseUrl, fetch: fetchImpl } = useOpeninary();
  const { data } = useStorageLevel(folderPath ?? "");
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    const candidates = data.files.filter(
      (file) => !attemptedRef.current.has(file.path),
    );
    if (candidates.length === 0) return;
    for (const file of candidates) attemptedRef.current.add(file.path);
    // An upload invalidates the storage queries, so `data` gets a new
    // identity while this run is still generating - the cleanup below
    // cancels it mid-flight. Paths it never got to must lose their
    // "attempted" mark, or the freshly uploaded asset is stranded without a
    // thumbnail until the component is torn down (a reload refetches on
    // mount and loses the race again, hence "even after refreshing").
    const unfinished = new Set(candidates.map((file) => file.path));

    let cancelled = false;
    (async () => {
      const missing = new Set<string>();
      for (const batch of chunk(candidates, MISSING_CHECK_BATCH_SIZE)) {
        if (cancelled) return;
        try {
          for (const path of await fetchMissingThumbnails(
            fetchImpl,
            apiBaseUrl,
            batch.map((file) => file.path),
          ))
            missing.add(path);
        } catch (error) {
          console.error("Failed to check for missing thumbnails", error);
        }
      }
      if (cancelled) return;
      for (const path of unfinished)
        if (!missing.has(path)) unfinished.delete(path);
      if (missing.size === 0) return;

      await runWithConcurrency(
        candidates.filter((file) => missing.has(file.path)),
        GENERATION_CONCURRENCY,
        async (file) => {
          if (cancelled) return;
          try {
            const blob =
              file.type === "image"
                ? await generateImageThumbnail(fetchImpl, apiBaseUrl, file.path)
                : await generateVideoThumbnail(apiBaseUrl, file.path);
            if (!blob) return;
            await uploadThumbnail(fetchImpl, apiBaseUrl, file.path, blob);
          } catch (error) {
            // There is no container fallback for these segments any more, so
            // a failure here means the tile shows a skeleton until its retries
            // run out and then says so, and the next visit tries again from
            // scratch. Logged rather than surfaced: it's one preview, and
            // every other asset in the folder is unaffected.
            console.error(
              `Failed to generate thumbnail for ${file.path}`,
              error,
            );
          } finally {
            unfinished.delete(file.path);
          }
        },
      );
    })();

    return () => {
      cancelled = true;
      for (const path of unfinished) attemptedRef.current.delete(path);
    };
  }, [data, apiBaseUrl, fetchImpl]);

  return null;
}
