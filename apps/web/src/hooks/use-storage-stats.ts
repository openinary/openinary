"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type StorageStats = {
  storage: { size: number; fileCount: number };
  cache: { size: number; fileCount: number };
};

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  return baseUrl;
}

async function fetchStorageStats(): Promise<StorageStats> {
  const res = await fetch(`${getBaseUrl()}/storage/stats`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

async function clearCache(): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/storage/cache/clear`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
}

export function useStorageStats() {
  return useQuery({
    queryKey: ["storage-stats"],
    queryFn: fetchStorageStats,
  });
}

export function useClearCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
    },
  });
}
