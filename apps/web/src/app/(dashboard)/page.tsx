"use client";

import { AssetDetailsSidebar } from "@/components/details-sidebar";
import HeaderBar from "@/components/headerbar";
import { MediaGrid } from "@/components/media-grid";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarInset } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import type { MediaFile } from "@openinary/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

const SIDEBAR_MAX_WIDTH_PX = 500;
const COLUMNS_STORAGE_KEY = "openinary:media-grid-columns";
const VIEW_STORAGE_KEY = "openinary:media-grid-view";

function getStoredColumns(): number {
  if (typeof window === "undefined") return 6;
  const stored = Number(window.localStorage.getItem(COLUMNS_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 6;
}

function getStoredView(): "grid" | "list" {
  if (typeof window === "undefined") return "list";
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "grid" ? "grid" : "list";
}

function HomePageContent() {
  const [assetId, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true }),
  );
  const [assetSidebarOpen, setAssetSidebarOpen] = useState(false);
  const [columns, setColumns] = useState(getStoredColumns);
  const [view, setView] = useState<"grid" | "list">(getStoredView);

  const handleColumnsChange = (value: number) => {
    setColumns(value);
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, String(value));
  };

  const handleViewChange = (value: "grid" | "list") => {
    setView(value);
    window.localStorage.setItem(VIEW_STORAGE_KEY, value);
  };
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const panelGroupRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [sidebarMaxSize, setSidebarMaxSize] = useState(50);

  // Sync sidebar open state with asset selection
  useEffect(() => {
    const shouldOpen = !!assetId;
    setAssetSidebarOpen(shouldOpen);
    // Panel will be rendered/unmounted based on assetSidebarOpen state
  }, [assetId]);

  // Keep the sidebar panel's max size pinned to SIDEBAR_MAX_WIDTH_PX regardless
  // of window width, since ResizablePanel constraints are percentage-based.
  useEffect(() => {
    const container = panelGroupRef.current;
    if (!container) return;

    const updateMaxSize = (width: number) => {
      if (width === 0) return;
      const maxPercent = Math.min(100, (SIDEBAR_MAX_WIDTH_PX / width) * 100);
      setSidebarMaxSize(maxPercent);
      const panel = sidebarPanelRef.current;
      if (panel && panel.getSize() > maxPercent) {
        panel.resize(maxPercent);
      }
    };

    const observer = new ResizeObserver(([entry]) => {
      updateMaxSize(entry.contentRect.width);
    });
    observer.observe(container);
    updateMaxSize(container.clientWidth);

    return () => observer.disconnect();
  }, []);

  const handleMediaSelect = (media: MediaFile) => {
    setAssetId(media.id);
  };

  return (
    <>
      <AppSidebar onMediaSelect={handleMediaSelect} />
      <SidebarInset>
        <div ref={panelGroupRef} className="h-screen w-full">
          <ResizablePanelGroup direction="horizontal" className="h-screen">
            <ResizablePanel
              defaultSize={assetSidebarOpen ? 70 : 100}
              minSize={30}
              id="main-panel"
            >
              <HeaderBar
                columns={columns}
                onColumnsChange={handleColumnsChange}
                view={view}
                onViewChange={handleViewChange}
              />
              <div
                ref={scrollContainerRef}
                className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 overflow-auto h-[calc(100vh-64px)] overflow-y-scoll"
              >
                <MediaGrid
                  onMediaSelect={handleMediaSelect}
                  sidebarOpen={assetSidebarOpen}
                  columns={columns}
                  view={view}
                  scrollContainerRef={scrollContainerRef}
                />
              </div>
            </ResizablePanel>
            {assetSidebarOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  ref={sidebarPanelRef}
                  defaultSize={Math.min(30, sidebarMaxSize)}
                  minSize={Math.min(25, sidebarMaxSize)}
                  maxSize={sidebarMaxSize}
                  collapsible={true}
                  collapsedSize={0}
                  onCollapse={() => setAssetId(null)}
                  id="sidebar-panel"
                >
                  <AssetDetailsSidebar
                    assetId={assetId}
                    onAssetIdChange={setAssetId}
                    open={assetSidebarOpen}
                    onOpenChange={setAssetSidebarOpen}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </SidebarInset>
    </>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Redirect to login if user is not authenticated or session is invalid
  useEffect(() => {
    if (!isPending && (!session?.session || !session?.user)) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-background px-4">
        <Spinner className="mx-auto" />
      </div>
    );
  }

  // Don't render content if session is invalid (redirect will happen)
  if (!session?.session || !session?.user) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          Loading...
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
