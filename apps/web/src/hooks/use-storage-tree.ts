"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

export type MediaType = "image" | "video";

export type StorageFolder = {
  name: string;
  path: string;
  itemCount: number;
  truncated: boolean;
  previewItems: { path: string; type: MediaType }[];
};

export type StorageFile = {
  id: string;
  name: string;
  path: string;
  type: MediaType;
  size?: number;
  mtime?: string;
};

export type StorageLevel = {
  path: string;
  folders: StorageFolder[];
  files: StorageFile[];
};

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

export function getMediaType(name: string): MediaType | null {
  const lower = name.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "image";
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
  return null;
}

function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  return baseUrl;
}

type ApiLevelResponse = {
  path: string;
  folders: StorageFolder[];
  files: { name: string; path: string; size?: number; mtime?: string }[];
};

async function fetchStorageLevel(path: string): Promise<StorageLevel> {
  const res = await fetch(
    `${getApiBaseUrl()}/storage?path=${encodeURIComponent(path)}`,
    { credentials: "include" },
  );

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
}

async function fetchStorageFolders(): Promise<string[]> {
  const res = await fetch(`${getApiBaseUrl()}/storage/folders`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  const json: { folders: string[] } = await res.json();
  return json.folders;
}

/**
 * One directory level of storage, loaded lazily per folder.
 * The "storage-tree" key prefix is shared by every level so blanket
 * invalidation refreshes all mounted levels.
 */
export function useStorageLevel(path: string) {
  return useQuery({
    queryKey: ["storage-tree", path],
    queryFn: () => fetchStorageLevel(path),
  });
}

/**
 * Every folder path in storage (for "Move to" pickers)
 */
export function useStorageFolders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["storage-folders"],
    queryFn: fetchStorageFolders,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Invalidates every storage-derived query after a mutation
 * (all mounted levels + the folders list)
 */
export function invalidateStorage(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
  queryClient.invalidateQueries({ queryKey: ["storage-folders"] });
}
