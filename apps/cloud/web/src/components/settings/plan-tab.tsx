"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ExternalLink, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
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
// behind them and no overage, so this only belongs in the comparison table -
// not in Usage or Pay as you go. Must match BUCKET_LIMITS in
// apps/server/api/lib/autumn.ts, which is what actually enforces it.
const BUCKET_ROW = { label: "Buckets", free: "1", early: "2", cloud: "10" };

// CDN hits still reach the billing ledger on a one-minute timer so serving an
// asset never waits on a usage write, but the figure shown here folds in the
// meter's unflushed count (see apps/server/api/routers/usage.ts), so it is
// current even though the ledger behind it is not yet.
const HINTS: Partial<Record<(typeof FEATURES)[number]["id"], string>> = {
  cdn_requests:
    "Counted as assets are served, including traffic from the last few seconds. See the Usage tab for the individual deliveries behind this number.",
  video_processing_seconds:
    "Based on how long the transform actually took to run, not the length of the video. A short edit on a long file costs little.",
  image_transformations:
    "Based on the number of transformations; cached assets are not counted.",
};

// Autumn timestamps are epoch milliseconds.
function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PlanTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(orpc.usage.get.queryOptions());
  const checkout = useMutation(orpc.billing.checkout.mutationOptions());
  const portal = useMutation(orpc.billing.portal.mutationOptions());
  const planId = data?.planId ?? null;
  const isMetered = isMeteredPlan(planId);
  const monthly = planMonthly(planId);
  const planName = data?.planName ?? "Free";
  // The one paid plan this account can see: the column it gets in the
  // comparison table, and what the upgrade button offers. While Cloud is off
  // sale that is always Alpha - and it stays Alpha for an account already on
  // it, since showing Cloud would price something it can't reach from there.
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
          // column has to say usage is billed rather than imply nothing is.
          price: "$0 + usage",
          cta: "Enable pay as you go",
        };
  const cancelsAt = data?.cancelsAt ?? null;
  // Hidden once cancelled: the plan expires instead of renewing, and that date
  // is already spelled out in the cancellation notice above.
  const renewsAt = cancelsAt ? null : (data?.renewsAt ?? null);
  const extraCost = usageCost(data?.features);
  // Every monthly allowance refills on the same boundary, so the first one
  // that reports a date speaks for all of them. Read off the balances rather
  // than the subscription: Free has no billing period to renew, but its
  // allowances still reset, and that date is the only thing a Free account
  // can act on. Storage returns null here (it's cumulative), which is exactly
  // why this picks the first non-null instead of a fixed feature.
  const resetsAt =
    FEATURES.map((feature) => data?.features[feature.id]?.resetsAt).find(
      (value): value is number => typeof value === "number",
    ) ?? null;

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

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Current plan</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {isMetered
                ? `${planName} includes pay-as-you-go beyond the monthly allowance.`
                : "The Free trial is capped: uploads and transformations stop once an allowance runs out."}
            </p>
          </div>
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <span className="shrink-0 rounded-full border px-3 py-1 font-medium text-xs">
              {planName}
              {monthly > 0 && (
                <span className="ml-1.5 text-muted-foreground">{`$${monthly}/mo`}</span>
              )}
            </span>
          )}
        </div>
        {cancelsAt && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-700 text-xs dark:text-amber-400">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>
              Subscription cancelled. {planName} stays active until{" "}
              <span className="font-medium">{formatDate(cancelsAt)}</span>, then
              the account returns to Free - usage above the Free allowance will
              stop working. Resubscribe from the billing portal to keep it.
            </span>
          </p>
        )}
        {!isLoading && (
          <div className="mt-3 flex items-center gap-2">
            {!isMetered && (
              <Button
                size="sm"
                disabled={checkout.isPending}
                onClick={handleUpgrade}
              >
                {checkout.isPending ? "Redirecting…" : paidPlan.cta}
              </Button>
            )}
            {/* Alpha has a $0 base price but still bills usage, so the
                portal is the only way it can put a card on file. */}
            {isMetered && (
              <button
                type="button"
                disabled={portal.isPending}
                onClick={handlePortal}
                className="inline-flex items-center gap-1 text-muted-foreground text-xs underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
              >
                {portal.isPending ? "Opening…" : "Manage subscription"}
                <ExternalLink className="size-3" />
              </button>
            )}
          </div>
        )}
        {portal.isError && (
          <p className="mt-2 text-destructive text-xs">
            Couldn't open the billing portal. Try again.
          </p>
        )}
      </div>

      <Separator />

      {/* Usage this period */}
      <div>
        <p className="font-medium text-sm">Usage</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {isMetered
            ? "What your plan includes this period. Going past it never stops anything - the extra is simply billed at the end of the period. Storage is cumulative; the rest resets monthly."
            : "Consumption against your current allowance. Storage is cumulative; the rest resets monthly."}
        </p>
        {/* The one thing a blocked Free account actually needs: not that the
            allowance resets, but when. Kept out of the sentence above so it
            survives that copy being reworded. */}
        {resetsAt && (
          <p className="mt-1.5 text-muted-foreground text-xs">
            Monthly allowances reset on{" "}
            <span className="font-medium text-foreground">
              {formatDate(resetsAt)}
            </span>
            .
          </p>
        )}

        {isMetered && extraCost > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 text-muted-foreground text-xs">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>
              <span className="font-medium text-foreground">
                Usage-based pricing is active.
              </span>{" "}
              You're past what the plan includes, so nothing is blocked, you
              just pay for what you use beyond it.
            </span>
          </p>
        )}

        {isError ? (
          <p className="mt-3 text-destructive text-sm">Failed to load usage.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {FEATURES.map((feature) => {
              const usage = data?.features[feature.id];
              const over = overUnits(usage);
              // On a metered plan the bar splits into included + extra rather
              // than capping, so a full bar reads "metered", not "blocked".
              // Free has a real wall, so it keeps the clamped destructive fill.
              const percent =
                usage && !usage.unlimited && usage.granted > 0
                  ? Math.min(100, (usage.used / usage.granted) * 100)
                  : 0;
              const includedPercent =
                isMetered && over > 0 && usage
                  ? (usage.granted / usage.used) * 100
                  : percent;
              return (
                <div key={feature.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1 font-medium">
                      {feature.label}
                      {HINTS[feature.id] && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`About ${feature.label}`}
                              className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Info className="size-3" />
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
                      <span className="flex items-baseline gap-1.5 tabular-nums">
                        <span className="text-muted-foreground">
                          {usage.unlimited
                            ? `${feature.format(usage.used)} used`
                            : `${feature.format(usage.used)} / ${feature.format(usage.granted)} included`}
                        </span>
                        {isMetered && over > 0 && (
                          <span className="font-medium">
                            +{formatUsd(over * feature.rate)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all",
                        !isMetered && percent >= 100
                          ? "bg-destructive"
                          : "bg-foreground",
                      )}
                      style={{ width: `${includedPercent}%` }}
                    />
                    {isMetered && over > 0 && (
                      <div
                        className="h-full bg-foreground/35 transition-all"
                        style={{ width: `${100 - includedPercent}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {isMetered && (
              <div className="flex items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                <span className="font-medium">
                  Estimated this period
                  {renewsAt && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      billed {formatDate(renewsAt)}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">
                  {/* Only worth breaking down when there is a base price to
                      break out - on Alpha the total *is* the usage. */}
                  {monthly > 0 && (
                    <span className="text-muted-foreground">
                      {formatUsd(monthly)} plan
                      {extraCost > 0 && ` + ${formatUsd(extraCost)} usage`} ={" "}
                    </span>
                  )}
                  <span className="font-medium">
                    {formatUsd(monthly + extraCost)}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Plan comparison */}
      <div>
        <p className="font-medium text-sm">Plans</p>
        <p className="mt-1 text-muted-foreground text-xs">
          What each plan includes. Allowances reset monthly, except storage and
          buckets.
        </p>

        <div className="mt-3 overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b bg-muted/40 px-4 py-2 text-xs">
            <span className="text-muted-foreground">Feature</span>
            <span
              className={cn(
                "w-24 text-right font-medium",
                !isMetered && "flex items-center justify-end gap-1",
              )}
            >
              {!isMetered && <Check className="size-3" />}Free
            </span>
            <span
              className={cn(
                "w-28 text-right font-medium",
                isMetered && "flex items-center justify-end gap-1",
              )}
            >
              {isMetered && <Check className="size-3" />}
              {paidPlan.name}
            </span>
          </div>
          {[...FEATURES, BUCKET_ROW].map((feature) => (
            <div
              key={feature.label}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-2.5 text-xs last:border-0"
            >
              <span>{feature.label}</span>
              <span className="w-24 text-right text-muted-foreground tabular-nums">
                {feature.free}
              </span>
              <span className="w-28 text-right tabular-nums">
                {feature[paidPlan.column]}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t bg-muted/40 px-4 py-2.5 text-xs">
            <span className="font-medium">Price</span>
            <span className="w-24 text-right text-muted-foreground">$0</span>
            <span className="w-28 text-right font-medium">
              {paidPlan.price}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Pay as you go */}
      <div>
        <p className="font-medium text-sm">Pay as you go</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {isMetered
            ? "Going over an allowance keeps things running and is billed at the end of the period."
            : `Included with ${paidPlan.name}: going over an allowance keeps things running and is billed at the end of the period. The Free trial is simply blocked.`}
        </p>

        <div className="mt-3 space-y-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.id}
              className="flex items-center justify-between gap-4 rounded-lg border px-4 py-2.5 text-xs"
            >
              <span>{feature.label}</span>
              <span className="text-right tabular-nums">{feature.overage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
