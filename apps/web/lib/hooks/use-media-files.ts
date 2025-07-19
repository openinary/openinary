"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMediaFiles } from "@/lib/actions";

export function useMediaFiles() {
  return useQuery({
    queryKey: ["media-files"],
    queryFn: async () => {
      return await fetchMediaFiles();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
