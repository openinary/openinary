"use client";

import type { MediaFile } from "@openinary/ui";
import { usePathname, useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect } from "react";

import { Sheet } from "@/components/page";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/lib/auth-client";

const ASSETS_ROUTE = "/";

/**
 * The sidebar and the sheet every dashboard route draws on, mounted once for
 * all of them: moving between pages, or the session and the data landing,
 * never swaps the shell for a look-alike. Each region inside draws its own
 * skeleton while its data loads.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The queue monitor is a bare debugging page, outside the shell.
  if (pathname.startsWith("/debug")) return children;

  return (
    <Suspense>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  // Shares the "asset" key with the assets page, so picking a file in the
  // sidebar opens its details panel there.
  const [, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true }),
  );

  // The middleware turns away requests without a session cookie; this
  // catches one that is there but no longer valid.
  useEffect(() => {
    if (!isPending && !session?.user) router.push("/login");
  }, [session, isPending, router]);

  // On the assets route a shallow nuqs update, so the scrolled grid stays
  // mounted; anywhere else there is no details panel, so it navigates.
  const handleMediaSelect = (media: MediaFile) => {
    if (pathname === ASSETS_ROUTE) setAssetId(media.id);
    else router.push(`${ASSETS_ROUTE}?asset=${encodeURIComponent(media.id)}`);
  };

  // The page mounts on the client only, so its skeletons can draw the shape
  // they remembered (see useHydrated); the server paints the bare sheet.
  const hydrated = useHydrated();

  return (
    <>
      <AppSidebar onMediaSelect={handleMediaSelect} />
      <SidebarInset>{hydrated ? children : <Sheet />}</SidebarInset>
    </>
  );
}
