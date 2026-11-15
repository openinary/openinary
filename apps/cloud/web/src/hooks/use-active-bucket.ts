"use client";

import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * The account's buckets and the one its storage, uploads and delivery
 * currently resolve to: the one flagged active, else the first.
 */
export function useActiveBucket({ enabled = true }: { enabled?: boolean } = {}) {
  const { data: buckets, isLoading } = useQuery({
    ...orpc.bucket.list.queryOptions(),
    enabled,
  });
  const bucket = buckets?.find((b) => b.active) ?? buckets?.[0];
  return { buckets, bucket, isLoading };
}
