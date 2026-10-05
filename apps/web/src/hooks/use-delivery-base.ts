"use client";

import { useOpeninary } from "@openinary/ui";

import { toAbsoluteUrl } from "@/lib/utils";

/**
 * The instance's API base as an absolute URL, without a trailing slash. It is
 * what files are delivered from ({base}/t/...) and what an app uploads to, so
 * anything printed for the user to copy starts with it.
 */
export function useDeliveryBase() {
  const { apiBaseUrl } = useOpeninary();
  return toAbsoluteUrl(apiBaseUrl).replace(/\/$/, "");
}
