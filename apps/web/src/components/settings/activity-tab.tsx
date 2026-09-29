"use client";

import { SettingsSection, useOpeninary } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Wire format is single-letter keys, see apps/api/src/utils/activity-log.ts.
type Delivery = {
  t: number;
  p: string;
  k: "image" | "video" | "other";
  s: number;
};

// As stored by the queue, see packages/core/src/utils/video/queue-store.ts.
type VideoJob = {
  id: string;
  file_path: string;
  params_json: string;
  status: string;
  error: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
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

/** "w_500,f_auto/photos/a.jpg" -> the transformation and the file behind it. */
function splitDelivery(path: string): { transform: string; file: string } {
  const slash = path.indexOf("/");
  const first = slash === -1 ? "" : path.slice(0, slash);
  // A transformation segment is key_value pairs; a folder is not.
  return /^[a-z]+_[^/]+$/.test(first)
    ? { transform: first, file: path.slice(slash + 1) }
    : { transform: "", file: path };
}

function jobParams(json: string): string {
  try {
    return Object.entries(JSON.parse(json) as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
  } catch {
    return json;
  }
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
  isError,
  isEmpty,
  empty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  empty: string;
  children: React.ReactNode;
}) {
  if (isError) {
    return <p className="text-destructive text-sm">Failed to load activity.</p>;
  }
  if (isLoading) {
    return (
      <div className="space-y-1">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-xs">
        {empty}
      </p>
    );
  }
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border">{children}</div>
  );
}

export function ActivityTab() {
  const { apiBaseUrl, fetch } = useOpeninary();

  const get = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${apiBaseUrl}${path}`);
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return res.json();
  };

  const deliveries = useQuery({
    queryKey: ["openinary", "activity", apiBaseUrl],
    queryFn: () => get<{ deliveries: Delivery[] }>("/activity"),
    refetchInterval: 10_000,
  });
  const jobs = useQuery({
    queryKey: ["openinary", "activity-jobs", apiBaseUrl],
    queryFn: () => get<{ jobs: VideoJob[] }>("/queue/jobs?limit=100"),
    refetchInterval: 10_000,
  });

  const deliveryRows = deliveries.data?.deliveries ?? [];
  const jobRows = jobs.data?.jobs ?? [];

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Delivery log"
        description="The last 500 assets served from your public URLs. The dashboard's own previews are left out. Expand a line for the transformation and the file behind it."
      >
        <LogPanel
          empty="Nothing served yet. Requests to your public asset URLs show up here within a few seconds."
          isEmpty={deliveryRows.length === 0}
          isError={deliveries.isError}
          isLoading={deliveries.isLoading}
        >
          {deliveryRows.map((delivery) => {
            const { transform, file } = splitDelivery(delivery.p);
            return (
              <LogRow
                details={[
                  ["when", formatTime(delivery.t)],
                  ["file", file],
                  ["transform", transform || "-"],
                  ["type", delivery.k],
                  ["status", String(delivery.s)],
                ]}
                key={`${delivery.t}-${delivery.p}`}
                path={delivery.p}
                right={delivery.k}
                tag={String(delivery.s)}
                tagClassName={cn(delivery.s >= 400 && "text-destructive")}
                time={delivery.t}
              />
            );
          })}
        </LogPanel>
      </SettingsSection>

      <Separator />

      <SettingsSection
        title="Video processing"
        description="The latest transcodes this instance has run, with the time each one took."
      >
        <LogPanel
          empty="No video has been processed yet."
          isEmpty={jobRows.length === 0}
          isError={jobs.isError}
          isLoading={jobs.isLoading}
        >
          {jobRows.map((job) => {
            const seconds =
              job.started_at && job.completed_at
                ? Math.round((job.completed_at - job.started_at) / 1000)
                : null;
            return (
              <LogRow
                details={[
                  ["when", formatTime(job.created_at)],
                  ["file", job.file_path],
                  ["transform", jobParams(job.params_json) || "-"],
                  ["status", job.status],
                  ["time", seconds === null ? "-" : formatSeconds(seconds)],
                  ...(job.error
                    ? ([["error", job.error]] as [string, string][])
                    : []),
                ]}
                key={job.id}
                path={job.file_path}
                right={seconds === null ? "" : formatSeconds(seconds)}
                tag={job.status}
                tagClassName={cn(job.status === "error" && "text-destructive")}
                time={job.created_at}
              />
            );
          })}
        </LogPanel>
      </SettingsSection>
    </div>
  );
}
