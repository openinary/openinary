"use client";

import Link from "next/link";
import { Skeleton } from "skullet/react";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import { CircularProgress } from "@/components/ui/circular-progress";
import { useHydrated } from "@/hooks/use-hydrated";

/**
 * The checklist's progress, above the footer until every step is done.
 * Mounted from the first paint and remembered under its id, so while the
 * checklist loads the slot holds the card (or nothing) it showed last time,
 * instead of popping it in. Client-only so that memory applies (useHydrated).
 */
export function GettingStarted() {
  const { completed, total, isComplete, isReady } = useOnboarding();
  if (!useHydrated()) return null;

  return (
    <Skeleton
      id="getting-started"
      loading={!isReady}
      label="Loading your progress"
      className="px-3 group-data-[collapsible=icon]:hidden"
    >
      {(!isReady || !isComplete) && (
        <Link
          href="/get-started"
          className="mb-2 flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 shadow-xs transition-colors hover:bg-accent"
        >
          <CircularProgress
            value={(completed / total) * 100}
            size={16}
            thickness={2}
            className="shrink-0 text-primary"
          />
          <p className="flex-1 truncate text-sm font-medium">Getting started</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {completed} of {total}
          </p>
        </Link>
      )}
    </Skeleton>
  );
}
