"use client";

import { useOpeninary } from "@openinary/ui";

/**
 * Where files are delivered from ({base}/t/...), absolute and without a
 * trailing slash: what anything printed for the user to copy starts with.
 * A relative base ("" or "/api" in same-origin Docker setups) resolves against
 * `origin`. Null while it is not known: the provider's base is null (Cloud
 * waits for the active bucket), or it is relative and there is no origin yet.
 */
export function resolveDeliveryBase(
  transformBaseUrl: string | null,
  origin: string | undefined,
): string | null {
  if (transformBaseUrl === null) return null;
  try {
    return new URL(transformBaseUrl, origin).href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function useDeliveryBase() {
  const { transformBaseUrl } = useOpeninary();
  return resolveDeliveryBase(
    transformBaseUrl,
    typeof window === "undefined" ? undefined : window.location.origin,
  );
}
