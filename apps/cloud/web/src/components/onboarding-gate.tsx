"use client";

import { Onboarding } from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BucketAvatar } from "@/components/bucket-avatar";
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
 */
export function OnboardingGate() {
  const user = authClient.useSession().data?.user;
  const state = useQuery(orpc.usage.onboarding.queryOptions());
  const buckets = useQuery(orpc.bucket.list.queryOptions());
  const queryClient = useQueryClient();
  const router = useRouter();

  const bucket = buckets.data?.find((b) => b.active) ?? buckets.data?.[0];
  const shown = !!user && !!bucket && state.data?.onboarded === false;
  useEffect(() => {
    if (shown) trackOnboardingStarted();
  }, [shown]);
  if (!shown) return null;

  return (
    <Onboarding
      variant="cloud"
      user={user}
      workspace={{ name: bucket.name }}
      workspaceMark={<BucketAvatar id={bucket.id} size={24} />}
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
