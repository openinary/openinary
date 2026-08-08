"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOpeninary } from "../provider/openinary-provider";
import type { OpeninaryConfig } from "../provider/openinary-provider";

type StorageStats = {
  storage: { size: number; fileCount: number };
  cache: { size: number; fileCount: number };
  updatedAt?: string;
};

async function fetchStorageStats({ apiBaseUrl, fetch }: OpeninaryConfig): Promise<StorageStats> {
  const res = await fetch(`${apiBaseUrl}/storage/stats`);

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

async function recalculateStorageStats({ apiBaseUrl, fetch }: OpeninaryConfig): Promise<StorageStats> {
  const res = await fetch(`${apiBaseUrl}/storage/stats/recalculate`, { method: "POST" });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

async function clearCache({ apiBaseUrl, fetch }: OpeninaryConfig): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/storage/cache/clear`, { method: "POST" });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
}

export function useStorageStats() {
  const openinary = useOpeninary();

  return useQuery({
    queryKey: ["openinary", "storage-stats", openinary.apiBaseUrl],
    queryFn: () => fetchStorageStats(openinary),
  });
}

export function useRecalculateStorageStats() {
  const openinary = useOpeninary();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => recalculateStorageStats(openinary),
    onSuccess: (stats) => {
      queryClient.setQueryData(["openinary", "storage-stats", openinary.apiBaseUrl], stats);
    },
  });
}

export function useClearCache() {
  const openinary = useOpeninary();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearCache(openinary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["openinary", "storage-stats", openinary.apiBaseUrl] });
    },
  });
}
