"use client";

import type { MediaFile } from "@openinary/ui";
import { usePathname, useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import posthog from "posthog-js";
import { Suspense, useEffect, useRef } from "react";

import { DashboardOpeninaryProvider } from "@/components/dashboard-openinary-provider";
import { SettingsDialog } from "@/components/settings-dialog";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { BucketSwitchProvider } from "@/components/sidebar/bucket-switch-context";
import SignInForm from "@/components/sign-in-form";
import { SupportWidget } from "@/components/support";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

const ASSETS_ROUTE = "/";

function ShellContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Shares the "asset" key with AssetsView's own useQueryState, so selecting a
  // file in the sidebar tree opens the details panel there.
  const [, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true }),
  );

  // On the assets route this stays a shallow nuqs update - a router.push would
  // re-render the page subtree and remount the (virtualised, scrolled) grid.
  // Anywhere else there is no details panel to open, so it has to navigate.
  const handleMediaSelect = (media: MediaFile) => {
    if (pathname === ASSETS_ROUTE) {
      setAssetId(media.id);
    } else {
      router.push(`${ASSETS_ROUTE}?asset=${encodeURIComponent(media.id)}`);
    }
  };

  return (
    <>
      {/* Lives here rather than in a page: every route can deep-link the
          dialog through ?settings=..., and /get-started/integrate does. */}
      <SettingsDialog />
      <AppSidebar onMediaSelect={handleMediaSelect} />
      <SidebarInset>{children}</SidebarInset>
    </>
  );
}

/**
 * The signed-in shell every route under app/(app) renders inside: session
 * gate, providers, sidebar. Pages supply only what goes in the inset.
 *
 * The session check is client-side because auth lives on a separate origin
 * (NEXT_PUBLIC_SERVER_URL) whose cookie isn't guaranteed to reach this
 * Next.js server. Nothing but a spinner renders until the session is known,
 * and every data endpoint independently re-checks auth on the API server.
 */
export function AppShell({
  sidebarDefaultOpen,
  children,
}: {
  sidebarDefaultOpen: boolean;
  children: React.ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();
  // While signed out `data` stays null, and Better Auth reports isPending as
  // "no data yet" - so every refetch (window focus, reconnect, another tab)
  // flips it back to true. Showing the spinner again would unmount SignInForm
  // and throw away a half-finished OTP step, so only the first check - the one
  // where the session genuinely isn't known yet - gets one.
  const sessionKnown = useRef(false);
  if (!isPending) sessionKnown.current = true;

  // Ties the browser's anonymous journey (marketing site included, via the
  // shared .openinary.dev cookie) to the account. Same id the server uses
  // for cloud_account_created / asset_uploaded, so funnels line up.
  const user = session?.user;
  useEffect(() => {
    if (user) {
      posthog.identify(user.id, { email: user.email, name: user.name });
    }
  }, [user]);

  if (isPending && !sessionKnown.current) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return <SignInForm />;
  }

  return (
    <>
      <DashboardOpeninaryProvider>
        <SidebarProvider defaultOpen={sidebarDefaultOpen}>
          <BucketSwitchProvider>
            <Suspense
              fallback={
                <div className="flex h-screen w-full items-center justify-center bg-background">
                  <Spinner />
                </div>
              }
            >
              <ShellContent>{children}</ShellContent>
            </Suspense>
          </BucketSwitchProvider>
        </SidebarProvider>
      </DashboardOpeninaryProvider>
      {/* Outside DashboardOpeninaryProvider on purpose: that one renders null
          until the bucket list lands, and support shouldn't wait on it. */}
      <SupportWidget />
    </>
  );
}
