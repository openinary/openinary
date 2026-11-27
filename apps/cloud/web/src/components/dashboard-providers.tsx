"use client";

import { type DashboardAdapter, DashboardProvider } from "@openinary/dashboard";
import { OpeninaryProvider } from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { notFound, usePathname, useRouter } from "next/navigation";
import { useQueryState } from "nuqs";

import {
  agentSetupPrompt,
  aiPrompt,
} from "@/components/get-started/integration-snippets";
import { useAccount } from "@/hooks/use-account";
import { useActiveBucket } from "@/hooks/use-active-bucket";
import { dashboardAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";

export const FILE_UPLOADER_DOCS =
  "https://docs.openinary.dev/cloud/file-uploader";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL!;
const deliveryBaseOf = (bucketId: string) => `${SERVER_URL}/b/${bucketId}`;

/**
 * The dashboard reads through apiBaseUrl (session-gated /storage, /upload,
 * /download) and delivers through transformBaseUrl: the "Asset URL" field and
 * every thumbnail. Delivery is the public /b/{activeBucketId} route (see
 * apps/cloud/server), the URL that works when embedded on a customer's own
 * site; there is no /t at the server root. Base is "/b/{id}", not "/t/{id}":
 * @openinary/ui appends its own "/t/{params}/{path}".
 *
 * Until the bucket is known (and while signed out, where the bucket list would
 * only 401) transformBaseUrl is null, and @openinary/ui builds nothing on it.
 */
export function CloudOpeninaryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const signedIn = !!authClient.useSession().data;
  const { bucket } = useActiveBucket({ enabled: signedIn });

  return (
    <OpeninaryProvider
      apiBaseUrl={SERVER_URL}
      transformBaseUrl={bucket ? deliveryBaseOf(bucket.id) : null}
    >
      {children}
    </OpeninaryProvider>
  );
}

/** Team members (Cloud teams) can't open the API keys page. */
function useCanManageApiKeys() {
  return useAccount().can("apiKey.manage");
}

/** Nothing but a customer creating one makes an API key exist. */
function useHasApiKey() {
  // Members can't list keys (the server would answer 403); the step stays open.
  const canListKeys = useAccount().can("apiKey.manage");
  const apiKeys = useQuery({
    ...orpc.apiKey.list.queryOptions(),
    enabled: canListKeys,
  });
  return apiKeys.data && apiKeys.data.length > 0;
}

/**
 * The checklist's other signals, each one something only the customer's own
 * app can cause, since the dashboard can do both:
 *
 * - `hasUploaded` is the meter's apiUpload flag, set only by POST /upload's
 *   presigned-token branch (apps/cloud/server/worker/app.ts). Dropping a file
 *   into the dashboard's uploader takes the session branch and never sets it.
 * - `hasDelivered` is cdn_requests, which only became a truthful signal once
 *   apps/cloud/server/worker/index.ts started marking the dashboard's own
 *   fetches quiet (isDashboardTraffic). Before that, opening any asset in the
 *   media library billed one CDN request and ticked this step.
 *
 * Both are server-side and derived, so nothing here can disagree between
 * devices or go stale.
 */
function useOnboardingSignals() {
  const usage = useQuery(orpc.usage.get.queryOptions());
  // The checklist is waiting on the user's own app: look again every few
  // seconds until the first upload lands, so the step ticks while they watch.
  const onboarding = useQuery({
    ...orpc.usage.onboarding.queryOptions(),
    refetchInterval: ({ state }) => (state.data?.uploaded ? false : 4000),
  });

  return {
    hasUploaded: onboarding.data?.uploaded,
    hasDelivered: usage.data && usage.data.features.cdn_requests.used > 0,
  };
}

/**
 * The agents connected through the MCP server. Polled while there are none,
 * so the Home switches to "connected" the moment the person clicks Allow.
 */
function useConnectedAgents() {
  const queryClient = useQueryClient();
  const agents = useQuery({
    ...orpc.agent.list.queryOptions(),
    refetchInterval: ({ state }) => (state.data?.length ? false : 4000),
  });
  return {
    agents: agents.data,
    disconnect: async (clientId: string) => {
      await client.agent.disconnect({ clientId });
      await queryClient.invalidateQueries({
        queryKey: orpc.agent.list.key(),
      });
    },
  };
}

function useAiPrompt() {
  const { bucket } = useActiveBucket();
  return bucket
    ? aiPrompt({
        apiBaseUrl: SERVER_URL,
        deliveryBase: deliveryBaseOf(bucket.id),
        bucketId: bucket.id,
      })
    : null;
}

const adapter: DashboardAdapter = {
  Link,
  useRouter,
  usePathname,
  useSearchParam: (key) => useQueryState(key),
  notFound,
  useWorkspaceName: () => useActiveBucket().bucket?.name ?? null,
  storageNoun: "bucket",
  docsUrl: "https://docs.openinary.dev/cloud/overview",
  useHasApiKey,
  useCanManageApiKeys,
  useOnboardingSignals,
  useAiPrompt,
  aiPromptSample: aiPrompt({
    apiBaseUrl: "https://api.openinary.dev",
    deliveryBase: "https://api.openinary.dev/b/bucket",
    bucketId: "bucket",
  }),
  agentSetupPrompt,
  useConnectedAgents,
  analytics: dashboardAnalytics,
};

export function CloudDashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardProvider adapter={adapter}>{children}</DashboardProvider>;
}
