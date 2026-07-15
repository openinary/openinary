"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useOpeninary } from "../provider/openinary-provider";
import { getMediaType } from "../media-type";
import type { StorageFolder, StorageFile, StorageLevel } from "../types";

export type { StorageFolder, StorageFile, StorageLevel } from "../types";

type ApiLevelResponse = {
  path: string;
  folders: StorageFolder[];
  files: { name: string; path: string; size?: number; mtime?: string }[];
};

/**
 * One directory level of storage, loaded lazily per folder.
 * The "storage-tree" key prefix is shared by every level so blanket
 * invalidation refreshes all mounted levels.
 */
export function useStorageLevel(path: string) {
  const { apiBaseUrl, fetch } = useOpeninary();

  return useQuery({
    queryKey: ["openinary", "storage-tree", apiBaseUrl, path],
    queryFn: async (): Promise<StorageLevel> => {
      const res = await fetch(`${apiBaseUrl}/storage?path=${encodeURIComponent(path)}`);

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const json: ApiLevelResponse = await res.json();

      const files: StorageFile[] = [];
      for (const file of json.files) {
        const type = getMediaType(file.name);
        if (!type) continue;
        files.push({ id: file.path, type, ...file });
      }

      return { path: json.path, folders: json.folders, files };
    },
  });
}

/**
 * Every folder path in storage (for "Move to" pickers)
 */
export function useStorageFolders(options?: { enabled?: boolean }) {
  const { apiBaseUrl, fetch } = useOpeninary();

  return useQuery({
    queryKey: ["openinary", "storage-folders", apiBaseUrl],
    queryFn: async (): Promise<string[]> => {
      const res = await fetch(`${apiBaseUrl}/storage/folders`);

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const json: { folders: string[] } = await res.json();
      return json.folders;
    },
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Invalidates every storage-derived query after a mutation
 * (all mounted levels + the folders list)
 */
export function invalidateStorage(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["openinary", "storage-tree"] });
  queryClient.invalidateQueries({ queryKey: ["openinary", "storage-folders"] });
}
