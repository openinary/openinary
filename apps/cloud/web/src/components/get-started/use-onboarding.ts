"use client";

import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * The onboarding checklist: three steps, all of them things the customer's own
 * app does. Uploading a file here and playing with a playground are worth
 * doing - they are what the rest of this page is for - but they are us
 * demonstrating the product, not the customer having integrated it, and while
 * they were steps the list said "2 of 4" to someone who had not written a line
 * of code.
 *
 * Which means every signal below has to tell the app apart from the dashboard,
 * because the dashboard can do all three:
 *
 * - `hasKey` is honest as it stands: nothing but a customer creating one makes
 *   an API key exist.
 * - `uploaded` is the meter's apiUpload flag, set only by POST /upload's
 *   presigned-token branch (worker/app.ts). Dropping a file into the
 *   dashboard's uploader takes the session branch and never sets it.
 * - `delivered` is cdn_requests, which only became a truthful signal once
 *   worker/index.ts started marking the dashboard's own fetches quiet
 *   (isDashboardTraffic). Before that, opening any asset in the media library
 *   billed one CDN request and ticked this step.
 *
 * All three are server-side and derived, so nothing here can disagree between
 * devices or go stale - the previous list ticked its transformation step out
 * of localStorage, which meant it also unticked itself on another machine.
 */
export function useOnboarding(): {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  isComplete: boolean;
  /** False until every source has answered - don't render a 0/3 flash. */
  isReady: boolean;
} {
  const usage = useQuery(orpc.usage.get.queryOptions());
  const apiKeys = useQuery(orpc.apiKey.list.queryOptions());
  const onboarding = useQuery(orpc.usage.onboarding.queryOptions());

  const hasKey = (apiKeys.data?.length ?? 0) > 0;
  const hasUploaded = onboarding.data?.uploaded ?? false;
  const hasDelivered = (usage.data?.features.cdn_requests.used ?? 0) > 0;

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Connect your app",
      description:
        "Create an API key, then install the uploader and its secure signing route.",
      href: "/get-started/integrate",
      done: hasKey,
    },
    {
      id: "upload",
      title: "Send your first upload",
      description: "From your own app, not from here.",
      href: "/get-started/integrate",
      done: hasUploaded,
    },
    {
      id: "deliver",
      title: "Serve it back",
      description:
        "Render the URL you stored, then add a transformation to it.",
      href: "/get-started/images",
      done: hasDelivered,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    isComplete: completed === steps.length,
    isReady: !!usage.data && !!apiKeys.data && !!onboarding.data,
  };
}
