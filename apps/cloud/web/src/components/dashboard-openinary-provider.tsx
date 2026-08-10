"use client";

import { OpeninaryProvider } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { orpc } from "@/utils/orpc";

/**
 * @openinary/ui reads asset URLs through two different bases: apiBaseUrl for
 * the dashboard's own reads (session-gated /t, /storage, ...) and
 * transformBaseUrl specifically for the "Asset URL" field and thumbnail
 * delivery (see its mediaUrl/AssetTransformationsTab). Left unset,
 * transformBaseUrl falls back to apiBaseUrl, so "Asset URL" showed the
 * session-gated /t/... link - which 401s for anyone without our cookie,
 * i.e. every visitor on a customer's own site. Pointing it at
 * /b/{activeBucketId} (the public, unauthenticated route - see
 * apps/server/api/lib/media-routes.ts) makes the copied URL the one that
 * actually works when embedded elsewhere. Base is "/b/{id}", not
 * "/t/{id}": @openinary/ui always appends its own "/t/{params}/{path}" onto
 * transformBaseUrl, so a "/t/{id}" base produced a redundant "/t/{id}/t/...".
 */
export function DashboardOpeninaryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: buckets, isPending } = useQuery(
    orpc.bucket.list.queryOptions(),
  );
  const activeBucketId = buckets?.find((b) => b.active)?.id ?? buckets?.[0]?.id;
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL!;
  const cdnBaseUrl = activeBucketId ? `${serverUrl}/b/${activeBucketId}` : null;

  // @openinary/ui's default fetch sends `credentials: "include"` on every
  // request, including the ones it aims at transformBaseUrl. But /b/* is the
  // public CDN route and answers "Access-Control-Allow-Origin: *", and the
  // spec forbids a wildcard on a credentialed request - the browser discards
  // the response before the caller sees it, so a perfectly good 200 surfaced
  // as `TypeError: Failed to fetch` (and every non-2xx as "CORS error") in
  // the asset-details sidebar. The session cookie is meaningless on /b/*
  // anyway: that route authenticates nothing, it resolves the bucket from
  // the path.
  const fetchImpl = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const isCdn = !!cdnBaseUrl && url.startsWith(cdnBaseUrl);
      return globalThis.fetch(input, {
        credentials: isCdn ? "omit" : "include",
        ...init,
      });
    },
    [cdnBaseUrl],
  );

  // Nothing until the bucket is known: rendering on the fallback base sends
  // every child's mount-time fetch (@openinary/ui's asset-details HEADs, the
  // preview <img>) to "{serverUrl}/t/..." - a route that only exists under
  // "/b/{bucketId}" - so each one 404s/503s before re-firing on the real base.
  // Only pending, not error: a failed bucket list should still show the shell.
  if (isPending) return null;

  return (
    <OpeninaryProvider
      apiBaseUrl={serverUrl}
      transformBaseUrl={cdnBaseUrl ?? serverUrl}
      fetch={fetchImpl}
    >
      {children}
    </OpeninaryProvider>
  );
}
