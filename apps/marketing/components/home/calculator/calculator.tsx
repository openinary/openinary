"use client";

import * as React from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CtaLink,
  fieldShell,
  focusRing,
  panelSurface,
  pressable,
  sliderThumb,
} from "@/components/home/cta-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSliderWithInput } from "@/hooks/use-slider-with-input";
import {
  cloudinaryCost,
  lastCheckedOn,
  openinaryCloudCost,
  plans,
  selfHostedCost,
  usageForPlan,
  type Cost,
  type Usage,
} from "@/lib/pricing";

/**
 * Slider ranges. The maximum also clamps what can be typed, so it is set well
 * past Cloudinary's largest public plan rather than snug around the presets: a
 * number typed by hand snapping back to a lower one would be worse than a
 * thumb that opens near the left. Steps are coarse enough that dragging lands
 * on a number a person would say out loud.
 */
const fields: {
  key: keyof Usage;
  label: string;
  unit: string;
  max: number;
  step: number;
}[] = [
  { key: "storageGb", label: "Storage", unit: "GB", max: 500, step: 10 },
  {
    key: "transformations",
    label: "Transformations",
    unit: "/ mo",
    max: 500_000,
    step: 10_000,
  },
  {
    key: "videoMinutes",
    label: "Video",
    unit: "min / mo",
    max: 2500,
    step: 50,
  },
  {
    key: "cdnRequests",
    label: "CDN requests",
    unit: "/ mo",
    max: 2_500_000,
    step: 50_000,
  },
];

const usd = (value: number) =>
  value === 0
    ? "$0"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value < 100 ? 2 : 0,
      });

/**
 * The self-hosted figure, to the nearest five dollars.
 *
 * The other two columns are arithmetic on published rates, so they are quoted
 * to the cent. This one rests on how much work a vCPU absorbs, which is an
 * estimate, and a number carried out to the cent claims a precision the
 * estimate behind it does not have.
 */
const usdRough = (value: number) => `$${Math.max(5, Math.round(value / 5) * 5)}`;

const DEFAULT_PLAN = "plus";

export function Calculator() {
  // null once the usage fields are edited by hand: the chips are presets, so
  // leaving one lit while the numbers have moved off it would misread as "this
  // is your plan".
  const [planId, setPlanId] = React.useState<string | null>(DEFAULT_PLAN);
  const [usage, setUsage] = React.useState<Usage>(() =>
    usageForPlan(DEFAULT_PLAN),
  );
  // The fields fold away on phones, where the panel would otherwise be a long
  // scroll before the numbers. From lg there is room for them, so they stay
  // open and this only drives the button that is no longer rendered.
  const [detailed, setDetailed] = React.useState(false);
  // Bumped on every preset, to remount the fields: each one owns its value, so
  // a new number has to arrive as a fresh mount.
  const [presetToken, setPresetToken] = React.useState(0);
  const fieldsId = React.useId();

  const cloudinary = cloudinaryCost(usage);
  const cloud = openinaryCloudCost(usage);
  const selfHosted = selfHostedCost(usage);

  // Cloud against cloud. The comparison a visitor is here to make is against
  // the hosted product they already pay for, and self-hosting is the answer to
  // a different question, so it gets a line of its own further down rather
  // than a column competing for the headline.
  const savedPerMonth = cloudinary.monthlyUsd - cloud.monthlyUsd;
  const savedPercent =
    cloudinary.monthlyUsd > 0
      ? Math.round((savedPerMonth / cloudinary.monthlyUsd) * 100)
      : 0;
  const bothFree = cloudinary.monthlyUsd === 0 && cloud.monthlyUsd === 0;

  const selectPlan = (id: string) => {
    setPlanId(id);
    setUsage(usageForPlan(id));
    setPresetToken((token) => token + 1);
  };

  // Placed twice, once per column, because the two live in different grid
  // cells: at the foot of the controls on a wide screen, and after the numbers
  // and the small print on a narrow one, where the controls sit at the top and
  // a call to action halfway up the section would be asking before showing.
  // Only ever one of them is rendered.
  const startFree = (
    <CtaLink
      href="https://app.openinary.dev"
      target="_blank"
      rel="noopener noreferrer"
      data-track-event="cloud_cta_clicked"
      data-track-prop-location="calculator"
      className="w-full"
    >
      Try Cloud for free
    </CtaLink>
  );

  return (
    // Hairlines from the 1px gap over a border-coloured ground, matching the
    // playground and the feature grid, so the split reads as part of the page's
    // box structure rather than two floating panels.
    //
    // Controls first in the markup, which puts them on the left here and above
    // the numbers once the grid folds to one column. It also leaves the
    // disclaimer where it belongs on a phone: the last thing on the section.
    <div className="grid gap-px bg-border pt-px lg:grid-cols-[320px_1fr]">
      {/* Inputs */}
      <aside className={cn("flex flex-col gap-5 p-6 sm:p-8 lg:p-6", panelSurface)}>
        <div>
          <h3 className="text-sm font-medium">Your usage</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Start from what you pay Cloudinary today, then move the sliders to
            match what you actually use.
          </p>
        </div>

        <fieldset>
          <legend className="text-xs font-medium">Cloudinary plan</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => selectPlan(plan.id)}
                aria-pressed={planId === plan.id}
                className={cn(
                  fieldShell,
                  "px-2 py-1.5 text-left transition-all",
                  focusRing,
                  pressable,
                  planId === plan.id
                    ? "border-foreground"
                    : "hover:border-foreground/30",
                )}
              >
                <span className="block text-xs font-medium">{plan.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {usd(plan.monthlyUsd)}/mo
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={() => setDetailed((open) => !open)}
          aria-expanded={detailed}
          aria-controls={fieldsId}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-sm border-b border-border pb-2 text-xs font-medium transition-all lg:hidden",
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

        <div
          id={fieldsId}
          className={cn(
            "flex-col gap-5",
            detailed ? "flex" : "hidden lg:flex",
          )}
        >
          {fields.map((field) => (
            <UsageField
              key={`${field.key}-${presetToken}`}
              field={field}
              initial={usage[field.key]}
              onChange={(value) => {
                setPlanId(null);
                setUsage((current) => ({ ...current, [field.key]: value }));
              }}
            />
          ))}
        </div>

        <div className="mt-auto hidden lg:block">{startFree}</div>
      </aside>

      {/* Results */}
      <div className="flex flex-col bg-background">
        <div className="p-6 sm:px-6 sm:py-10">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
            Your monthly cost
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {savedPerMonth > 0 ? (
              <>
                You save {usd(savedPerMonth)}
                <span className="text-muted-foreground"> / month</span>
              </>
            ) : bothFree ? (
              "Both are free at this usage"
            ) : (
              // Cloudinary's free tier is generous enough to undercut us on a
              // small workload. Saying so beats quoting a negative saving.
              <>
                {usd(cloud.monthlyUsd)}
                <span className="text-muted-foreground">
                  {" "}
                  / month on Openinary Cloud
                </span>
              </>
            )}
          </p>
          {savedPerMonth > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {savedPercent}% less than Cloudinary, {usd(savedPerMonth * 36)} over
              three years.
            </p>
          )}
        </div>

        {/* Full bleed, so the hairlines run to both edges of the panel like
            every other rule on the page instead of stopping short in the
            padding. */}
        <div className="grid flex-1 border-y border-border bg-background sm:grid-cols-2">
          <Column name="Cloudinary" cost={cloudinary} tone="rival" />
          <Column name="Openinary Cloud" cost={cloud} highlighted />
        </div>

        {/* The third option and the small print, in one block. Running it
            yourself is cheaper in cash at almost any volume, which is exactly
            why it reads as a footnote: the sentence has to carry the part of
            the price that is not on the invoice. */}
        <p className="p-6 text-xs leading-relaxed text-muted-foreground">
          Rather run Openinary yourself? Roughly{" "}
          <span className="tabular-nums">
            {usdRough(selfHosted.monthlyUsd)}
          </span>
          /mo in servers, storage and bandwidth, plus your time. Every figure
          here is an estimate, not a quote, from public list prices checked on{" "}
          <time dateTime={lastCheckedOn}>
            {new Date(lastCheckedOn).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
          , and Openinary does not guarantee any saving.
        </p>

        <div className="px-6 pb-6 lg:hidden">{startFree}</div>
      </div>

    </div>
  );
}

/**
 * One usage number, as a slider with the figure spelled out next to it and a
 * way back to where the preset put it.
 *
 * `initial` is read once, at mount: the hook holds the value from then on. The
 * caller remounts on a new preset rather than feeding it back down.
 */
function UsageField({
  field,
  initial,
  onChange,
}: {
  field: (typeof fields)[number];
  initial: number;
  onChange: (value: number) => void;
}) {
  const { label, unit, max, step } = field;
  const inputId = React.useId();
  // Pinned at mount. The prop follows the value up as it is edited, so reading
  // it live would make "back to where it started" mean "back to where it is",
  // and the reset would never appear.
  const [startedAt] = React.useState(initial);
  const {
    sliderValue,
    inputValues,
    validateAndUpdateValue,
    handleInputChange,
    handleSliderChange,
    resetToDefault,
    showReset,
  } = useSliderWithInput({
    minValue: 0,
    maxValue: max,
    initialValue: [startedAt],
    defaultValue: [startedAt],
  });

  const commit = (raw: string) => onChange(validateAndUpdateValue(raw, 0));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-xs font-medium">
          {label}{" "}
          <span className="font-normal text-muted-foreground">{unit}</span>
        </Label>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`Reset ${label}`}
                // Hidden through the disabled state rather than a class of its
                // own: the button's disabled:opacity-50 carries a pseudo-class
                // and outweighs a plain opacity-0.
                className="size-6 opacity-100 transition-opacity disabled:opacity-0"
                disabled={!showReset}
                onClick={() => {
                  resetToDefault();
                  onChange(startedAt);
                }}
                size="icon"
                variant="ghost"
              >
                <RotateCcw aria-hidden size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              Back to {startedAt.toLocaleString("en-US")}
            </TooltipContent>
          </Tooltip>
          <Input
            className={cn(
              fieldShell,
              "h-7 w-20 px-2 py-0 text-right text-xs tabular-nums shadow-none",
            )}
            id={inputId}
            inputMode="numeric"
            onBlur={() => commit(inputValues[0] ?? "")}
            onChange={(event) => handleInputChange(event, 0)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(inputValues[0] ?? "");
            }}
            type="text"
            value={inputValues[0]}
          />
        </div>
      </div>
      <Slider
        aria-label={label}
        className={sliderThumb}
        max={max}
        min={0}
        onValueChange={(next) => {
          handleSliderChange(next);
          onChange(next[0]);
        }}
        step={step}
        value={sliderValue}
      />
    </div>
  );
}

function Column({
  name,
  cost,
  tone,
  highlighted = false,
}: {
  name: string;
  cost: Cost;
  tone?: "rival";
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-6 [&:not(:last-child)]:border-b sm:p-6 sm:[&:not(:last-child)]:border-b-0 sm:[&:not(:last-child)]:border-r",
        highlighted ? panelSurface : "bg-background",
      )}
    >
      <div>
        {/* No sr-only note on the highlight any more: it used to mark the
            cheapest column, and now it marks ours, which the name already
            says. */}
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {cost.planName ?? " "}
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
