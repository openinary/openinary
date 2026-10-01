"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import {
  UploaderNudge,
  useUploaderNudge,
} from "@/components/sidebar/uploader-nudge";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
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
 *   4. done, usage still low  ->  nothing here, Upgrade sits on the plan row
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
  const setSettingsTab = useSettingsPage();
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
          "flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 shadow-xs transition-colors hover:bg-accent",
          FADE_IN,
        )}
      >
        <CircularProgress
          value={(completed / total) * 100}
          size={16}
          thickness={2}
          className="shrink-0 text-primary"
        />
        <p className="flex-1 truncate font-medium text-sm">Getting started</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {completed} of {total}
        </p>
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
          "rounded-lg border bg-background p-3 shadow-xs",
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
          onClick={() => setSettingsTab("billing")}
        >
          Upgrade to Alpha
        </Button>
      </div>
    );
  }

  if (!nudgeDismissed) return <UploaderNudge onDismiss={dismissNudge} />;

  // State 4 is the Upgrade button on the plan row (nav-plan.tsx).
  return null;
}
