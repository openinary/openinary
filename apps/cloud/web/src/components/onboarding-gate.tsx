"use client";

import {
  Onboarding,
  OnboardingBackdrop,
  rememberOnboarded,
} from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useActiveBucket } from "@/hooks/use-active-bucket";
import {
  trackOnboardingStarted,
  trackOnboardingStepCompleted,
} from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";

/**
 * Covers the dashboard with the first-run questionnaire until the account has
 * answered it (the flag lives in its UsageMeter, see usage.onboarding).
 * Rendered over the shell rather than instead of it, so accounts that are done
 * never wait on this request: it is the one the Get started checklist already
 * makes.
 *
 * Until the answer is known, a browser that never saw an onboarded account
 * (no `onboarded` cookie, read by the layout) gets the onboarding's sky, so a
 * first sign-in doesn't flash the dashboard before the questionnaire.
 */
export function OnboardingGate({ onboardedHint }: { onboardedHint: boolean }) {
  const user = authClient.useSession().data?.user;
  const state = useQuery(orpc.usage.onboarding.queryOptions());
  const { bucket, isLoading: bucketLoading } = useActiveBucket();
  const queryClient = useQueryClient();
  const router = useRouter();

  const onboarded = state.data?.onboarded;
  const shown = !!user && !!bucket && onboarded === false;
  useEffect(() => {
    if (shown) trackOnboardingStarted();
  }, [shown]);
  useEffect(() => {
    if (onboarded) rememberOnboarded();
  }, [onboarded]);
  if (!shown) {
    const loading =
      state.isPending || (onboarded === false && !bucket && bucketLoading);
    return loading && !onboardedHint ? <OnboardingBackdrop /> : null;
  }

  return (
    <Onboarding
      variant="cloud"
      user={user}
      workspace={{ name: bucket.name }}
      onStepComplete={(step, answers, skipped) => {
        if (step === 0) {
          trackOnboardingStepCompleted({
            step,
            step_name: "profile",
            skipped,
            role: answers.role,
            has_avatar: !!answers.image,
          });
        } else if (step === 1) {
          trackOnboardingStepCompleted({
            step,
            step_name: "bucket",
            skipped,
            bucket_renamed: answers.workspaceName.trim() !== bucket.name,
            has_description: !!answers.workspaceDescription.trim(),
          });
        } else if (step === 2) {
          trackOnboardingStepCompleted({
            step,
            step_name: "use_cases",
            skipped,
            use_cases: answers.useCases,
          });
        } else {
          trackOnboardingStepCompleted({
            step: 3,
            step_name: "source",
            skipped,
            source: answers.source,
          });
        }
      }}
      onComplete={async (answers) => {
        const updated = await authClient.updateUser({
          name: answers.name,
          image: answers.image,
        });
        if (updated.error) throw new Error(updated.error.message);
        if (answers.workspaceName !== bucket.name) {
          await client.bucket.rename({
            bucketId: bucket.id,
            name: answers.workspaceName,
          });
        }
        await client.usage.completeOnboarding({
          role: answers.role,
          useCases: answers.useCases,
          source: answers.source,
          bucketDescription: answers.workspaceDescription,
        });

        router.push("/get-started");
        queryClient.invalidateQueries({ queryKey: orpc.bucket.list.key() });
        queryClient.setQueryData(
          orpc.usage.onboarding.queryKey(),
          (current) => current && { ...current, onboarded: true },
        );
      }}
    />
  );
}
