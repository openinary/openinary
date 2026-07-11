"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaType } from "./use-storage-tree";

export type FolderSummary = {
  itemCount: number;
  truncated: boolean;
  previewItems: { path: string; type: MediaType }[];
};

const BATCH_DELAY_MS = 40;

function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  return baseUrl;
}

async function fetchFolderSummaries(
  paths: string[],
): Promise<Record<string, FolderSummary>> {
  const res = await fetch(
    `${getApiBaseUrl()}/storage/folder-summaries?paths=${paths
      .map(encodeURIComponent)
      .join(",")}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  const json: { summaries: Record<string, FolderSummary> } = await res.json();
  return json.summaries;
}

/**
 * Fetches folder summaries (item count + preview thumbnails) only for the
 * given paths - meant to be driven by a virtualizer so only currently
 * rendered folder tiles trigger a request, instead of every subfolder in a
 * level up front. Paths requested within the same BATCH_DELAY_MS window are
 * coalesced into a single call. Already-fetched paths are cached for the
 * lifetime of this hook instance and never refetched.
 */
export function useFolderSummaries(
  visiblePaths: string[],
): Record<string, FolderSummary> {
  const [summaries, setSummaries] = useState<Record<string, FolderSummary>>(
    {},
  );
  const knownRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const toFetch = visiblePaths.filter((p) => !knownRef.current.has(p));
    if (toFetch.length === 0) return;

    for (const p of toFetch) {
      knownRef.current.add(p);
      pendingRef.current.add(p);
    }

    if (timerRef.current) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const batch = [...pendingRef.current];
      pendingRef.current.clear();
      if (batch.length === 0) return;

      fetchFolderSummaries(batch)
        .then((fetched) => {
          setSummaries((prev) => ({ ...prev, ...fetched }));
        })
        .catch(() => {
          // best-effort: failed paths stay unknown and can be retried
          // if they scroll out and back into view
          for (const p of batch) knownRef.current.delete(p);
        });
    }, BATCH_DELAY_MS);
  }, [visiblePaths]);

  return summaries;
}
