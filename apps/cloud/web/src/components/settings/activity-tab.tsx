"use client";

import {
  type UsageColumn,
  UsageCell,
  UsageDashboard,
  type UsageEvent,
  UsageTable,
  UsageTime,
} from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";

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

export function ActivityTab() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    ...orpc.usage.activity.queryOptions(),
    // The log is live by construction: the meter serves the current window
    // out of memory, so a refetch always reflects traffic from a second ago.
    refetchInterval: 10_000,
  });

  // Pay as you go needs a metered plan (see billing-tab): on Free nothing served
  // here can ever cost anything, so a column of $0.00 would be noise at best
  // and a scare at worst. Shares its cache with the Plan tab, so this costs no
  // round-trip.
  const { data: plan } = useQuery(orpc.usage.get.queryOptions());
  const showCost = isMeteredPlan(plan?.planId);

  const deliveries = (data?.deliveries ?? []) as Delivery[];
  const videoJobs = (data?.videoJobs ?? []) as VideoJob[];

  const events: UsageEvent[] = deliveries.map((delivery, index) => {
    const cost = deliveryCost(delivery);
    const slash = delivery.p.indexOf("/");
    const first = slash === -1 ? "" : delivery.p.slice(0, slash);
    // A transformation segment is key_value pairs; a folder is not.
    const transformed = /^[a-z]+_[^/]+$/.test(first);
    return {
      id: `${delivery.t}-${index}`,
      time: delivery.t,
      status: delivery.s,
      kind: delivery.k,
      file: transformed ? delivery.p.slice(slash + 1) : delivery.p,
      transform: transformed ? first : "",
      extra: {
        Bucket: delivery.b,
        Cache: delivery.c,
        Usage: deliveryUsage(delivery),
        ...(showCost && { Cost: cost > 0 ? formatUsd(cost) : "-" }),
      },
    };
  });

  const jobColumns: UsageColumn<VideoJob>[] = [
    { header: "Time", cell: (job) => <UsageTime time={job.createdAt} /> },
    {
      header: "Status",
      cell: (job) => (
        <span
          className={cn(
            job.status === "failed" && "text-destructive",
            job.status === "processing" && "text-shimmer",
          )}
        >
          {job.status}
        </span>
      ),
    },
    {
      header: "File",
      className: "max-w-0 w-full",
      cell: (job) => <UsageCell detail={job.params || "-"} value={job.path} />,
    },
    { header: "Bucket", className: "whitespace-nowrap", cell: (job) => job.bucket },
    {
      header: "Billed",
      className: "whitespace-nowrap tabular-nums",
      cell: (job) =>
        job.seconds === null
          ? "not yet measured"
          : `${formatSeconds(job.seconds)}${job.metered ? "" : " (pending)"}`,
    },
    ...(showCost
      ? [
          {
            header: "Cost",
            className: "whitespace-nowrap tabular-nums",
            cell: (job: VideoJob) =>
              job.seconds === null
                ? "-"
                : formatUsd(
                    job.seconds * (RATES.video_processing_seconds ?? 0),
                  ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <UsageDashboard
        events={events}
        isError={isError}
        isLoading={isLoading}
        isRefreshing={isFetching}
        limit={500}
        onRefresh={() => refetch()}
      />

      <section className="space-y-3">
        <div>
          <h3 className="flex items-center gap-1 font-semibold text-sm">
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
                Time is the wall clock the transcoder actually spent on the
                job, not the length of your video. It is the exact quantity
                billed, so this figure and your Video processing usage always
                agree.
              </TooltipContent>
            </Tooltip>
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Every transcode this account has run, with the processing time each
            one was charged for.
          </p>
        </div>
        <UsageTable
          columns={jobColumns}
          empty="No video has been processed yet."
          isError={isError}
          isLoading={isLoading}
          rowKey={(job) => job.id}
          rows={videoJobs}
        />
      </section>

      {showCost && (
        <p className="text-muted-foreground text-xs">
          Costs shown are the pay-as-you-go rate for each unit. They only become
          payable once the plan's included allowance runs out.
        </p>
      )}
    </div>
  );
}
