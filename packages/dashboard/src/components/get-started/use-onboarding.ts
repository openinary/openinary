"use client";

import { useOpeninary } from "@openinary/ui";

import { useDashboard } from "../../adapter";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  /** What the button says while this is the step to do next. */
  action: string;
  /** For steps only the user's app can complete: what is being waited on. */
  waiting?: string;
  done: boolean;
}

/**
 * The onboarding checklist: three steps, all of them things the user's own app
 * does. Uploading a file here and playing with a playground are the dashboard
 * demonstrating the product, not an app having integrated it, so each app's
 * signals have to tell the two apart (see its useOnboardingSignals).
 *
 * A read-only account (a self-hosted viewer) can neither create an API key
 * nor upload, so it only gets the step it can do; Cloud is never read-only.
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
  const { readOnly } = useOpeninary();

  const allSteps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Connect your app",
      description:
        "Create an API key, then install the uploader and its secure signing route.",
      href: "/get-started/integrate",
      action: "Connect your app",
      done: hasKey ?? false,
    },
    {
      id: "upload",
      title: "Send your first upload",
      description: "From your own app, not from here.",
      href: "/get-started/integrate",
      action: "See how to upload",
      waiting: "Waiting for your first upload",
      done: hasUploaded ?? false,
    },
    {
      id: "deliver",
      title: "Serve it back",
      description: readOnly
        ? "Open a file's link, then add a transformation to it."
        : "Render the URL you stored, then add a transformation to it.",
      href: "/get-started/images",
      action: "Try a transformation",
      waiting: "Waiting for your first delivery",
      done: hasDelivered ?? false,
    },
  ];
  const steps = readOnly
    ? allSteps.filter((step) => step.id !== "connect" && step.id !== "upload")
    : allSteps;

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
