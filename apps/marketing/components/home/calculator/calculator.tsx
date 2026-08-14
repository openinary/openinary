"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { CtaLink, focusRing, pressable } from "@/components/home/cta-button";
import {
  avgDeliveredAssetKb,
  cloudinaryCost,
  lastCheckedOn,
  openinaryCloudCost,
  plans,
  selfHostedCost,
  usageForPlan,
  type Cost,
  type Usage,
} from "@/lib/pricing";

const fields: { key: keyof Usage; label: string; unit: string; step: number }[] = [
  { key: "storageGb", label: "Storage", unit: "GB", step: 1 },
  { key: "transformations", label: "Image transformations", unit: "/ month", step: 1000 },
  { key: "videoMinutes", label: "Video processing", unit: "min / month", step: 5 },
  { key: "cdnRequests", label: "CDN requests", unit: "/ month", step: 10000 },
];

const usd = (value: number) =>
  value === 0
    ? "$0"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value < 100 ? 2 : 0,
      });

export function Calculator() {
  // null once the usage fields are edited by hand: the chips are presets, so
  // leaving one lit while the numbers have moved off it would misread as "this
  // is your plan".
  const [planId, setPlanId] = React.useState<string | null>("plus");
  const [usage, setUsage] = React.useState<Usage>(() => usageForPlan("plus"));
  const [detailed, setDetailed] = React.useState(false);

  const cloudinary = cloudinaryCost(usage);
  const cloud = openinaryCloudCost(usage);
  const selfHosted = selfHostedCost(usage);

  // Compare against whichever way of running Openinary is cheaper, and name it,
  // so the headline saving is always attributable to a column on screen.
  const winner =
    selfHosted.monthlyUsd <= cloud.monthlyUsd
      ? { name: "self-hosted", monthlyUsd: selfHosted.monthlyUsd }
      : { name: "Openinary Cloud", monthlyUsd: cloud.monthlyUsd };
  const savedPerMonth = cloudinary.monthlyUsd - winner.monthlyUsd;
  const savedPercent =
    cloudinary.monthlyUsd > 0
      ? Math.round((savedPerMonth / cloudinary.monthlyUsd) * 100)
      : 0;

  const selectPlan = (id: string) => {
    setPlanId(id);
    setUsage(usageForPlan(id));
  };

  return (
    // Hairlines from the 1px gap over a border-coloured ground, matching the
    // feature grid, so the split reads as part of the page's box structure
    // rather than two floating panels.
    <div className="grid gap-px bg-border pt-px lg:grid-cols-[360px_1fr]">
      {/* Inputs */}
      <div className="flex flex-col gap-6 bg-background p-6 sm:p-8 lg:p-10">
        <fieldset>
          <legend className="text-sm font-medium">
            What do you pay Cloudinary today?
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => selectPlan(plan.id)}
                aria-pressed={planId === plan.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                  focusRing,
                  pressable,
                  planId === plan.id
                    ? "border-foreground bg-muted"
                    : "border-border hover:border-foreground/30",
                )}
              >
                <span className="block font-medium">{plan.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {usd(plan.monthlyUsd)}/mo
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <button
            type="button"
            onClick={() => setDetailed((open) => !open)}
            aria-expanded={detailed}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm border-b border-border pb-2 text-sm font-medium transition-all hover:text-foreground",
              focusRing,
              pressable,
            )}
          >
            Or detail your usage
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                detailed && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {detailed && (
            <div className="mt-4 flex flex-col gap-4">
              {fields.map(({ key, label, unit, step }) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between text-xs">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">{unit}</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={step}
                    value={usage[key]}
                    onChange={(event) => {
                      setPlanId(null);
                      setUsage((current) => ({
                        ...current,
                        [key]: Math.max(0, Number(event.target.value) || 0),
                      }));
                    }}
                    className={cn(
                      "h-9 rounded-md border border-border bg-background px-2 text-sm tabular-nums transition-all",
                      focusRing,
                    )}
                  />
                </label>
              ))}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Cloudinary meters delivery in GB and we meter it in requests, so
                requests are converted at {avgDeliveredAssetKb} KB per delivered
                asset.
              </p>
            </div>
          )}
        </div>

        <CtaLink
          href="https://app.openinary.dev"
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="cloud_cta_clicked"
          data-track-prop-location="calculator"
          className="w-full"
        >
          Start free
        </CtaLink>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-6 bg-background p-6 sm:p-8 lg:p-10">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
            Your monthly cost
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {savedPerMonth > 0 ? (
              <>
                You save {usd(savedPerMonth)}
                <span className="text-muted-foreground"> / month</span>
              </>
            ) : (
              "Both are free at this usage"
            )}
          </p>
          {savedPerMonth > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {savedPercent}% less running {winner.name}, {usd(savedPerMonth * 36)}{" "}
              over three years.
            </p>
          )}
        </div>

        <div className="grid gap-px bg-border pt-px sm:grid-cols-3">
          <Column name="Cloudinary" cost={cloudinary} tone="rival" />
          <Column
            name="Openinary Cloud"
            cost={cloud}
            highlighted={winner.name === "Openinary Cloud"}
          />
          <Column
            name="Self-hosted"
            cost={selfHosted}
            note="Your own server and bucket"
            highlighted={winner.name === "self-hosted"}
          />
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Public list prices, checked on{" "}
          <time dateTime={lastCheckedOn}>
            {new Date(lastCheckedOn).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
          . Cloudinary bills in credits, so its figure is the cheapest plan that
          covers the same workload. Your own contract may differ.
        </p>
      </div>
    </div>
  );
}

function Column({
  name,
  cost,
  note,
  tone,
  highlighted = false,
}: {
  name: string;
  cost: Cost;
  note?: string;
  tone?: "rival";
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4",
        highlighted ? "bg-muted/60" : "bg-background",
      )}
    >
      <div>
        <p className="text-sm font-medium">
          {name}
          {highlighted && <span className="sr-only"> (cheapest)</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {cost.planName ?? note ?? " "}
        </p>
      </div>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums tracking-[-0.02em]",
          tone === "rival" && "text-muted-foreground",
        )}
      >
        {usd(cost.monthlyUsd)}
        <span className="text-xs font-normal text-muted-foreground"> /mo</span>
      </p>
      <ul className="mt-auto flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
        {cost.lines.length === 0 ? (
          <li>Nothing to pay</li>
        ) : (
          cost.lines.map((line) => (
            <li key={line.label} className="flex justify-between gap-2">
              <span className="truncate">{line.label}</span>
              <span className="shrink-0 tabular-nums">{usd(line.usd)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
