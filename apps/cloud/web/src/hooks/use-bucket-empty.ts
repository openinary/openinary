"use client";

import { useStorageLevel } from "@openinary/ui";

/**
 * Whether the active bucket's root holds nothing - the exact condition
 * MediaGrid uses to decide it renders its empty state (root, no folders, no
 * files), so every surface that reacts to "this bucket is empty" agrees with
 * what the grid is actually showing.
 *
 * Reads the react-query entry MediaGrid already populates, so it costs no
 * request wherever it is called.
 *
 * Null while the listing is still in flight. Callers must treat that as "not
 * yet known" rather than as either answer: hiding chrome on a maybe makes it
 * flash out and back in as the data lands.
 */
export function useBucketIsEmpty(): boolean | null {
  const { data } = useStorageLevel("");
  if (!data) return null;
  return data.files.length === 0 && data.folders.length === 0;
}
