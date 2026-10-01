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
  const periodStart = periodEnd
    ? new Date(periodEnd).setMonth(new Date(periodEnd).getMonth() - 1)
    : null;
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
    const tone: Tone =
      ratio >= 1
        ? isMetered
          ? "warning"
          : "danger"
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
          </p>

          {cancelsAt && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-700 text-xs dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>
                Subscription cancelled. {planName} stays active until{" "}
                <span className="font-medium">{longDate(cancelsAt)}</span>, then
                the account returns to Free. Resubscribe from the billing
                portal to keep it.
              </span>
            </p>
          )}

          <div className="mt-4 border-t pt-4">
            <p className="text-sm">
              {isMetered
                ? "Included each month, then billed per use:"
                : `${paidPlan.name} doubles every allowance and keeps things running past it:`}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {[...FEATURES, BUCKET_ROW].map((feature) => (
                <li key={feature.label} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  <span className="tabular-nums">
                    {isMetered ? feature[planColumn] : feature[paidPlan.column]}
                  </span>
                  <span className="text-muted-foreground">
                    {feature.label.toLowerCase()}
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
              const scale = Math.max(usage?.granted ?? 0, projected, 1);
              const usedPct = usage ? (usage.used / scale) * 100 : 0;
              const projectedPct = (projected / scale) * 100;
              const limitPct =
                capped && usage ? (usage.granted / scale) * 100 : 100;
              const over = capped && usage ? projected / usage.granted - 1 : 0;
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
                        <span className="font-medium">
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
                        TONE_FILL[tone],
                      )}
                      style={{ width: `${Math.min(100, usedPct)}%` }}
                    />
                    {limitPct < 100 && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-background"
                        style={{ left: `${limitPct}%` }}
                      />
                    )}
                  </div>

                  <div className="mt-1.5 flex justify-between gap-3 text-muted-foreground text-xs">
                    <span>
                      {!usage
                        ? null
                        : usage.resetsAt === null
                          ? "Cumulative, never resets"
                          : !canProject
                            ? "Projection after day 2"
                            : over > 0
                              ? `Projected ${feature.format(projected)}, ${Math.round(over * 100)}% over`
                              : `Projected ${feature.format(projected)}`}
                    </span>
                    <span className="shrink-0 text-right">
                      {isMetered
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
                  {feature.free}
                </span>
                <span className="w-20 text-right tabular-nums">
                  {feature[paidPlan.column]}
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
