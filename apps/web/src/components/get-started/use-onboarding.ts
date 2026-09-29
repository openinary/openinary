"use client";

import { useOpeninary } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

/** Shared with the Integrate page, which only needs to know if one exists. */
export function useHasApiKey() {
  return useQuery({
    queryKey: ["openinary", "api-keys", "any"],
    queryFn: async () => {
      const result = await authClient.apiKey.list();
      if (result.error) throw new Error(result.error.message);
      const keys = Array.isArray(result.data)
        ? result.data
        : ((result.data as { apiKeys?: unknown[] } | null)?.apiKeys ?? []);
      return keys.length > 0;
    },
  });
}

/**
 * The onboarding checklist: three steps, all of them things your own app does.
 * Uploading a file here and playing with a playground are worth doing, but
 * they are the dashboard demonstrating the product, not an app having
 * integrated it - so every signal below has to tell the two apart:
 *
 * - `hasKey`: nothing but someone creating one makes an API key exist.
 * - `uploaded`: set by the API on the first upload that came with an API key
 *   or a presigned signature. The dashboard uploads with the session cookie
 *   and never sets it.
 * - `delivered`: the delivery log holds a successful line, and the log skips
 *   the dashboard's own requests.
 *
 * All three are server-side and derived, so nothing here can disagree between
 * devices.
 */
export function useOnboarding(): {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  isComplete: boolean;
  /** False until every source has answered - don't render a 0/3 flash. */
  isReady: boolean;
} {
  const { apiBaseUrl, fetch } = useOpeninary();
  const hasKey = useHasApiKey();
  const onboarding = useQuery({
    queryKey: ["openinary", "onboarding", apiBaseUrl],
    queryFn: async (): Promise<{ uploaded: boolean; delivered: boolean }> => {
      const res = await fetch(`${apiBaseUrl}/activity/onboarding`);
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      return res.json();
    },
  });

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Connect your app",
      description:
        "Create an API key, then install the uploader and its secure signing route.",
      href: "/get-started/integrate",
      done: hasKey.data ?? false,
    },
    {
      id: "upload",
      title: "Send your first upload",
      description: "From your own app, not from here.",
      href: "/get-started/integrate",
      done: onboarding.data?.uploaded ?? false,
    },
    {
      id: "deliver",
      title: "Serve it back",
      description:
        "Render the URL you stored, then add a transformation to it.",
      href: "/get-started/images",
      done: onboarding.data?.delivered ?? false,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    isComplete: completed === steps.length,
    isReady: hasKey.data !== undefined && !!onboarding.data,
  };
}
