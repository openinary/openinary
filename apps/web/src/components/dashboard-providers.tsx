"use client";

import {
  type DashboardAdapter,
  DashboardProvider,
  useDeliveryBase,
} from "@openinary/dashboard";
import { useOpeninary } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { notFound, usePathname, useRouter } from "next/navigation";
import { useQueryState } from "nuqs";

import { aiPrompt } from "@/components/get-started/integration-snippets";
import { authClient } from "@/lib/auth-client";
import { toAbsoluteUrl } from "@/lib/utils";

/** Nothing but someone creating one makes an API key exist. */
function useHasApiKey() {
  return useQuery({
    queryKey: ["openinary", "api-keys", "any"],
    queryFn: async () => {
      const result = await authClient.apiKey.list();
      if (result.error) throw new Error(result.error.message);
      return result.data.apiKeys.length > 0;
    },
  }).data;
}

/**
 * The checklist's other signals, each one something only the user's own app
 * can cause:
 *
 * - `hasUploaded`: set by the API on the first upload that came with an API
 *   key or a presigned signature. The dashboard uploads with the session
 *   cookie and never sets it.
 * - `hasDelivered`: the delivery log holds a successful line, and the log
 *   skips the dashboard's own requests.
 */
function useOnboardingSignals() {
  const { apiBaseUrl, fetch } = useOpeninary();
  const onboarding = useQuery({
    queryKey: ["openinary", "onboarding", apiBaseUrl],
    queryFn: async (): Promise<{ uploaded: boolean; delivered: boolean }> => {
      const res = await fetch(`${apiBaseUrl}/activity/onboarding`);
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      return res.json();
    },
  });

  return {
    hasUploaded: onboarding.data?.uploaded,
    hasDelivered: onboarding.data?.delivered,
  };
}

function useAiPrompt() {
  const { apiBaseUrl } = useOpeninary();
  const deliveryBase = useDeliveryBase();
  return deliveryBase
    ? aiPrompt({ apiBaseUrl: toAbsoluteUrl(apiBaseUrl), deliveryBase })
    : null;
}

const adapter: DashboardAdapter = {
  Link,
  useRouter,
  usePathname,
  useSearchParam: (key) => useQueryState(key),
  notFound,
  storageNoun: "storage",
  docsUrl: "https://docs.openinary.dev/",
  useHasApiKey,
  useOnboardingSignals,
  useAiPrompt,
  aiPromptSample: aiPrompt({
    apiBaseUrl: "https://media.example.com/api",
    deliveryBase: "https://media.example.com",
  }),
};

export function WebDashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardProvider adapter={adapter}>{children}</DashboardProvider>;
}
