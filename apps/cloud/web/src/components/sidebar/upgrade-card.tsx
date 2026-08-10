"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import { useSettingsDialog } from "@/components/settings-dialog";
import {
  UploaderNudge,
  useUploaderNudge,
} from "@/components/sidebar/uploader-nudge";
import { Button } from "@/components/ui/button";
import { CLOUD_AVAILABLE, isMeteredPlan, usageRatio } from "@/lib/usage";
import { cn, FADE_IN } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

/**
 * How much of the Free allowance has to be spent before the upsell gets a
 * whole card. Under it, an account that has finished onboarding but barely
 * used anything is shown a single quiet button instead: the offer is there
 * without a pitch for a limit they are nowhere near.
 */
const UPSELL_AT = 0.35;

/**
 * One slot above the user menu, four states in sequence:
 *
 *   1. onboarding incomplete  ->  the checklist
 *   2. past UPSELL_AT         ->  the full Free -> Alpha card
 *   3. nudge not dismissed    ->  the FileUploader card
 *   4. done, usage still low  ->  one outline button, no pitch
 *
 * Read as priority, not as a timeline: the upsell outranks the nudge because a
 * limit in sight is the more urgent thing to say, and every state is one card
 * so the footer can never stack two.
 *
 * The point of the last state is that (1) and (2) are far apart in time. Going
 * straight from the checklist to a card about doubling limits sells against a
 * ceiling the account cannot see yet; showing nothing at all instead hides
 * that paying is even an option.
 *
 * (3) used to fill most of that gap, back when finishing the checklist meant
 * having uploaded by hand and the uploader was the thing that would get their
 * app doing it instead. The checklist no longer completes until the account's
 * own app has uploaded, so almost everyone who reaches (3) has already
 * installed what it pitches - all it still catches is the account that got
 * there with a hand-rolled POST rather than the component.
 *
 * The upsell copy is specific to Alpha ("double the Free allowance"), so it
 * stays hidden while Cloud is on sale - that's a different offer at a
 * different price and needs its own card.
 */
export function UpgradeCard() {
  const { data } = useQuery(orpc.usage.get.queryOptions());
  const [, setSettingsTab] = useSettingsDialog();
  const { completed, total, isComplete, isReady } = useOnboarding();
  const [nudgeDismissed, dismissNudge] = useUploaderNudge();

  // Nothing at all until the checklist can be judged. usage.get answers well
  // before isReady does (which also waits on the API keys and the bucket
  // listing), so returning the upsell in the meantime showed "Double your
  // limits" for a beat and then swapped it for "Get started".
  if (!isReady) return null;

  if (!isComplete) {
    return (
      <Link
        href="/get-started"
        className={cn(
          "mb-1 block rounded-lg border bg-sidebar-accent/40 p-3 transition-colors hover:bg-sidebar-accent/70 group-data-[collapsible=icon]:hidden",
          FADE_IN,
        )}
      >
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Get started</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {completed}/{total}
          </p>
        </div>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          Connect your app, send us a file, then show it anywhere.
        </p>
        {/* Segments rather than a bar: three discrete steps, and it stays
            readable at the sidebar's width without a label per step. */}
        <div className="mt-3 flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={`step-${i + 1}`}
              className={`h-1 flex-1 rounded-full ${
                i < completed ? "bg-primary" : "bg-primary/15"
              }`}
            />
          ))}
        </div>
      </Link>
    );
  }

  // The usage payload, but only when this account is one the Alpha pitch is
  // for. planId is null without a subscription, "free" with one - both are
  // Free. Kept as the object rather than a boolean so the reads below stay
  // narrowed.
  const free =
    !CLOUD_AVAILABLE && data && !isMeteredPlan(data.planId) ? data : null;

  if (free && usageRatio(free.features) >= UPSELL_AT) {
    return (
      <div
        className={cn(
          "mb-1 rounded-lg border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden",
          FADE_IN,
        )}
      >
        <p className="font-medium text-sm">Double your limits</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          Alpha includes twice the Free allowance. Past it, nothing stops - you
          only pay for what you use.
        </p>
        <Button
          size="sm"
          className="mt-3 h-7 w-full text-xs"
          onClick={() => setSettingsTab("plan")}
        >
          Upgrade to Alpha
        </Button>
      </div>
    );
  }

  if (!nudgeDismissed) return <UploaderNudge onDismiss={dismissNudge} />;

  if (!free) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "mb-1 h-7 w-full text-xs group-data-[collapsible=icon]:hidden",
        FADE_IN,
      )}
      onClick={() => setSettingsTab("plan")}
    >
      Enable pay as you go
    </Button>
  );
}
