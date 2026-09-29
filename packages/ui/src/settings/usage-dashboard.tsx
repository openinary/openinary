"use client";

import { CalendarDays, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export type UsageEvent = {
  id: string;
  /** Epoch ms. */
  time: number;
  /** HTTP status the caller received. */
  status: number;
  kind: string;
  /** The file, without its transformation segment. */
  file: string;
  transform?: string;
  /** Extra columns, keyed by their header. Same keys on every event. */
  extra?: Record<string, string>;
};

export type UsageColumn<Row> = {
  header: string;
  className?: string;
  cell: (row: Row) => React.ReactNode;
};

const RANGES = [
  { id: "24h", label: "Last 24 hours", ms: 24 * 3_600_000, buckets: 24 },
  { id: "7d", label: "Last 7 days", ms: 7 * 86_400_000, buckets: 28 },
  { id: "30d", label: "Last 30 days", ms: 30 * 86_400_000, buckets: 30 },
] as const;

const isFailure = (status: number) => status >= 400;

// Native selects dressed as the outline button next to them: no dependency,
// and the platform's own picker on mobile.
const SELECT_CLASS =
  "h-9 cursor-pointer rounded-lg border bg-background px-3 text-sm font-medium shadow-xs outline-none transition-[color,box-shadow] hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30";

function formatDay(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTick(ms: number, withTime: boolean) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime && { hour: "2-digit", minute: "2-digit" }),
  });
}

/** A filled line, sized by its container. Flat when there is nothing to show. */
function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const max = Math.max(...values, 1);
  const step = 100 / Math.max(values.length - 1, 1);
  const points = values
    .map((value, index) => `${index * step},${30 - (value / max) * 26}`)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={cn("h-8 w-full", className)}
      preserveAspectRatio="none"
      viewBox="0 0 100 30"
    >
      <polygon
        fill="currentColor"
        fillOpacity="0.15"
        points={`0,30 ${points} 100,30`}
      />
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  unit,
  series,
  tone = "text-sky-500",
}: {
  label: string;
  value: string;
  unit?: string;
  series: number[];
  tone?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="px-3 pt-2.5">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="mt-0.5 text-2xl tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm">{unit}</span>}
        </p>
      </div>
      <Sparkline className={tone} values={series} />
    </div>
  );
}

/** A bordered table with a sticky header, scrolling inside its own frame. */
export function UsageTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  isLoading,
  isError,
}: {
  columns: UsageColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty: string;
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isError) {
    return <p className="text-sm text-destructive">Failed to load activity.</p>;
  }
  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton className="h-10 w-full" key={row} />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left">
          <tr>
            {columns.map((column) => (
              <th
                className={cn(
                  "h-9 whitespace-nowrap px-4 text-[13px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
                  column.className,
                )}
                key={column.header}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b last:border-0" key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  className={cn("px-4 py-2.5 align-middle", column.className)}
                  key={column.header}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Date over time, the way every table on this page opens. */
export function UsageTime({ time }: { time: number }) {
  return (
    <span className="block whitespace-nowrap font-mono text-xs leading-tight tabular-nums">
      {formatDay(time)}
      <br />
      <span className="text-muted-foreground">{formatClock(time)}</span>
    </span>
  );
}

/** A value with the detail that qualifies it underneath. */
export function UsageCell({
  value,
  detail,
  className,
}: {
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("block min-w-0 leading-tight", className)}>
      <span className="block truncate">{value}</span>
      {detail && (
        <span className="block truncate text-[13px] text-muted-foreground">
          {detail}
        </span>
      )}
    </span>
  );
}

/**
 * The delivery log as a dashboard: filters, deliveries over time, four
 * figures, then the lines themselves. Everything is computed here from the
 * events it is handed, so the figures can only describe what the log holds.
 */
export function UsageDashboard({
  events,
  limit,
  isLoading,
  isError,
  isRefreshing,
  onRefresh,
}: {
  events: UsageEvent[];
  /** How many events the log keeps, to say so once it is full. */
  limit: number;
  isLoading?: boolean;
  isError?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  const [rangeId, setRangeId] =
    useState<(typeof RANGES)[number]["id"]>("7d");
  const [kind, setKind] = useState("all");
  const [outcome, setOutcome] = useState("all");
  // Everything below depends on the clock and the viewer's locale, neither of
  // which the server shares. Nothing dated renders until the client has
  // mounted, or hydration would find different text than it was sent.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const range = RANGES.find(({ id }) => id === rangeId) ?? RANGES[1];
  const kinds = useMemo(
    () => [...new Set(events.map((event) => event.kind))].sort(),
    [events],
  );

  const view = useMemo(() => {
    const end = Date.now();
    const start = end - range.ms;
    const width = range.ms / range.buckets;
    const rows = events.filter(
      (event) =>
        event.time >= start &&
        (kind === "all" || event.kind === kind) &&
        (outcome === "all" ||
          (outcome === "failed") === isFailure(event.status)),
    );

    const buckets = Array.from({ length: range.buckets }, (_, index) => ({
      start: start + index * width,
      ok: 0,
      failed: 0,
      transformed: 0,
      files: new Set<string>(),
    }));
    for (const event of rows) {
      const bucket =
        buckets[
          Math.min(range.buckets - 1, Math.floor((event.time - start) / width))
        ];
      if (isFailure(event.status)) bucket.failed++;
      else bucket.ok++;
      if (event.transform) bucket.transformed++;
      bucket.files.add(event.file);
    }

    const failed = rows.filter((event) => isFailure(event.status)).length;
    return {
      rows,
      buckets,
      failed,
      ok: rows.length - failed,
      files: new Set(rows.map((event) => event.file)).size,
      transformed: rows.filter((event) => event.transform).length,
      peak: Math.max(...buckets.map((b) => b.ok + b.failed), 1),
    };
  }, [events, range, kind, outcome]);

  const extraHeaders = Object.keys(events[0]?.extra ?? {});
  const columns: UsageColumn<UsageEvent>[] = [
    { header: "Time", cell: (event) => <UsageTime time={event.time} /> },
    {
      header: "Status",
      cell: (event) => (
        <UsageCell
          className={cn(isFailure(event.status) && "text-destructive")}
          detail={isFailure(event.status) ? "Failed" : "Delivered"}
          value={event.status}
        />
      ),
    },
    {
      header: "File",
      className: "max-w-0 w-full",
      cell: (event) => (
        <UsageCell
          detail={event.transform || "Original"}
          value={event.file}
        />
      ),
    },
    { header: "Type", cell: (event) => event.kind },
    ...extraHeaders.map((header) => ({
      header,
      className: "whitespace-nowrap",
      cell: (event: UsageEvent) => event.extra?.[header] ?? "-",
    })),
  ];

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(
    (at) => view.buckets[Math.round(at * (range.buckets - 1))].start,
  );
  const filtered = kind !== "all" || outcome !== "all";

  if (!mounted) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Type"
          className={SELECT_CLASS}
          onChange={(event) => setKind(event.target.value)}
          value={kind}
        >
          <option value="all">All types</option>
          {kinds.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Outcome"
          className={SELECT_CLASS}
          onChange={(event) => setOutcome(event.target.value)}
          value={outcome}
        >
          <option value="all">All outcomes</option>
          <option value="ok">Delivered</option>
          <option value="failed">Failed</option>
        </select>
        {filtered && (
          <Button
            onClick={() => {
              setKind("all");
              setOutcome("all");
            }}
            size="sm"
            variant="ghost"
          >
            Clear filters
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <select
              aria-label="Period"
              className={cn(SELECT_CLASS, "pl-9")}
              onChange={(event) =>
                setRangeId(event.target.value as typeof rangeId)
              }
              value={rangeId}
            >
              {RANGES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {onRefresh && (
            <Button
              aria-label="Refresh"
              disabled={isRefreshing}
              onClick={onRefresh}
              size="icon"
              variant="outline"
            >
              <RefreshCw
                className={cn("size-4", isRefreshing && "animate-spin")}
              />
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <p className="text-sm font-medium">Deliveries over time</p>
          <p className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-sky-500" />
              {view.ok} delivered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-red-500" />
              {view.failed} failed
            </span>
          </p>
        </div>
        <div className="rounded-lg border-t bg-background px-4 pt-4 pb-2 shadow-[0_-1px_0_var(--border)]">
          <div className="flex h-28 items-end gap-1 border-b">
            {view.buckets.map((bucket) => (
              <div
                className="flex h-full flex-1 flex-col justify-end"
                key={bucket.start}
                title={`${formatTick(bucket.start, true)}: ${bucket.ok} delivered, ${bucket.failed} failed`}
              >
                <div
                  className="rounded-t-sm bg-red-500"
                  style={{ height: `${(bucket.failed / view.peak) * 100}%` }}
                />
                <div
                  className={cn(
                    "bg-sky-500",
                    bucket.failed === 0 && "rounded-t-sm",
                  )}
                  style={{ height: `${(bucket.ok / view.peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
            {ticks.map((tick) => (
              <span key={tick}>{formatTick(tick, rangeId !== "30d")}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat
          label="Total deliveries"
          series={view.buckets.map((b) => b.ok + b.failed)}
          value={String(view.rows.length)}
        />
        <Stat
          label="Unique files"
          series={view.buckets.map((b) => b.files.size)}
          value={String(view.files)}
        />
        <Stat
          label="Transformed"
          series={view.buckets.map((b) => b.transformed)}
          value={String(view.transformed)}
        />
        <Stat
          label="Failure rate"
          series={view.buckets.map((b) => b.failed)}
          tone="text-red-500"
          unit="%"
          value={
            view.rows.length === 0
              ? "0"
              : String(Math.round((view.failed / view.rows.length) * 100))
          }
        />
      </div>

      {events.length >= limit && (
        <p className="text-xs text-muted-foreground">
          The log keeps the latest {limit} deliveries, so these figures stop
          at the oldest one it still holds.
        </p>
      )}

      <UsageTable
        columns={columns}
        empty={
          events.length === 0
            ? "Nothing served yet. Requests to your public asset URLs show up here within a few seconds."
            : "No delivery matches these filters in this period."
        }
        isError={isError}
        isLoading={isLoading}
        rowKey={(event) => event.id}
        rows={view.rows}
      />
    </div>
  );
}
