"use client";

import { CalendarDays, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Skeleton, SkeletonBox } from "skullet/react";

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

/** Deliveries of one kind over one stretch of time (an hour, server-side). */
export type UsageCount = {
  /** Epoch ms at the start of the stretch. */
  time: number;
  kind: string;
  delivered: number;
  failed: number;
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
const HOUR_MS = 3_600_000;

/** One filter of the toolbar: a select that always has a value. */
function FilterSelect({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={options}
      onValueChange={(next) => next !== null && onChange(next)}
      value={value}
    >
      <SelectTrigger aria-label={label} className="font-medium">
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
const SAMPLE_EVENTS: UsageEvent[] = [0, 1, 2, 3].map((i) => ({
  id: `sample-${i}`,
  time: 0,
  status: 200,
  kind: "image",
  file: "photos/sample-file.jpg",
  transform: "w_800,f_webp",
}));

// The table scrolls inside a 32rem frame, so past this many rows the extra
// ones change nothing on screen.
const MAX_REMEMBERED_ROWS = 15;
const subscribeNothing = () => () => {};

/**
 * How many rows this table showed last time ("empty" for none), so the
 * skeleton is the height the table will be. A plain count rather than
 * skullet's remembered shape: a full table is past the size skullet stores.
 */
function useRememberedRows(id: string | undefined) {
  const key = id && `openinary:table-rows:${id}`;
  const remembered = useSyncExternalStore(
    subscribeNothing,
    () => {
      try {
        return key ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
  const remember = useCallback(
    (rows: number) => {
      try {
        if (key) localStorage.setItem(key, String(rows));
      } catch {}
    },
    [key],
  );
  return [remembered === null ? null : Number(remembered), remember] as const;
}

export function UsageTable<Row>({
  id,
  columns,
  rows,
  rowKey,
  empty,
  isLoading,
  isError,
  sample,
}: {
  /** Remembers the row count under this key, for the next loading skeleton. */
  id?: string;
  columns: UsageColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty: string;
  isLoading?: boolean;
  /** Stand-in rows the loading skeleton is measured from. */
  sample?: Row[];
  isError?: boolean;
}) {
  const [rememberedRows, rememberRows] = useRememberedRows(id);
  const known = !isLoading && !isError;
  useEffect(() => {
    if (known) rememberRows(Math.min(rows.length, MAX_REMEMBERED_ROWS));
  }, [known, rows.length, rememberRows]);

  if (isError) {
    return <p className="text-sm text-destructive">Failed to load activity.</p>;
  }

  const emptyState = (
    <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {empty}
    </p>
  );

  // One skeleton across loading and loaded, over the table itself: its cells
  // filled from `sample` (or placeholder text), as many rows as it had last
  // time, so the skeleton has the real columns, row height and length.
  let content: React.ReactNode;
  if (isLoading) {
    const count = rememberedRows ?? sample?.length ?? 4;
    content =
      count === 0 ? (
        emptyState
      ) : (
        <UsageTableBody<Row, number>
          cell={(column, i) =>
            sample?.length
              ? column.cell(sample[i % sample.length] as Row)
              : "Loading value"
          }
          columns={columns}
          rowKey={String}
          rows={Array.from({ length: count }, (_, i) => i)}
        />
      );
  } else if (rows.length === 0) {
    content = emptyState;
  } else {
    content = (
      <UsageTableBody
        cell={(column, row) => column.cell(row)}
        columns={columns}
        rowKey={rowKey}
        rows={rows}
      />
    );
  }

  return (
    <Skeleton loading={!!isLoading} label="Loading activity">
      {content}
    </Skeleton>
  );
}

function UsageTableBody<Row, Item>({
  columns,
  rows,
  rowKey,
  cell,
}: {
  columns: UsageColumn<Row>[];
  rows: Item[];
  rowKey: (row: Item) => string;
  cell: (column: UsageColumn<Row>, row: Item) => React.ReactNode;
}) {
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
                  {cell(column, row)}
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
 * figures, then the lines themselves. The chart and figures come from
 * `counts` when the host keeps them, and otherwise from the events, in which
 * case they can only describe what the log holds.
 */
export function UsageDashboard({
  events,
  counts,
  limit,
  isLoading,
  isError,
  isRefreshing,
  onRefresh,
}: {
  events: UsageEvent[];
  /** Every delivery, tallied, for hosts whose log keeps fewer lines than they serve. */
  counts?: UsageCount[];
  /** How many events the log keeps, to say so once it is full. */
  limit: number;
  isLoading?: boolean;
  isError?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("7d");
  const [kind, setKind] = useState("all");
  const [outcome, setOutcome] = useState("all");
  // Everything below depends on the clock and the viewer's locale, neither of
  // which the server shares. Nothing dated renders until the client has
  // mounted, or hydration would find different text than it was sent.
  // Mounted on the client from the start, so a page that only mounts there
  // (the cloud dashboard) never shows the placeholder below at all.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const range = RANGES.find(({ id }) => id === rangeId) ?? RANGES[1];
  // Without counts from the host, each event is a count of one.
  const tallies = useMemo<UsageCount[]>(
    () =>
      counts ??
      events.map((event) => ({
        time: event.time,
        kind: event.kind,
        delivered: isFailure(event.status) ? 0 : 1,
        failed: isFailure(event.status) ? 1 : 0,
      })),
    [counts, events],
  );
  const kinds = useMemo(
    () => [...new Set(tallies.map((tally) => tally.kind))].sort(),
    [tallies],
  );

  const view = useMemo(() => {
    // Ends on the hour so hourly counts fill whole buckets.
    const end = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS;
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
      image: 0,
      video: 0,
    }));
    for (const tally of tallies) {
      if (tally.time < start || (kind !== "all" && tally.kind !== kind)) {
        continue;
      }
      const ok = outcome === "failed" ? 0 : tally.delivered;
      const failed = outcome === "ok" ? 0 : tally.failed;
      const bucket =
        buckets[
          Math.min(range.buckets - 1, Math.floor((tally.time - start) / width))
        ];
      bucket.ok += ok;
      bucket.failed += failed;
      if (tally.kind === "image") bucket.image += ok + failed;
      if (tally.kind === "video") bucket.video += ok + failed;
    }

    const sum = (key: "ok" | "failed" | "image" | "video") =>
      buckets.reduce((total, bucket) => total + bucket[key], 0);
    return {
      rows,
      buckets,
      ok: sum("ok"),
      failed: sum("failed"),
      images: sum("image"),
      videos: sum("video"),
      peak: Math.max(...buckets.map((b) => b.ok + b.failed), 1),
    };
  }, [events, tallies, range, kind, outcome]);
  const total = view.ok + view.failed;

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
        <UsageCell detail={event.transform || "Original"} value={event.file} />
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
        <SkeletonBox height={36} width="100%" />
        <SkeletonBox height={176} width="100%" />
        <SkeletonBox height={80} width="100%" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Type"
          onChange={setKind}
          options={[
            { value: "all", label: "All types" },
            ...kinds.map((value) => ({ value, label: value })),
          ]}
          value={kind}
        />
        <FilterSelect
          label="Outcome"
          onChange={setOutcome}
          options={[
            { value: "all", label: "All outcomes" },
            { value: "ok", label: "Delivered" },
            { value: "failed", label: "Failed" },
          ]}
          value={outcome}
        />
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
          <FilterSelect
            icon={<CalendarDays />}
            label="Period"
            onChange={(value) => setRangeId(value as typeof rangeId)}
            options={RANGES.map(({ id, label }) => ({ value: id, label }))}
            value={rangeId}
          />
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

      {/* The figures keep their layout while loading: only their values
          change, so they are drawn as skeleton over zeros. */}
      <Skeleton loading={!!isLoading} label="Loading activity">
        <div className="space-y-4">
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
                      style={{
                        height: `${(bucket.failed / view.peak) * 100}%`,
                      }}
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
              value={String(total)}
            />
            <Stat
              label="Images"
              series={view.buckets.map((b) => b.image)}
              value={String(view.images)}
            />
            <Stat
              label="Videos"
              series={view.buckets.map((b) => b.video)}
              tone="text-violet-500"
              value={String(view.videos)}
            />
            <Stat
              label="Failure rate"
              series={view.buckets.map((b) => b.failed)}
              tone="text-red-500"
              unit="%"
              value={
                total === 0
                  ? "0"
                  : String(Math.round((view.failed / total) * 100))
              }
            />
          </div>
        </div>
      </Skeleton>

      {events.length >= limit && (
        <p className="text-xs text-muted-foreground">
          {counts
            ? `The table below keeps the latest ${limit} deliveries. The chart and figures above count every one.`
            : `The log keeps the latest ${limit} deliveries, so these figures stop at the oldest one it still holds.`}
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
        id="deliveries"
        rowKey={(event) => event.id}
        rows={view.rows}
        sample={SAMPLE_EVENTS}
      />
    </div>
  );
}
