"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFolderFiles } from "@/lib/actions";

export function useFolderFiles(folderKey: string) {
  return useQuery({
    queryKey: ["folder-files", folderKey],
    queryFn: async () => {
      return await fetchFolderFiles(folderKey);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: !!folderKey, // Only run query if folderKey is provided
  });
}