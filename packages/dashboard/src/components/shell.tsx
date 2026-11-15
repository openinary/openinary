"use client";

import type { MediaFile } from "@openinary/ui";

import { useDashboard } from "../adapter";
import { useHydrated } from "../hooks/use-hydrated";
import { SidebarInset } from "../ui/sidebar";
import { Sheet } from "./page";

const ASSETS_ROUTE = "/";

/**
 * Opens a file picked in the sidebar. On the assets route a shallow search
 * param update, so the scrolled, virtualised grid stays mounted; anywhere else
 * there is no details panel, so it navigates there.
 */
export function useOpenAsset() {
  const { useRouter, usePathname, useSearchParam } = useDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const [, setAssetId] = useSearchParam("asset");

  return (media: MediaFile) => {
    if (pathname === ASSETS_ROUTE) setAssetId(media.id);
    else router.push(`${ASSETS_ROUTE}?asset=${encodeURIComponent(media.id)}`);
  };
}

/**
 * Where every page renders, beside the sidebar. Pages mount on the client
 * only, so their skeletons can draw the shape they remembered (useHydrated);
 * the server paints the bare sheet they will sit on.
 */
export function ShellInset({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  return <SidebarInset>{hydrated ? children : <Sheet />}</SidebarInset>;
}
