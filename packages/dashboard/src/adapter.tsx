"use client";

import { createContext, useContext } from "react";

export type PlaygroundSurface = "images" | "videos";
/** Whether the user was playing with our demo media or their own file. */
export type PlaygroundAssetKind = "demo" | "own";

/** Product analytics events. Cloud sends them to PostHog. */
export interface DashboardAnalytics {
  playgroundOpened: (surface: PlaygroundSurface) => void;
  playgroundTransformApplied: (props: {
    surface: PlaygroundSurface;
    op: string;
    value: string;
    asset: PlaygroundAssetKind;
  }) => void;
  playgroundUrlCopied: (props: {
    surface: PlaygroundSurface;
    op: string;
    asset: PlaygroundAssetKind;
  }) => void;
  integrationPromptCopied: (variant: "ai") => void;
  integrationDocsOpened: (variant: "nextjs" | "react") => void;
}

/**
 * Everything the dashboard needs that differs between self-hosted and Cloud.
 *
 * Navigation and URL state come in from the app because the two apps run
 * different Next.js majors (and so different nuqs builds): a source-only
 * package resolving its own `next` or `nuqs` would hand each app a router or
 * adapter context from the wrong copy.
 */
export interface DashboardAdapter {
  Link: React.ComponentType<React.ComponentProps<"a"> & { href: string }>;
  useRouter: () => { push: (href: string) => void; back: () => void; forward: () => void };
  usePathname: () => string;
  /** A search param as shallow state (nuqs's useQueryState in both apps). */
  useSearchParam: (
    key: "asset" | "folder" | "upload",
  ) => [string | null, (value: string | null) => unknown];
  /** next/navigation's notFound. */
  notFound: () => never;

  /** What holds the user's files, as prose: "storage" or "bucket". */
  storageNoun: "storage" | "bucket";
  /** Where the empty library's Documentation link goes. */
  docsUrl: string;
  /** Whether the account has an API key: undefined while it loads. */
  useHasApiKey: () => boolean | undefined;
  /**
   * Whether this user may open the API keys page. Cloud teams hide it from
   * members; omitted, everyone can (self-hosted has one user).
   */
  useCanManageApiKeys?: () => boolean;
  /** The checklist's other two signals: undefined while they load. */
  useOnboardingSignals: () => {
    hasUploaded: boolean | undefined;
    hasDelivered: boolean | undefined;
  };
  /** The Integrate page's agent prompt with absolute URLs, null until they are known. */
  useAiPrompt: () => string | null;
  /** The same prompt over placeholder values, the shape its skeleton draws. */
  aiPromptSample: string;
  analytics?: DashboardAnalytics;
}

const DashboardContext = createContext<DashboardAdapter | null>(null);

export function DashboardProvider({
  adapter,
  children,
}: {
  adapter: DashboardAdapter;
  children: React.ReactNode;
}) {
  return <DashboardContext.Provider value={adapter}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardAdapter {
  const adapter = useContext(DashboardContext);
  if (!adapter) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return adapter;
}

const always = () => true;

/** useCanManageApiKeys with its default, safe to call as a hook. */
export function useCanManageApiKeys(): boolean {
  return (useDashboard().useCanManageApiKeys ?? always)();
}
