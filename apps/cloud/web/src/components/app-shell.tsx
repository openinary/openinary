"use client";

import type { MediaFile } from "@openinary/ui";
import { usePathname, useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import posthog from "posthog-js";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DashboardOpeninaryProvider } from "@/components/dashboard-openinary-provider";
import { OnboardingGate } from "@/components/onboarding-gate";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { BucketSwitchProvider } from "@/components/sidebar/bucket-switch-context";
import SignInForm from "@/components/sign-in-form";
import { SupportWidget } from "@/components/support";
import { Button } from "@/components/ui/button";
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
      <AppSidebar onMediaSelect={handleMediaSelect} />
      <SidebarInset>{children}</SidebarInset>
    </>
  );
}

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL;

/**
 * Shown while the admin panel has this browser signed in as a customer
 * (support). Stopping hands the admin's own session back and returns to that
 * customer's page in the panel, which stays locked until then.
 */
function ImpersonationBanner({
  user,
}: {
  user: { id: string; email: string };
}) {
  const [stopping, setStopping] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border bg-background py-1.5 pr-1.5 pl-3.5 text-sm shadow-lg">
      <span className="truncate">
        Viewing as <span className="font-medium">{user.email}</span>
      </span>
      <Button
        size="sm"
        variant="destructive"
        disabled={stopping}
        onClick={async () => {
          setStopping(true);
          const { error } = await authClient.admin.stopImpersonating();
          if (error) {
            setStopping(false);
            toast.error(error.message ?? "Could not stop impersonating");
            return;
          }
          window.location.assign(
            ADMIN_URL ? `${ADMIN_URL}/users/${user.id}` : "/",
          );
        }}
      >
        Stop impersonating
      </Button>
    </div>
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
  //
  // Not while impersonating: that is the admin's browser, and identifying it
  // as the customer would merge the admin's journey into theirs. Events keep
  // landing on the admin's own id instead.
  const user = session?.user;
  const impersonating = Boolean(session?.session.impersonatedBy);
  useEffect(() => {
    if (user && !impersonating) {
      posthog.identify(user.id, { email: user.email, name: user.name });
    }
  }, [user, impersonating]);

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
            {/* Answering it would write the admin's answers onto the
                customer's profile and bucket. */}
            {impersonating ? null : <OnboardingGate />}
          </BucketSwitchProvider>
        </SidebarProvider>
      </DashboardOpeninaryProvider>
      {/* Outside DashboardOpeninaryProvider on purpose: that one renders null
          until the bucket list lands, and support shouldn't wait on it.
          Swapped for the banner while impersonating: identifying the admin's
          browser as the customer would tie the two in the support inbox. */}
      {impersonating ? (
        <ImpersonationBanner user={session.user} />
      ) : (
        <SupportWidget />
      )}
    </>
  );
}
