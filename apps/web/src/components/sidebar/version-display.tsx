"use client"

import { useEffect, useState } from "react";
import { Skeleton } from "skullet/react";

import { useHydrated } from "@/hooks/use-hydrated";

/** The running version, read from /api/version (IMAGE_TAG, set at runtime). Null until known. */
export function useVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("latest"));
  }, []);

  return version;
}

/**
 * The version beside Settings. Client-only and remembered under its id, so
 * the skeleton is the width of the version last shown (see useHydrated).
 */
export function VersionLink({ href }: { href: string }) {
  const version = useVersion();
  if (!useHydrated()) return null;

  return (
    <Skeleton
      id="sidebar-version"
      loading={version === null}
      className="shrink-0 group-data-[collapsible=icon]:hidden"
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="pr-1 text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground"
      >
        {version ?? "v0.0.0"}
      </a>
    </Skeleton>
  );
}
