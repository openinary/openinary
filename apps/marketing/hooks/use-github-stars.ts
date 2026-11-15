"use client";

import { useEffect, useState } from "react";

import { getStars } from "@/lib/github";

// Fetched from the visitor's browser on purpose: the Worker has no incremental
// cache configured, so a server fetch would run on every page render from
// Cloudflare's shared egress IPs and hit GitHub's unauthenticated rate limit.
let request: Promise<number | null> | undefined;
let known: number | null = null;

export function useGitHubStars() {
  const [starCount, setStarCount] = useState(known);

  useEffect(() => {
    let live = true;
    request ??= getStars().then((count) => (known = count));
    request.then((count) => live && setStarCount(count));
    return () => {
      live = false;
    };
  }, []);

  return starCount;
}
