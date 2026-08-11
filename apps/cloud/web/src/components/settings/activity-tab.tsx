"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Info } from "lucide-react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FEATURES, formatUsd, isMeteredPlan } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

const RATES = Object.fromEntries(FEATURES.map((f) => [f.id, f.rate])) as Record<
  string,
  number
>;

// Wire format is single-letter keys (see apps/server/api/lib/delivery-log.ts -
// 500 of these per account are stored and shipped, so the names are paid for
// by the byte). Expanded once, here.
type Delivery = {
  t: number;
  b: string;
  p: string;
  k: "image" | "video" | "other";
  c: "HIT" | "MISS" | "ORIGINAL" | "NONE";
  s: number;
  cdn: 0 | 1;
  img: 0 | 1;
};

type VideoJob = {
  id: string;
  bucket: string;
  path: string;
  params: string;
  status: string;
  createdAt: number;
  seconds: number | null;
  metered: boolean;
};

// Only the outcomes a customer can act on get colour. A cache hit is the
// normal, cheap case and should read as unremarkable.
const CACHE_STYLE: Record<Delivery["c"], string> = {
  HIT: "text-muted-foreground",
  MISS: "text-foreground",
  ORIGINAL: "text-amber-700 dark:text-amber-400",
  NONE: "text-destructive",
};

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/** What this one delivery added to the metered balances, in plain units. */
function deliveryUsage(delivery: Delivery): string {
  const parts: string[] = [];
  if (delivery.cdn) parts.push("1 CDN request");
  if (delivery.img) parts.push("1 transformation");
  return parts.length > 0 ? parts.join(" + ") : "Nothing billed";
}

function deliveryCost(delivery: Delivery): number {
  return (
    delivery.cdn * (RATES.cdn_requests ?? 0) +
    delivery.img * (RATES.image_transformations ?? 0)
  );
}

/** One log line: a single row, with the rest of the record behind it. */
function LogRow({
  time,
  tag,
  tagClassName,
  path,
  right,
  details,
}: {
  time: number;
  tag: string;
  tagClassName?: string;
  path: string;
  right: string;
  details: [string, string][];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      className="border-b last:border-0"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1 text-left font-mono text-xs hover:bg-muted/50">
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {formatClock(time)}
        </span>
        <span className={cn("w-20 shrink-0 truncate", tagClassName)}>
          {tag}
        </span>
        <span className="min-w-0 flex-1 truncate">{path}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {right}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 bg-muted/30 px-2 py-2 pl-7 font-mono text-xs">
          {details.map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LogPanel({
  isLoading,
  isEmpty,
  empty,
  children,
}: {
  isLoading: boolean;
  isEmpty: boolean;
  empty: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="mt-3 space-y-1">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <p className="mt-3 rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-xs">
        {empty}
      </p>
    );
  }
  return (
    <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border">
      {children}
    </div>
  );
}

export function ActivityTab() {
  const { data, isLoading, isError } = useQuery({
    ...orpc.usage.activity.queryOptions(),
    // The log is live by construction: the meter serves the current window
    // out of memory, so a refetch always reflects traffic from a second ago.
    refetchInterval: 10_000,
  });

  // Pay as you go needs a metered plan (see plan-tab): on Free nothing served
  // here can ever cost anything, so a column of $0.00 would be noise at best
  // and a scare at worst. Shares its cache with the Plan tab, so this costs no
  // round-trip.
  const { data: plan } = useQuery(orpc.usage.get.queryOptions());
  const showCost = isMeteredPlan(plan?.planId);

  const deliveries = (data?.deliveries ?? []) as Delivery[];
  const videoJobs = (data?.videoJobs ?? []) as VideoJob[];

  return (
    <div className="space-y-6">
      <div>
        <p className="font-medium text-sm">Delivery log</p>
        <p className="mt-1 text-muted-foreground text-xs">
          The last 500 assets served from your public URLs. Expand a line for
          the bucket, the cache outcome and what it added to your usage.
        </p>

        {isError ? (
          <p className="mt-3 text-destructive text-sm">
            Failed to load activity.
          </p>
        ) : (
          <LogPanel
            empty="Nothing served yet. Requests to your public asset URLs show up here within a few seconds."
            isEmpty={deliveries.length === 0}
            isLoading={isLoading}
          >
            {deliveries.map((delivery) => {
              const cost = deliveryCost(delivery);
              return (
                <LogRow
                  details={[
                    ["when", formatTime(delivery.t)],
                    ["bucket", delivery.b],
                    ["path", delivery.p],
                    ["type", delivery.k],
                    ["cache", delivery.c],
                    ["usage", deliveryUsage(delivery)],
                    ...(showCost
                      ? ([["cost", formatUsd(cost)]] as [string, string][])
                      : []),
                  ]}
                  key={`${delivery.t}-${delivery.p}-${delivery.s}`}
                  path={delivery.p}
                  right={showCost && cost > 0 ? formatUsd(cost) : ""}
                  tag={`${delivery.s} ${delivery.c}`}
                  tagClassName={CACHE_STYLE[delivery.c]}
                  time={delivery.t}
                />
              );
            })}
          </LogPanel>
        )}
      </div>

      <Separator />

      <div>
        <p className="flex items-center gap-1 font-medium text-sm">
          Video processing
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="About video processing time"
                className="text-muted-foreground transition-colors hover:text-foreground"
                type="button"
              >
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Time is the wall clock the transcoder actually spent on the job,
              not the length of your video. It is the exact quantity billed, so
              this figure and your Video processing usage always agree.
            </TooltipContent>
          </Tooltip>
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          Every transcode this account has run, with the processing time each
          one was charged for.
        </p>

        <LogPanel
          empty="No video has been processed yet."
          isEmpty={videoJobs.length === 0}
          isLoading={isLoading}
        >
          {videoJobs.map((job) => {
            const cost =
              job.seconds === null
                ? 0
                : job.seconds * (RATES.video_processing_seconds ?? 0);
            return (
              <LogRow
                details={[
                  ["when", formatTime(job.createdAt)],
                  ["bucket", job.bucket],
                  ["path", job.path],
                  ["transform", job.params || "-"],
                  [
                    "billed",
                    job.seconds === null
                      ? "not yet measured"
                      : `${formatSeconds(job.seconds)}${job.metered ? "" : " (pending)"}`,
                  ],
                  ...(showCost
                    ? ([["cost", formatUsd(cost)]] as [string, string][])
                    : []),
                  ["job", job.id],
                ]}
                key={job.id}
                path={job.path}
                right={
                  job.seconds === null
                    ? ""
                    : formatSeconds(job.seconds) +
                      (showCost ? ` · ${formatUsd(cost)}` : "")
                }
                tag={job.status}
                tagClassName={cn(
                  job.status === "failed" && "text-destructive",
                  job.status === "processing" && "text-shimmer",
                )}
                time={job.createdAt}
              />
            );
          })}
        </LogPanel>
      </div>

      {showCost && (
        <p className="text-muted-foreground text-xs">
          Costs shown are the pay-as-you-go rate for each unit. They only become
          payable once the plan's included allowance runs out.
        </p>
      )}
    </div>
  );
}
