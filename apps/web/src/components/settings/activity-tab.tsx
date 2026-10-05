"use client";

import {
  type UsageColumn,
  UsageCell,
  type UsageCount,
  UsageDashboard,
  type UsageEvent,
  UsageTable,
  UsageTime,
  useOpeninary,
} from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

// Wire format is single-letter keys, see apps/api/src/utils/activity-log.ts.
type Delivery = {
  t: number;
  p: string;
  k: "image" | "video" | "other";
  s: number;
};

// Hourly tallies of every delivery, same wire format and file as Delivery.
type DeliveryCount = {
  t: number;
  k: Delivery["k"];
  d: number;
  f: number;
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

// Must match LOG_LIMIT in apps/api/src/utils/activity-log.ts.
const LOG_LIMIT = 500;

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

const jobSeconds = (job: VideoJob) =>
  job.started_at && job.completed_at
    ? Math.round((job.completed_at - job.started_at) / 1000)
    : null;

const JOB_COLUMNS: UsageColumn<VideoJob>[] = [
  { header: "Time", cell: (job) => <UsageTime time={job.created_at} /> },
  {
    header: "Status",
    cell: (job) => (
      <UsageCell
        className={cn(job.status === "error" && "text-destructive")}
        detail={job.error ?? undefined}
        value={job.status}
      />
    ),
  },
  {
    header: "File",
    className: "max-w-0 w-full",
    cell: (job) => (
      <UsageCell
        detail={jobParams(job.params_json) || "-"}
        value={job.file_path}
      />
    ),
  },
  {
    header: "Duration",
    className: "whitespace-nowrap tabular-nums",
    cell: (job) => {
      const seconds = jobSeconds(job);
      return seconds === null ? "-" : formatSeconds(seconds);
    },
  },
];

export function ActivityTab() {
  const { apiBaseUrl, fetch } = useOpeninary();

  const get = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${apiBaseUrl}${path}`);
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return res.json();
  };

  const deliveries = useQuery({
    queryKey: ["openinary", "activity", apiBaseUrl],
    queryFn: () =>
      get<{ deliveries: Delivery[]; counts: DeliveryCount[] }>("/activity"),
    refetchInterval: 10_000,
  });
  const jobs = useQuery({
    queryKey: ["openinary", "activity-jobs", apiBaseUrl],
    queryFn: () => get<{ jobs: VideoJob[] }>("/queue/jobs?limit=100"),
    refetchInterval: 10_000,
  });

  const events: UsageEvent[] = (deliveries.data?.deliveries ?? []).map(
    (delivery, index) => ({
      id: `${delivery.t}-${index}`,
      time: delivery.t,
      status: delivery.s,
      kind: delivery.k,
      ...splitDelivery(delivery.p),
    }),
  );

  const counts: UsageCount[] | undefined = deliveries.data?.counts?.map(
    (count) => ({
      time: count.t,
      kind: count.k,
      delivered: count.d,
      failed: count.f,
    }),
  );

  return (
    <div className="space-y-8">
      <UsageDashboard
        counts={counts}
        events={events}
        isError={deliveries.isError}
        isLoading={deliveries.isLoading}
        isRefreshing={deliveries.isFetching || jobs.isFetching}
        limit={LOG_LIMIT}
        onRefresh={() => {
          deliveries.refetch();
          jobs.refetch();
        }}
      />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Video processing</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The latest transcodes this instance has run, with the time each
            one took.
          </p>
        </div>
        <UsageTable
          columns={JOB_COLUMNS}
          empty="No video has been processed yet."
          isError={jobs.isError}
          isLoading={jobs.isLoading}
          rowKey={(job) => job.id}
          rows={jobs.data?.jobs ?? []}
        />
      </section>
    </div>
  );
}
