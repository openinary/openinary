"use client";

import { useDashboard } from "../../adapter";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * The onboarding checklist: three steps, all of them things the user's own app
 * does. Uploading a file here and playing with a playground are the dashboard
 * demonstrating the product, not an app having integrated it, so each app's
 * signals have to tell the two apart (see its useOnboardingSignals).
 */
export function useOnboarding(): {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  isComplete: boolean;
  /** False until every source has answered - don't render a 0/3 flash. */
  isReady: boolean;
} {
  const { useHasApiKey, useOnboardingSignals } = useDashboard();
  const hasKey = useHasApiKey();
  const { hasUploaded, hasDelivered } = useOnboardingSignals();

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Connect your app",
      description:
        "Create an API key, then install the uploader and its secure signing route.",
      href: "/get-started/integrate",
      done: hasKey ?? false,
    },
    {
      id: "upload",
      title: "Send your first upload",
      description: "From your own app, not from here.",
      href: "/get-started/integrate",
      done: hasUploaded ?? false,
    },
    {
      id: "deliver",
      title: "Serve it back",
      description:
        "Render the URL you stored, then add a transformation to it.",
      href: "/get-started/images",
      done: hasDelivered ?? false,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    isComplete: completed === steps.length,
    isReady:
      hasKey !== undefined &&
      hasUploaded !== undefined &&
      hasDelivered !== undefined,
  };
}
