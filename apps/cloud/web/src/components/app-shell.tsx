"use client";

import { ShellInset } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { SidebarProvider } from "@openinary/dashboard/ui/sidebar";
import posthog from "posthog-js";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CloudDashboardProvider } from "@/components/dashboard-providers";
import { OnboardingGate } from "@/components/onboarding-gate";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { BucketSwitchProvider } from "@/components/sidebar/bucket-switch-context";
import SignInForm from "@/components/sign-in-form";
import { SupportWidget } from "@/components/support";
import { authClient } from "@/lib/auth-client";

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
 * Next.js server. Until the session is known the
 * shell renders with its skeletons (when the last visit was signed in), and
 * every data endpoint independently re-checks auth on the API server.
 */
export function AppShell({
  sidebarDefaultOpen,
  signedInHint,
  onboardedHint,
  children,
}: {
  sidebarDefaultOpen: boolean;
  signedInHint: boolean;
  onboardedHint: boolean;
  children: React.ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();
  // While signed out `data` stays null, and Better Auth reports isPending as
  // "no data yet" - so every refetch (window focus, reconnect, another tab)
  // flips it back to true. Showing the skeleton again would unmount SignInForm
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

  // Remembers the outcome for the next visit's first paint (read by the
  // layout). Only a hint: the session check below still decides.
  const signedIn = Boolean(session);
  useEffect(() => {
    if (isPending && !sessionKnown.current) return;
    document.cookie = `signed_in=${signedIn ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  }, [signedIn, isPending]);

  // No session (yet): the sign-in form, except on the very first check after
  // a signed-in visit, which draws the dashboard's skeleton instead. A
  // signed-out visitor, or a first visit, gets the real form straight away.
  const awaitingFirstCheck = isPending && !sessionKnown.current;
  if (!session && !(awaitingFirstCheck && signedInHint)) {
    return <SignInForm />;
  }

  // From here on one tree, from the first (server) paint until every request
  // has landed: the sidebar, the page and the skeletons inside them mount once
  // and stay, so nothing is swapped for a look-alike when the session or the
  // bucket arrives. Each region draws its own skeleton while its data loads.
  return (
    <>
      <CloudDashboardProvider>
        <SidebarProvider defaultOpen={sidebarDefaultOpen}>
          <BucketSwitchProvider>
            <Suspense>
              <AppSidebar />
              <ShellInset>{children}</ShellInset>
            </Suspense>
            {/* Answering it would write the admin's answers onto the
                customer's profile and bucket. */}
            {session && !impersonating ? <OnboardingGate onboardedHint={onboardedHint} /> : null}
          </BucketSwitchProvider>
        </SidebarProvider>
      </CloudDashboardProvider>
      {/* Swapped for the banner while impersonating: identifying the admin's
          browser as the customer would tie the two in the support inbox. */}
      {session ? (
        impersonating ? (
          <ImpersonationBanner user={session.user} />
        ) : (
          <SupportWidget />
        )
      ) : null}
    </>
  );
}
