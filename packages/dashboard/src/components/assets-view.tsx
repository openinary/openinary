"use client";

import {
  AssetDetailsSidebar,
  BorderBeam,
  BottomSheet,
  type MediaFile,
  MediaGrid,
  UploadButtonWithDialog,
  UploadDialog,
  useStorageLevel,
} from "@openinary/ui";
import { ArrowUpRight, Plug } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { useDashboard } from "../adapter";
import { HeaderBar } from "./headerbar";
import { Sheet } from "./page";
import { Button } from "../ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { useIsMobile } from "../hooks/use-mobile";
import { cn } from "@openinary/ui/server";

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

/**
 * The media library at "/". `beforeGrid` renders above the grid for the open
 * folder; `busy` dims and blocks the grid while its contents are being
 * replaced (Cloud's bucket switch: MediaGrid has no "disabled" prop of its
 * own, and the outgoing bucket's thumbnails would stay clickable until the new
 * data lands).
 */
export function AssetsView({
  beforeGrid,
  busy = false,
}: {
  beforeGrid?: (folderPath: string | null) => React.ReactNode;
  busy?: boolean;
}) {
  const { Link, docsUrl, useSearchParam } = useDashboard();
  const [assetId, setAssetId] = useSearchParam("asset");
  const [folderPath, setFolderPath] = useSearchParam("folder");
  // Lets anything link straight into the upload dialog (/?upload=true), like
  // the command palette's "Upload files".
  const [upload, setUpload] = useSearchParam("upload");
  // Deep-linking to ?asset=... must not animate the sidebar in on first paint,
  // and its content must not fade in either - it starts open and visible.
  const openOnFirstPaint = useRef(!!assetId).current;
  const [assetSidebarOpen, setAssetSidebarOpen] = useState(openOnFirstPaint);
  const [columns, setColumns] = useState(getStoredColumns);
  const [view, setView] = useState<"grid" | "list">(getStoredView);
  const { resolvedTheme } = useTheme();

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
  // State, not a ref: MediaGrid has to render again once the slot exists.
  const [selectionSlot, setSelectionSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [sidebarMinSize, setSidebarMinSize] = useState(25);
  const [sidebarMaxSize, setSidebarMaxSize] = useState(50);
  // Below md the details open as a bottom sheet instead, and the side panel
  // stays collapsed.
  const isMobile = useIsMobile();
  const sidePanelOpen = assetSidebarOpen && !isMobile;
  const [isResizing, setIsResizing] = useState(false);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    setAssetSidebarOpen(!!assetId);
  }, [assetId]);

  // Passive effects run after the first paint, which is all that's needed to
  // keep the initial layout from animating. rAF would never fire in a
  // background tab, leaving the sidebar permanently un-animated there.
  useEffect(() => setAnimated(true), []);

  // The panel stays mounted and collapses to 0 instead of unmounting, so the
  // main panel's width is driven by an animatable flex-grow rather than
  // snapping when the subtree appears/disappears.
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (sidePanelOpen) {
      if (panel.isCollapsed())
        panel.expand(Math.max(sidebarMinSize, Math.min(30, sidebarMaxSize)));
    } else if (!panel.isCollapsed()) {
      panel.collapse();
    }
  }, [sidePanelOpen, sidebarMinSize, sidebarMaxSize]);

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

  // MediaGrid's own empty-state condition (root, no folders, no files), read
  // from the listing it already fetched. Not while the listing is in flight:
  // shedding the header controls on a maybe flashes them out and back in.
  const { data: root } = useStorageLevel("");
  const showsEmptyState =
    !folderPath &&
    !!root &&
    root.files.length === 0 &&
    root.folders.length === 0;

  // Both panels share one width transition so they stay in lockstep. On close
  // it waits out the content fade (delay-100): the width curve is a strong
  // ease-out, so without the delay the panel is already ~35% narrow while the
  // content is still half-visible - exactly the squash we're hiding.
  const panelWidthTransition = cn(
    animated &&
      !isResizing &&
      "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
    animated && !isResizing && !sidePanelOpen && "delay-100",
  );

  return (
    <div ref={panelGroupRef} className="h-screen w-full">
      <UploadDialog
        uploadToFolder={folderPath || undefined}
        open={upload === "true"}
        onOpenChange={(open) => !open && setUpload(null)}
      />
      <ResizablePanelGroup direction="horizontal" className="h-screen">
        {/* @container/main: the header and grid below size themselves off
            this panel, not the viewport - the panel loses up to 500px to
            the Asset Details sidebar, so viewport breakpoints lie here. */}
        <ResizablePanel
          defaultSize={openOnFirstPaint ? 70 : 100}
          minSize={30}
          id="main-panel"
          className={cn("@container/main", panelWidthTransition)}
        >
          <Sheet>
            <HeaderBar
              folderPath={folderPath}
              onFolderPathChange={setFolderPath}
              columns={columns}
              onColumnsChange={handleColumnsChange}
              view={view}
              onViewChange={handleViewChange}
              showControls={!showsEmptyState}
              selectionSlotRef={setSelectionSlot}
            />
            <div
              ref={scrollContainerRef}
              aria-busy={busy}
              className={cn(
                "min-h-0 flex-1 space-y-6 overflow-auto px-3 pt-1 pb-12 transition-opacity sm:px-5",
                busy && "pointer-events-none opacity-50",
              )}
            >
              {beforeGrid?.(folderPath)}
              <MediaGrid
                onMediaSelect={handleMediaSelect}
                sidebarOpen={assetSidebarOpen}
                columns={columns}
                view={view}
                scrollContainerRef={scrollContainerRef}
                selectionSlot={selectionSlot}
                folderPath={folderPath}
                onFolderPathChange={setFolderPath}
                // The beam pushes onboarding, not upload.
                emptyActions={
                  <div className="flex gap-2">
                    <BorderBeam
                      size="pulse-outside"
                      colorVariant={
                        resolvedTheme === "light" ? "mono" : "colorful"
                      }
                      strength={0.7}
                      theme={resolvedTheme === "light" ? "light" : "dark"}
                    >
                      <Button variant="outline" className="gap-2" asChild>
                        <Link href="/get-started">
                          <Plug className="h-4 w-4" />
                          Get started
                        </Link>
                      </Button>
                    </BorderBeam>
                    <UploadButtonWithDialog />
                  </div>
                }
                emptyFooter={
                  <Button
                    variant="link"
                    asChild
                    className="text-muted-foreground"
                    size="sm"
                  >
                    <a
                      href={docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Documentation <ArrowUpRight className="ml-1 h-4 w-4" />
                    </a>
                  </Button>
                }
              />
            </div>
          </Sheet>
        </ResizablePanel>
        {/* Pulled back across the sheet's right margin and border (8 + 1px)
            so the 1px handle lies on that border and the grip centres on it;
            -mr-px gives back the 1px it takes from the layout.
            It lights that edge up (radius included) instead
            of drawing a straight rule - the same as the main sidebar's rail. */}
        <ResizableHandle
          withHandle
          disabled={!sidePanelOpen}
          onDragging={setIsResizing}
          className={cn(
            "bg-transparent transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] md:-mr-px md:-translate-x-[9px]",
            "before:absolute before:inset-y-2 before:right-0 before:w-3 before:rounded-r-xl before:border-transparent before:border-r-2 hover:bg-transparent hover:before:border-sidebar-border data-[resize-handle-state=drag]:bg-transparent data-[resize-handle-state=drag]:before:border-sidebar-border",
            !sidePanelOpen && "pointer-events-none opacity-0",
          )}
        />
        <ResizablePanel
          ref={sidebarPanelRef}
          defaultSize={openOnFirstPaint ? Math.min(30, sidebarMaxSize) : 0}
          minSize={sidebarMinSize}
          maxSize={sidebarMaxSize}
          collapsible={true}
          collapsedSize={0}
          // On mobile the panel is collapsed on purpose, with the asset
          // shown in the bottom sheet: that collapse must not deselect it.
          onCollapse={() => !isMobile && setAssetId(null)}
          id="sidebar-panel"
          className={cn("overflow-hidden", panelWidthTransition)}
        >
          {/* The content reflows at every intermediate width while the
              panel animates, so text would visibly wrap and squash. Hiding
              it for that window is cheaper than locking its layout width:
              it fades in late (as the width settles) and out fast (before
              the panel is narrow enough to wrap anything). Manual drags
              keep it fully opaque - only the open/close animation hides it. */}
          <div
            className={cn(
              "h-full",
              !isResizing && "transition-opacity motion-reduce:transition-none",
              sidePanelOpen
                ? "opacity-100 delay-150 duration-200 ease-out"
                : "opacity-0 duration-100 ease-in",
            )}
          >
            {!isMobile && (
              <AssetDetailsSidebar
                assetId={assetId}
                onAssetIdChange={setAssetId}
                open={assetSidebarOpen}
                onOpenChange={setAssetSidebarOpen}
              />
            )}
          </div>
        </ResizablePanel>
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
  );
}
