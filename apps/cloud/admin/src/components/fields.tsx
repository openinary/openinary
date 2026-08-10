"use client";

// The display helpers the shadcn registry doesn't cover. Everything else this
// app draws with comes from src/components/ui/. Client-side because two of
// them read live query state.

import { useIsRestoring } from "@tanstack/react-query";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Label/value rows - the shape most of a user's fiche is made of. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-muted-foreground text-sm">{children}</p>;
}

/**
 * Which of the two things is on screen: an answer just fetched, or the last
 * one while a fresh one is on its way.
 *
 * Every page here now draws from cache the moment it mounts - including a
 * cache restored from sessionStorage after a reload - so "when was this true?"
 * stopped being answerable from the fact that the page rendered at all. On an
 * admin panel that question is the whole point, so it is answered out loud,
 * with a timestamp rather than "a moment ago": the reader is usually comparing
 * it against something a customer told them.
 *
 * Renders nothing before the first answer - the skeleton is already saying it.
 */
export function Freshness({
  isFetching,
  updatedAt,
}: {
  isFetching: boolean;
  /** react-query's `dataUpdatedAt`: epoch ms, 0 until something loads. */
  updatedAt: number;
}) {
  if (!updatedAt) return null;
  const at = new Date(updatedAt).toLocaleTimeString(undefined, {
    timeStyle: "short",
  });

  return (
    <span
      // Announced rather than silent: on a slow upstream this is the only
      // thing that changes, and it changes without the reader looking.
      aria-live="polite"
      className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs"
    >
      {isFetching ? (
        <>
          {/* A ring with one side cut out, spun. Cheaper than pulling in an
              icon for the one place this app animates. */}
          <span
            aria-hidden
            className="size-3 animate-spin rounded-full border border-current border-t-transparent"
          />
          <span className="hidden sm:inline">Showing data from {at} —</span>
          refreshing…
        </>
      ) : (
        <>Updated {at}</>
      )}
    </span>
  );
}

/**
 * First paint only. Once anything is cached the pages redraw that instead, so
 * this is what an admin sees once per table, not on every visit to it.
 *
 * Silent while the sessionStorage cache is still being read: that read lands a
 * frame or two after mount, and a skeleton that appears only to be replaced by
 * data that was already on this machine is the flicker the cache exists to
 * remove.
 */
export function LoadingRows({ rows = 5 }: { rows?: number }) {
  if (useIsRestoring()) return null;

  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          // The list is fixed-length and never reordered; the index is the
          // only identity these have.
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
          key={index}
          className="h-9 w-full"
        />
      ))}
    </div>
  );
}

// shadcn's Badge variants are about emphasis, not state. Account state is read
// at a glance across three pages, so it keeps its traffic-light colours - only
// `bad` maps onto a stock variant.
const TONES = {
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
} as const;

export function StatusBadge({
  tone,
  className,
  ...props
}: React.ComponentProps<typeof Badge> & { tone: keyof typeof TONES | "bad" }) {
  if (tone === "bad")
    return <Badge variant="destructive" className={className} {...props} />;
  return (
    <Badge
      variant="secondary"
      className={cn(TONES[tone], className)}
      {...props}
    />
  );
}
