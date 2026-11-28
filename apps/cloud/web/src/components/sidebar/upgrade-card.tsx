"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "skullet/react";

import { useHydrated, useOnboarding } from "@openinary/dashboard";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import {
  UploaderNudge,
  useUploaderNudge,
} from "@/components/sidebar/uploader-nudge";
import { Button } from "@openinary/dashboard/ui/button";
import { isMeteredPlan, usageRatio } from "@/lib/usage";
import { PLANS, UPGRADE_PLAN } from "@openinary/plans";
import { orpc } from "@/utils/orpc";

/**
 * How much of the Free allowance has to be spent before the upsell gets a
 * whole card. Under it, an account that has finished onboarding but barely
 * used anything is shown a single quiet button instead: the offer is there
 * without a pitch for a limit they are nowhere near.
 */
const UPSELL_AT = 0.35;

const PAID = PLANS[UPGRADE_PLAN.id];
const UPSELL_COPY = `$${PAID.monthlyUsd} minimum usage, which includes $${PAID.creditUsd} of usage every month. After that, nothing stops: you only pay for extra usage.`;

/**
 * One slot above the user menu, four states in sequence:
 *
 *   1. onboarding incomplete  ->  the checklist
 *   2. past UPSELL_AT         ->  the full Free -> Pay as you go card
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
 */
export function UpgradeCard() {
  const { isReady } = useOnboarding();
  // Client-only, so the skeleton can recall its last shape (useHydrated).
  if (!useHydrated()) return null;

  // Mounted from the first paint, in all four states: skullet remembers which
  // one it last showed under this id, so the slot holds that card's exact
  // height (or none) while the checklist loads, instead of popping one in.
  return (
    <Skeleton
      id="upgrade-card"
      loading={!isReady}
      label="Loading"
      className="px-3 group-data-[collapsible=icon]:hidden"
    >
      <UpgradeCardContent />
    </Skeleton>
  );
}

function UpgradeCardContent() {
  const { data } = useQuery(orpc.usage.get.queryOptions());
  const setSettingsTab = useSettingsPage();
  const { isComplete, isReady } = useOnboarding();
  const [nudgeDismissed, dismissNudge] = useUploaderNudge();

  // Setup has its own guide in the top bar: the upsell waits until it is
  // done, and until it can be judged (usage.get answers before isReady).
  if (!isReady || !isComplete) return null;

  // The usage payload, but only on Free. planId is null without a
  // subscription, "free" with one - both are Free. Kept as the object rather
  // than a boolean so the reads below stay narrowed.
  const free = data && !isMeteredPlan(data.planId) ? data : null;

  if (free && usageRatio(free.features) >= UPSELL_AT) {
    return (
      <div
        className="mb-2 rounded-[10px] bg-(--ds-raised) shadow-(--ds-raised-shadow) p-3"
      >
        <p className="font-medium text-sm">Raise your limits</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          {UPSELL_COPY}
        </p>
        <Button
          size="sm"
          className="mt-3 h-7 w-full text-xs"
          onClick={() => setSettingsTab("billing")}
        >
          {UPGRADE_PLAN.cta}
        </Button>
      </div>
    );
  }

  if (!nudgeDismissed) return <UploaderNudge onDismiss={dismissNudge} />;

  // State 4 is the Upgrade button on the plan row (nav-plan.tsx).
  return null;
}
