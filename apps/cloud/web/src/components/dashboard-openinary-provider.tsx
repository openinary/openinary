"use client";

import { OpeninaryProvider } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
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

  // Children render straight away, so the shell and every skeleton in it are
  // on screen from the first paint and stay mounted while data lands. What
  // can't start yet is the network: until the bucket is known, transformBaseUrl
  // is the bare server, and a request built on it (an asset-details HEAD, a
  // thumbnail) hits "{serverUrl}/t/..." - a route that only exists under
  // "/b/{bucketId}". So every request waits for the bucket list to settle
  // (error included: a failed list must not hang the library), and one built
  // on the fallback base is moved onto the real one.
  const gate = useRef<{ open: Promise<void>; release: () => void }>(null);
  if (!gate.current) {
    let release = () => {};
    const open = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate.current = { open, release };
  }
  useEffect(() => {
    if (!isPending) gate.current?.release();
  }, [isPending]);

  const cdnRef = useRef(cdnBaseUrl);
  cdnRef.current = cdnBaseUrl;

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
    async (input: RequestInfo | URL, init?: RequestInit) => {
      await gate.current?.open;
      const cdn = cdnRef.current;
      let target: RequestInfo | URL = input;
      if (cdn && typeof input === "string" && input.startsWith(`${serverUrl}/t/`)) {
        target = cdn + input.slice(serverUrl.length);
      }
      const url = target instanceof Request ? target.url : String(target);
      const isCdn = !!cdn && url.startsWith(cdn);
      return globalThis.fetch(target, {
        credentials: isCdn ? "omit" : "include",
        ...init,
      });
    },
    [serverUrl],
  );

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
