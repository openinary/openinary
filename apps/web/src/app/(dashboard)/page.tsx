"use client";

import { AssetDetailsSidebar } from "@/components/details-sidebar";
import HeaderBar from "@/components/headerbar";
import { Sheet } from "@/components/page";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarInset } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomSheet, MediaGrid, type MediaFile } from "@openinary/ui";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

const SIDEBAR_MIN_WIDTH_PX = 320;
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
  const [folderPath, setFolderPath] = useQueryState("folder");
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
  const [sidebarMinSize, setSidebarMinSize] = useState(25);
  const [sidebarMaxSize, setSidebarMaxSize] = useState(50);
  // Below md the details open as a bottom sheet instead of a side panel.
  const isMobile = useIsMobile();

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
      // The px floor keeps the tabs and buttons from cramping on a tablet,
      // where 25% of the window is barely 200px.
      setSidebarMinSize(Math.min(maxPercent, (SIDEBAR_MIN_WIDTH_PX / width) * 100));
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
              defaultSize={assetSidebarOpen && !isMobile ? 70 : 100}
              minSize={30}
              id="main-panel"
            >
              <Sheet>
              <HeaderBar
                columns={columns}
                onColumnsChange={handleColumnsChange}
                view={view}
                onViewChange={handleViewChange}
              />
              <div
                ref={scrollContainerRef}
                className="min-h-0 flex-1 p-4 sm:p-6 space-y-6 overflow-auto"
              >
                <MediaGrid
                  onMediaSelect={handleMediaSelect}
                  sidebarOpen={assetSidebarOpen}
                  columns={columns}
                  view={view}
                  scrollContainerRef={scrollContainerRef}
                  folderPath={folderPath}
                  onFolderPathChange={setFolderPath}
                />
              </div>
              </Sheet>
            </ResizablePanel>
            {assetSidebarOpen && !isMobile && (
              <>
                {/* Pulled back across the sheet's right margin and border
                    (8 + 1px) so the grip centres on that border, and lights that edge up (radius
                    included) the same as the main sidebar's rail. */}
                <ResizableHandle
                  withHandle
                  className="bg-transparent md:-mr-px md:-translate-x-[9px] before:absolute before:inset-y-2 before:right-0 before:w-3 before:rounded-r-xl before:border-transparent before:border-r-2 hover:bg-transparent hover:before:border-sidebar-border data-[resize-handle-state=drag]:bg-transparent data-[resize-handle-state=drag]:before:border-sidebar-border"
                />
                <ResizablePanel
                  ref={sidebarPanelRef}
                  defaultSize={Math.max(sidebarMinSize, Math.min(30, sidebarMaxSize))}
                  minSize={sidebarMinSize}
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
          {isMobile && (
            <BottomSheet
              open={!!assetId}
              onOpenChange={(open) => !open && setAssetId(null)}
              title="Asset details"
            >
              <AssetDetailsSidebar
                assetId={assetId}
                onAssetIdChange={setAssetId}
                open={assetSidebarOpen}
                onOpenChange={setAssetSidebarOpen}
                hideClose
                className="h-auto min-h-0 flex-1 p-0 px-2"
              />
            </BottomSheet>
          )}
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
