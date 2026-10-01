"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ExternalLink, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type Balance,
  CLOUD_AVAILABLE,
  CLOUD_MONTHLY,
  FEATURES,
  formatUsd,
  isMeteredPlan,
  overUnits,
  planMonthly,
  usageCost,
} from "@/lib/usage";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

// Buckets are a hard cap, not a metered allowance: there's no Autumn balance
// behind them and no overage, so this only belongs in the comparison table.
// Must match BUCKET_LIMITS in apps/server/api/lib/autumn.ts, which is what
// actually enforces it.
const BUCKET_ROW = { label: "Buckets", free: "1", early: "2", cloud: "10" };

// CDN hits still reach the billing ledger on a one-minute timer so serving an
// asset never waits on a usage write, but the figure shown here folds in the
// meter's unflushed count (see apps/server/api/routers/usage.ts), so it is
// current even though the ledger behind it is not yet.
const HINTS: Partial<Record<(typeof FEATURES)[number]["id"], string>> = {
  cdn_requests:
    "Counted as assets are served, including traffic from the last few seconds. Logs has the individual deliveries behind this number.",
  video_processing_seconds:
    "Based on how long the transform actually took to run, not the length of the video. A short edit on a long file costs little.",
  image_transformations:
    "Based on the number of transformations; cached assets are not counted.",
};

const DAY = 86_400_000;
// A day or two of traffic says little about a month: below this, projecting
// would turn one busy afternoon into an alarming number.
const MIN_DAYS_TO_PROJECT = 2;

/**
 * The same moment one month earlier, clamped to the end of a shorter month the
 * way billing anchors are: a period ending Oct 31 began Sep 30, where a bare
 * setMonth would overflow to Oct 1.
 */
function monthBefore(ms: number) {
  const date = new Date(ms);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.getTime();
}

// Autumn timestamps are epoch milliseconds.
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-w-0 rounded-xl border bg-card p-5", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "warning" | "danger";
const TONE_TEXT: Record<Tone, string> = {
  neutral: "",
  warning: "text-amber-600 dark:text-amber-500",
  danger: "text-destructive",
};
const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-foreground/70",
  warning: "bg-amber-500",
  danger: "bg-destructive",
};

/**
 * The period on one axis: the line so far, a dashed run to where the current
 * pace lands at the end, and, on a capped plan, where the allowance stops.
 * Drawn in a 0-100 viewBox stretched to fit; dots and labels are HTML so they
 * keep their shape at any width.
 */
function PeriodChart({
  points,
  start,
  end,
  projected,
  limit,
  format,
}: {
  points: { t: number; v: number }[];
  start: number;
  end: number;
  projected: number | null;
  limit: number | null;
  format: (value: number) => string;
}) {
  const last = points[points.length - 1];
  const top =
    Math.max(...points.map((p) => p.v), projected ?? 0, limit ?? 0) * 1.15 || 1;
  const x = (t: number) => ((t - start) / (end - start)) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.v)}`)
    .join(" ");
  const ticks: number[] = [];
  for (let t = start; t < end - 5 * DAY; t += 7 * DAY) ticks.push(t);
  ticks.push(end);

  return (
    <div className="mt-6">
      <div className="flex gap-3">
        <div className="relative h-36 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden
          >
            <path
              d={`${line} L${x(last.t)},100 L${x(points[0].t)},100 Z`}
              className="fill-foreground/5"
            />
            <line
              x1="0"
              x2="100"
              y1="100"
              y2="100"
              className="stroke-border"
              vectorEffect="non-scaling-stroke"
            />
            {limit !== null && (
              <line
                x1="0"
                x2="100"
                y1={y(limit)}
                y2={y(limit)}
                className="stroke-amber-500"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {projected !== null && (
              <line
                x1={x(last.t)}
                y1={y(last.v)}
                x2="100"
                y2={y(projected)}
                className="stroke-muted-foreground"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={line}
              fill="none"
              className="stroke-foreground/70"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
            style={{ left: `${x(last.t)}%`, top: `${y(last.v)}%` }}
          />
          {projected !== null && (
            <span
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground"
              style={{ left: "100%", top: `${y(projected)}%` }}
            />
          )}
        </div>
        <div className="relative w-16 shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {limit !== null && (
            <span
              className="absolute -translate-y-1/2 truncate text-amber-600 dark:text-amber-500"
              style={{ top: `${y(limit)}%` }}
            >
              {format(limit)}
            </span>
          )}
          {projected !== null && (
            <span
              className="absolute -translate-y-1/2 truncate"
              style={{ top: `${y(projected)}%` }}
            >
              {format(projected)}
            </span>
          )}
        </div>
      </div>
      <div className="relative mt-2 mr-19 h-4 text-[11px] text-muted-foreground">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cn(
              "absolute whitespace-nowrap",
              i === 0
                ? ""
                : i === ticks.length - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{ left: `${x(t)}%` }}
          >
            {shortDate(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

const STORAGE = FEATURES.find((feature) => feature.id === "storage_mb");

// The allowances read "1,000 / mo" in the catalog; inside a list already
// headed "each month" the suffix is noise.
const perMonth = (value: string) => value.replace(" / mo", "");
// "Image transformations" -> "image transformations", "CDN requests" stays.
const inSentence = (label: string) =>
  label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");

export function BillingTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(orpc.usage.get.queryOptions());
  const checkout = useMutation(orpc.billing.checkout.mutationOptions());
  const portal = useMutation(orpc.billing.portal.mutationOptions());
  const planId = data?.planId ?? null;
  const isMetered = isMeteredPlan(planId);
  const monthly = planMonthly(planId);
  const planName = data?.planName ?? "Free";
  // The one paid plan this account can see: the column it gets in the
  // comparison, and what the upgrade button offers. While Cloud is off sale
  // that is always Alpha, and it stays Alpha for an account already on it,
  // since showing Cloud would price something it can't reach from there.
  const paidPlan =
    CLOUD_AVAILABLE && planId !== "early_access"
      ? {
          name: "Cloud",
          column: "cloud" as const,
          price: `$${CLOUD_MONTHLY} / mo`,
          cta: "Upgrade to Cloud",
        }
      : {
          name: "Alpha",
          column: "early" as const,
          // Not just "$0": the card is what checkout collects, so the price
          // has to say usage is billed rather than imply nothing is.
          price: "$0 + usage",
          cta: "Enable pay as you go",
        };
  const planColumn = !isMetered
    ? ("free" as const)
    : planId === "cloud"
      ? ("cloud" as const)
      : ("early" as const);
  const cancelsAt = data?.cancelsAt ?? null;
  const renewsAt = cancelsAt ? null : (data?.renewsAt ?? null);

  // Every monthly allowance refills on the same boundary, so the first one
  // that reports a date speaks for all of them. Read off the balances rather
  // than the subscription: Free has no billing period to renew, but its
  // allowances still reset. Storage returns null (it's cumulative), which is
  // why this picks the first non-null instead of a fixed feature.
  const periodEnd =
    FEATURES.map((feature) => data?.features[feature.id]?.resetsAt).find(
      (value): value is number => typeof value === "number",
    ) ??
    data?.renewsAt ??
    null;
  const periodStart = periodEnd ? monthBefore(periodEnd) : null;
  const now = Date.now();
  const totalDays =
    periodEnd && periodStart ? Math.round((periodEnd - periodStart) / DAY) : 0;
  const elapsedDays =
    periodStart !== null ? Math.max(0, (now - periodStart) / DAY) : 0;
  const canProject = totalDays > 0 && elapsedDays >= MIN_DAYS_TO_PROJECT;

  /** Where a balance lands at the end of the period at the current pace. */
  const project = (usage: Balance & { resetsAt: number | null }) =>
    canProject && usage.resetsAt !== null
      ? (usage.used / elapsedDays) * totalDays
      : usage.used;

  const spent = monthly + usageCost(data?.features);
  const projectedSpend =
    monthly +
    FEATURES.reduce((total, feature) => {
      const usage = data?.features[feature.id];
      if (!usage) return total;
      return (
        total + overUnits({ ...usage, used: project(usage) }) * feature.rate
      );
    }, 0);

  const rows = FEATURES.map((feature) => {
    const usage = data?.features[feature.id];
    const capped = !!usage && !usage.unlimited && usage.granted > 0;
    const projected = usage ? project(usage) : 0;
    const ratio = capped && usage ? usage.used / usage.granted : 0;
    // Only a capped plan warns: past the allowance on a metered one is the
    // plan working as sold, so it reads as billing, not as a problem.
    const tone: Tone = isMetered
      ? "neutral"
      : ratio >= 1
        ? "danger"
        : ratio >= 0.8 || (capped && projected > (usage?.granted ?? 0))
          ? "warning"
          : "neutral";
    return { feature, usage, capped, projected, ratio, tone };
  });

  // What the spend card warns about: on a capped plan, the first allowance on
  // course to run out, and when; on a metered one, where the bill is heading.
  const exhausted = isMetered
    ? undefined
    : rows.find((row) => row.capped && row.ratio >= 1);
  const runningOut = isMetered
    ? undefined
    : rows
        .filter(
          (row) =>
            row.capped &&
            row.ratio < 1 &&
            row.usage?.resetsAt !== null &&
            row.projected > (row.usage?.granted ?? 0),
        )
        .map((row) => ({
          label: row.feature.label,
          // Same pace as the projection, solved for the day it hits the cap.
          at:
            (periodStart ?? now) +
            ((row.usage?.granted ?? 0) / (row.usage?.used || 1)) *
              elapsedDays *
              DAY,
        }))
        .sort((a, b) => a.at - b.at)[0];
  const nearest = rows
    .filter((row) => row.capped)
    .sort((a, b) => b.ratio - a.ratio)[0];

  const history = useQuery(
    orpc.usage.history.queryOptions({
      input: { start: periodStart ?? 0 },
      enabled: periodStart !== null,
    }),
  );
  const paymentMethod = useQuery({
    ...orpc.billing.paymentMethod.queryOptions(),
    enabled: isMetered,
  });

  // The curve: on a metered plan, what the period has cost so far; on a
  // capped one, how far into its tightest monthly allowance it has gone.
  const chartRow = isMetered
    ? undefined
    : rows
        .filter((row) => row.capped && row.usage?.resetsAt !== null)
        .sort((a, b) => b.ratio - a.ratio)[0];
  // Storage has no daily history (see getUsageHistory), so its share of the
  // bill is held at today's figure across the whole curve.
  const storageCost =
    isMetered && STORAGE
      ? overUnits(data?.features.storage_mb) * STORAGE.rate
      : 0;
  const valueAt = (used: Partial<Record<string, number>>) =>
    isMetered
      ? monthly +
        storageCost +
        FEATURES.reduce((total, feature) => {
          const usage = data?.features[feature.id];
          if (!usage || feature.id === "storage_mb") return total;
          return (
            total +
            overUnits({ ...usage, used: used[feature.id] ?? 0 }) * feature.rate
          );
        }, 0)
      : chartRow
        ? (used[chartRow.feature.id] ?? 0)
        : 0;
  let chartPoints: { t: number; v: number }[] | null = null;
  if (periodStart !== null && history.data) {
    const used: Record<string, number> = {};
    chartPoints = [{ t: periodStart, v: valueAt(used) }];
    for (const bin of [...history.data].sort((a, b) => a.day - b.day)) {
      for (const [id, value] of Object.entries(bin.values)) {
        used[id] = (used[id] ?? 0) + (value ?? 0);
      }
      chartPoints.push({ t: Math.min(now, bin.day + DAY), v: valueAt(used) });
    }
    // End on the live figure: the balances already count traffic that
    // Autumn's event store has yet to aggregate.
    chartPoints.push({
      t: now,
      v: isMetered ? spent : (chartRow?.usage?.used ?? 0),
    });
  }

  const card = paymentMethod.data;
  const cardText = card
    ? card.last4
      ? `${capitalize(card.brand ?? "card")} ending ${card.last4}`
      : `${capitalize(card.type)} on file`
    : paymentMethod.isSuccess
      ? "No card on file"
      : null;

  const handleUpgrade = async () => {
    const { paymentUrl } = await checkout.mutateAsync({});
    // Always set, since checkout asks Autumn for a Stripe page unconditionally.
    // If Autumn ever attaches without one, refetch rather than sit on stale UI.
    if (paymentUrl) window.location.href = paymentUrl;
    else queryClient.invalidateQueries({ queryKey: orpc.usage.get.key() });
  };

  const handlePortal = async () => {
    const { url } = await portal.mutateAsync({});
    window.location.href = url;
  };

  if (isError) {
    return <p className="text-destructive text-sm">Failed to load usage.</p>;
  }

  return (
    <div className="space-y-4">
      {periodStart && periodEnd && (
        <p className="text-muted-foreground text-sm">
          {shortDate(periodStart)} to {shortDate(periodEnd)}
          {" · "}day {Math.min(totalDays, Math.floor(elapsedDays) + 1)} of{" "}
          {totalDays}
        </p>
      )}

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Spend */}
        <Card className="flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div>
              <p className="text-muted-foreground text-sm">Spend so far</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-9 w-32" />
              ) : (
                <p className="mt-1 font-semibold text-3xl tabular-nums tracking-tight">
                  {formatUsd(spent)}
                </p>
              )}
            </div>
            <dl className="flex gap-8 text-sm">
              {isMetered ? (
                <>
                  <div>
                    <dt className="text-muted-foreground">Projected</dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {canProject ? formatUsd(projectedSpend) : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Billed</dt>
                    <dd className="mt-1 font-medium">
                      {renewsAt ? shortDate(renewsAt) : "-"}
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt className="text-muted-foreground">Nearest limit</dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {nearest
                        ? `${nearest.feature.short} ${Math.round(nearest.ratio * 100)}%`
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Resets</dt>
                    <dd className="mt-1 font-medium">
                      {periodEnd ? shortDate(periodEnd) : "-"}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {!isLoading && monthly > 0 && (
            <p className="mt-4 text-muted-foreground text-sm tabular-nums">
              {formatUsd(monthly)} plan + {formatUsd(spent - monthly)} usage
            </p>
          )}

          {chartPoints && periodStart !== null && periodEnd !== null && (
            <>
              {chartRow && (
                <p className="mt-6 -mb-3 text-muted-foreground text-xs">
                  {chartRow.feature.label} against the monthly allowance
                </p>
              )}
              <PeriodChart
                points={chartPoints}
                start={periodStart}
                end={periodEnd}
                projected={
                  !canProject
                    ? null
                    : isMetered
                      ? projectedSpend
                      : (chartRow?.projected ?? null)
                }
                limit={chartRow?.usage?.granted ?? null}
                format={
                  isMetered ? formatUsd : (chartRow?.feature.format ?? String)
                }
              />
            </>
          )}

          <p className="mt-auto flex items-start gap-2 pt-6 text-sm">
            {exhausted ? (
              <>
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>
                  {exhausted.feature.label} has run out, so it is paused until{" "}
                  {periodEnd ? shortDate(periodEnd) : "the reset"}.{" "}
                  {paidPlan.name} keeps it running past the allowance.
                </span>
              </>
            ) : runningOut ? (
              <>
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <span>
                  On pace to run out of {runningOut.label.toLowerCase()} around{" "}
                  {shortDate(runningOut.at)}.
                </span>
              </>
            ) : isMetered && canProject && projectedSpend > spent ? (
              <span className="text-muted-foreground">
                On pace for {formatUsd(projectedSpend)} by{" "}
                {periodEnd ? shortDate(periodEnd) : "the end of the period"}.
              </span>
            ) : isMetered ? (
              <span className="text-muted-foreground">
                Nothing stops past an allowance: the extra is billed at the end
                of the period.
              </span>
            ) : (
              <span className="text-muted-foreground">
                The Free plan is capped, so it is never billed. Uploads and
                transformations pause when an allowance runs out.
              </span>
            )}
          </p>
        </Card>

        {/* Plan */}
        <Card>
          <p className="text-muted-foreground text-sm">Plan</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-8 w-28" />
          ) : (
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-semibold text-2xl tracking-tight">
                {planName}
              </span>
              <span className="text-muted-foreground text-sm">
                {isMetered
                  ? monthly > 0
                    ? `$${monthly} a month`
                    : "$0 + usage"
                  : "$0"}
              </span>
            </p>
          )}
          <p className="mt-1 text-muted-foreground text-[13px]">
            {cancelsAt
              ? `Ends ${shortDate(cancelsAt)}`
              : renewsAt
                ? `Renews ${shortDate(renewsAt)}`
                : periodEnd
                  ? `Allowances reset ${shortDate(periodEnd)}`
                  : null}
            {cardText && (
              <>
                {" · "}
                <span
                  className={cn(!card && "text-amber-600 dark:text-amber-500")}
                >
                  {cardText}
                </span>
              </>
            )}
          </p>

          {cancelsAt && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-700 text-xs dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>
                Subscription cancelled. {planName} stays active until{" "}
                <span className="font-medium">{longDate(cancelsAt)}</span>, then
                the account returns to Free. Resubscribe from the billing portal
                to keep it.
              </span>
            </p>
          )}

          <div className="mt-4 border-t pt-4">
            <p className="text-sm">
              {isMetered
                ? "Included each month, then billed per use:"
                : `${paidPlan.name} ${paidPlan.column === "early" ? "doubles" : "raises"} every allowance and keeps things running past it:`}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {[...FEATURES, BUCKET_ROW].map((feature) => (
                <li key={feature.label} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  <span className="tabular-nums">
                    {perMonth(
                      isMetered
                        ? feature[planColumn]
                        : feature[paidPlan.column],
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {inSentence(feature.label)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              {isMetered ? (
                // Alpha has a $0 base price but still bills usage, so the
                // portal is the only way it can put a card on file.
                <Button
                  size="sm"
                  variant="outline"
                  disabled={portal.isPending}
                  onClick={handlePortal}
                >
                  {portal.isPending ? "Opening..." : "Manage subscription"}
                  <ExternalLink />
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={isLoading || checkout.isPending}
                  onClick={handleUpgrade}
                >
                  {checkout.isPending ? "Redirecting..." : paidPlan.cta}
                </Button>
              )}
            </div>
            {portal.isError && (
              <p className="mt-2 text-destructive text-xs">
                Couldn't open the billing portal. Try again.
              </p>
            )}
          </div>
        </Card>

        {/* Usage */}
        <Card>
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-medium text-sm">Usage</p>
            {periodEnd && (
              <p className="text-muted-foreground text-[13px]">
                Resets {shortDate(periodEnd)}
              </p>
            )}
          </div>
          <div className="mt-4 space-y-5">
            {rows.map(({ feature, usage, capped, projected, ratio, tone }) => {
              // The bar's scale stretches to fit a projection past the
              // allowance, and a tick marks where the allowance ends.
              // Past the allowance, the bar splits at the tick: what was
              // included, then the overage in the row's tone.
              const scale = Math.max(
                usage?.granted ?? 0,
                usage?.used ?? 0,
                projected,
                1,
              );
              const usedPct = usage ? (usage.used / scale) * 100 : 0;
              const projectedPct = (projected / scale) * 100;
              const limitPct =
                capped && usage ? (usage.granted / scale) * 100 : 100;
              const over = capped && usage ? projected / usage.granted - 1 : 0;
              const overUsed = overUnits(usage);
              return (
                <div key={feature.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {tone !== "neutral" && (
                        <AlertTriangle
                          className={cn(
                            "size-4 shrink-0 self-center",
                            TONE_TEXT[tone],
                          )}
                        />
                      )}
                      <span className="truncate">{feature.label}</span>
                      {HINTS[feature.id] && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`About ${feature.label}`}
                              className="self-center text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Info className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-56">
                            {HINTS[feature.id]}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                    {isLoading || !usage ? (
                      <Skeleton className="h-4 w-24" />
                    ) : (
                      <span className="shrink-0 tabular-nums">
                        <span
                          className={cn(
                            "font-medium",
                            overUsed > 0 && TONE_TEXT[tone],
                          )}
                        >
                          {feature.format(usage.used)}
                        </span>
                        {capped && (
                          <span className="text-muted-foreground">
                            {" "}
                            of {feature.format(usage.granted)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    {projectedPct > usedPct && (
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 opacity-30",
                          TONE_FILL[tone],
                        )}
                        style={{ width: `${Math.min(100, projectedPct)}%` }}
                      />
                    )}
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-all",
                        overUsed > 0 ? "bg-foreground/25" : TONE_FILL[tone],
                      )}
                      style={{ width: `${Math.min(usedPct, limitPct)}%` }}
                    />
                    {overUsed > 0 && (
                      <div
                        className={cn(
                          "absolute inset-y-0 rounded-r-full",
                          TONE_FILL[tone],
                        )}
                        style={{
                          left: `${limitPct}%`,
                          width: `${usedPct - limitPct}%`,
                        }}
                      />
                    )}
                    {limitPct < 100 && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-background"
                        style={{ left: `${limitPct}%` }}
                      />
                    )}
                  </div>

                  <div className="mt-1.5 flex justify-between gap-3 text-muted-foreground text-xs">
                    <span className={cn(overUsed > 0 && TONE_TEXT[tone])}>
                      {!usage
                        ? null
                        : overUsed > 0
                          ? `${feature.format(overUsed)} over the allowance`
                          : usage.resetsAt === null
                            ? "Cumulative, never resets"
                            : !canProject
                              ? "Projection after day 2"
                              : over > 0
                                ? `Projected ${feature.format(projected)}, ${Math.round(over * 100)}% over`
                                : `Projected ${feature.format(projected)}`}
                    </span>
                    <span className="shrink-0 text-right">
                      {isMetered && overUsed > 0
                        ? `${formatUsd(overUsed * feature.rate)} at ${feature.overage.replace(" / ", " per ")}`
                        : isMetered
                          ? feature.overage.replace(" / ", " per ")
                          : ratio >= 1
                            ? "Paused until reset"
                            : "Pauses at the limit"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Plans */}
        <Card className="self-start">
          <p className="font-medium text-sm">Plans</p>
          <p className="mt-1 text-muted-foreground text-[13px]">
            Allowances are monthly, except storage and buckets.
          </p>
          <div className="mt-4 text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b pb-2 text-muted-foreground">
              <span />
              <span className="w-16 text-right">Free</span>
              <span className="w-20 text-right">{paidPlan.name}</span>
            </div>
            {[...FEATURES, BUCKET_ROW].map((feature) => (
              <div
                key={feature.label}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b py-2"
              >
                <span className="truncate">{feature.label}</span>
                <span className="w-16 text-right text-muted-foreground tabular-nums">
                  {perMonth(feature.free)}
                </span>
                <span className="w-20 text-right tabular-nums">
                  {perMonth(feature[paidPlan.column])}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 pt-2 font-medium">
              <span>Price</span>
              <span className="w-16 text-right text-muted-foreground">$0</span>
              <span className="w-20 text-right">{paidPlan.price}</span>
            </div>
          </div>
          <p className="mt-5 font-medium text-sm">Past the allowance</p>
          <p className="mt-1 text-muted-foreground text-[13px]">
            {isMetered
              ? "Nothing stops; the extra is billed at the end of the period."
              : `On ${paidPlan.name}, nothing stops; the extra is billed at the end of the period. Free simply pauses.`}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {FEATURES.map((feature) => (
              <li key={feature.id} className="flex justify-between gap-4">
                <span className="truncate">{feature.label}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {feature.overage}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
