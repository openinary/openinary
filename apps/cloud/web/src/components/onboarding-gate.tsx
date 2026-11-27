"use client";

import { useDocumentTitle } from "@openinary/dashboard";
import {
  FEATURES,
  formatAmount,
  formatOverage,
  PLANS,
  type PlanId,
  planOf,
  UPGRADE_PLAN,
} from "@openinary/plans";
import {
  Onboarding,
  type OnboardingAnswers,
  OnboardingBackdrop,
  type OnboardingPlan,
  type OnboardingStepId,
  rememberOnboarded,
} from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAccount } from "@/hooks/use-account";
import { useActiveBucket } from "@/hooks/use-active-bucket";
import {
  trackOnboardingStarted,
  trackOnboardingStepCompleted,
} from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";

/**
 * Where the questionnaire picks up after the plan step's checkout, which
 * leaves the page. Only a team's answers wait here: a solo account's plan
 * step is its last, so it is saved before the checkout opens.
 */
const RESUME_KEY = "openinary:onboarding-resume";

type Resume = { answers: OnboardingAnswers; step: OnboardingStepId };

function readResume(): Resume | undefined {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    return raw ? (JSON.parse(raw) as Resume) : undefined;
  } catch {
    return undefined;
  }
}

// "Storage" reads "storage", "CDN requests" keeps its capitals.
const lower = (label: string) =>
  label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());

/** The plan step's two cards: Free, and the plan an upgrade attaches. */
function planCard(id: PlanId, paid: boolean): OnboardingPlan {
  const plan = PLANS[id];
  return {
    id,
    name: plan.name,
    badge: plan.metered ? "Pay as you go" : undefined,
    price: `$${plan.monthlyUsd}`,
    priceNote: plan.metered ? "/ mo, then usage" : "forever",
    note: paid
      ? "Card required. Never blocked at a limit."
      : "No card needed. Stops at the limits.",
    paid,
    current: false,
    cta: paid ? UPGRADE_PLAN.cta : "Continue on Free",
    features: [
      plan.seats === 1
        ? "1 seat, just you"
        : `${plan.seats} seats, you and ${plan.seats - 1} teammates`,
      `${plan.buckets} ${plan.buckets === 1 ? "bucket" : "buckets"}`,
      ...FEATURES.map((feature) => {
        const amount = `${formatAmount(feature, feature.grants[id])} ${lower(feature.label)}`;
        if (plan.metered) return `${amount}, then ${formatOverage(feature)}`;
        return feature.resets ? `${amount} / mo` : amount;
      }),
    ],
  };
}

const PLAN_CARDS = [planCard("free", false), planCard(UPGRADE_PLAN.id, true)];

/**
 * Covers the dashboard with the first-run questionnaire until the account has
 * answered it (the flag lives in its UsageMeter, see usage.onboarding).
 * Rendered over the shell rather than instead of it, so accounts that are done
 * never wait on this request: it is the one the Get started checklist already
 * makes.
 *
 * Someone who joined a team (the session acts on another account) is only
 * asked about themselves. Everyone else picks "Just me" or "My team", then a
 * plan while on Free, and a team invites people last.
 *
 * Until the answer is known, a browser that never saw an onboarded account
 * (no `onboarded` cookie, read by the layout) gets the onboarding's sky, so a
 * first sign-in doesn't flash the dashboard before the questionnaire.
 */
export function OnboardingGate({ onboardedHint }: { onboardedHint: boolean }) {
  const user = authClient.useSession().data?.user;
  const state = useQuery(orpc.usage.onboarding.queryOptions());
  const { bucket, isLoading: bucketLoading } = useActiveBucket();
  const account = useAccount();
  const queryClient = useQueryClient();
  const router = useRouter();

  const onboarded = state.data?.onboarded;
  const joining =
    account.loaded && user && account.current && account.current !== user.id
      ? account.accounts.find((a) => a.accountId === account.current)
      : undefined;
  // The plan decides whether there is a plan step and how many people a team
  // can invite. Only read for someone who will see the questionnaire.
  const usage = useQuery({
    ...orpc.usage.get.queryOptions(),
    enabled: onboarded === false && account.loaded && !joining,
  });
  // Null when unknown: treated as Free, the plan every account starts on.
  const planId = usage.isError ? null : usage.data?.planId;
  const ready =
    !!user && !!bucket && account.loaded && (!!joining || planId !== undefined);
  const shown = ready && onboarded === false;
  useDocumentTitle(shown ? "Welcome" : null);
  useEffect(() => {
    if (shown) trackOnboardingStarted();
  }, [shown]);
  useEffect(() => {
    if (onboarded) rememberOnboarded();
  }, [onboarded]);
  if (!shown) {
    const loading =
      state.isPending || (onboarded === false && (!ready || bucketLoading));
    return loading && !onboardedHint ? <OnboardingBackdrop /> : null;
  }

  const onFreePlan = !planId || planId === "free";
  const resume = joining ? undefined : readResume();

  /** Everything but the checkout: profile, team or bucket, invites, answers. */
  const save = async (answers: OnboardingAnswers) => {
    const updated = await authClient.updateUser({
      name: answers.name,
      image: answers.image,
    });
    if (updated.error) throw new Error(updated.error.message);
    if (!joining) {
      if (answers.team) {
        await client.team.rename({ name: answers.teamName });
      } else if (answers.workspaceName !== bucket.name) {
        await client.bucket.rename({
          bucketId: bucket.id,
          name: answers.workspaceName,
        });
      }
    }
    // One at a time, so a refusal (seat limit, already a member) names the
    // address it is about. Re-sending the ones that went through is harmless.
    for (const invite of answers.invites) {
      try {
        await client.team.invite(invite);
      } catch (error) {
        throw new Error(
          `Could not invite ${invite.email}: ${error instanceof Error ? error.message : "try again"}`,
        );
      }
    }
    await client.usage.completeOnboarding({
      role: answers.role,
      useCases: answers.useCases,
      source: answers.source,
      team: joining ? undefined : answers.team,
    });
    localStorage.removeItem(RESUME_KEY);
    queryClient.invalidateQueries({ queryKey: orpc.bucket.list.key() });
    queryClient.invalidateQueries({ queryKey: orpc.team.overview.key() });
  };

  return (
    <Onboarding
      variant="cloud"
      user={user}
      workspace={{ name: bucket.name }}
      joining={
        joining && {
          name: joining.name,
          detail: `You join as ${joining.role === "admin" ? "an admin" : "a member"}.`,
        }
      }
      plans={onFreePlan && !joining ? PLAN_CARDS : undefined}
      seatLimit={planOf(planId).seats}
      resume={resume}
      onStepComplete={(step, index, answers, skipped) => {
        trackOnboardingStepCompleted({
          step: index,
          step_name: step,
          skipped,
          ...(step === "who" && { team: answers.team, role: answers.role }),
          ...(step === "profile" && { has_avatar: !!answers.image }),
          ...(step === "use_cases" && { use_cases: answers.useCases }),
          ...(step === "source" && { source: answers.source }),
        });
      }}
      onUpgrade={async (answers, next) => {
        if (next) {
          localStorage.setItem(
            RESUME_KEY,
            JSON.stringify({ answers, step: next } satisfies Resume),
          );
        } else {
          await save(answers);
        }
        const { paymentUrl } = await client.billing.checkout({
          returnTo: "get-started",
        });
        window.location.href = paymentUrl ?? "/get-started";
      }}
      onComplete={async (answers) => {
        await save(answers);
        router.push("/get-started");
        queryClient.setQueryData(
          orpc.usage.onboarding.queryKey(),
          (current) => current && { ...current, onboarded: true },
        );
      }}
    />
  );
}
