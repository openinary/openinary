"use client";

import Link from "next/link";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import { CircularProgress } from "@/components/ui/circular-progress";

/** The checklist's progress, above the footer until every step is done. */
export function GettingStarted() {
  const { completed, total, isComplete, isReady } = useOnboarding();

  // Nothing until the checklist can be judged, rather than a 0 of 3 flash.
  if (!isReady || isComplete) return null;

  return (
    <Link
      href="/get-started"
      className="fade-in flex h-9 animate-in items-center gap-2 rounded-lg border bg-background px-2.5 shadow-xs transition-colors duration-200 hover:bg-accent"
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
  );
}
