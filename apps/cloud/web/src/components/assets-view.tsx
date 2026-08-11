"use client";

import {
  AssetDetailsSidebar,
  BorderBeam,
  DefaultDialog,
  type MediaFile,
  MediaGrid,
  UploadButtonWithDialog,
  UploadSection,
} from "@openinary/ui";
import { ArrowUpRight, Plug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import HeaderBar from "@/components/headerbar";
import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
import { ThumbnailGenerator } from "@/components/thumbnail-generator";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useBucketIsEmpty } from "@/hooks/use-bucket-empty";
import { cn } from "@/lib/utils";

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
 * The media library, rendered into the shell's SidebarInset at "/". The
 * session gate, providers and sidebar all live in components/app-shell.tsx.
 */
/**
 * The empty-state CTAs passed to MediaGrid link to /get-started with a plain
 * <a>, not next/link: this one delegated listener routes them and any internal
 * link the grid grows later, without threading a router-aware component into
 * every slot. Everything that should stay a real navigation still does:
 * external hrefs, target=_blank, and the modifier clicks that mean "open this
 * elsewhere".
 */
function useInternalLinkRouting(ref: React.RefObject<HTMLElement | null>) {
  const router = useRouter();

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // A native listener rather than an onClick prop: this container is a
    // scroll region, not a control, and giving it a React click handler only
    // earns it a11y rules about keyboard equivalents it should not have. The
    // anchors it delegates for keep their own focus and Enter behaviour.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/")) return;
      if (anchor.target && anchor.target !== "_self") return;

      event.preventDefault();
      router.push(href);
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [ref, router]);
}

export function AssetsView() {
  const [assetId, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true }),
  );
  const [folderPath, setFolderPath] = useQueryState("folder");
  // Lets anything link straight into the upload dialog - the checklist's
  // "Upload your first asset" step does, since landing on an empty library
  // and being left to find the button is not what that step promised.
  // UploadButtonWithDialog owns its own state and takes no props for this, so
  // this is its controlled equivalent built from the same exported pieces.
  const [uploadOpen, setUploadOpen] = useQueryState(
    "upload",
    parseAsBoolean.withOptions({ clearOnDefault: true }),
  );
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
  useInternalLinkRouting(scrollContainerRef);
  const [sidebarMaxSize, setSidebarMaxSize] = useState(50);
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
    if (assetSidebarOpen) {
      if (panel.isCollapsed()) panel.expand(Math.min(30, sidebarMaxSize));
    } else if (!panel.isCollapsed()) {
      panel.collapse();
    }
  }, [assetSidebarOpen, sidebarMaxSize]);

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

  // Blocks pointer events (clicks/hover) on the media grid while a bucket
  // switch is in flight - MediaGrid has no "disabled" prop of its own, and
  // otherwise thumbnails for the outgoing bucket stay clickable/hoverable
  // until the new bucket's data replaces them.
  const { isSwitching } = useBucketSwitch();

  // Called unconditionally, then combined - inlining it after `!folderPath &&`
  // short-circuits the call and changes the hook count between renders.
  // Strictly `=== true`: null means the listing hasn't landed, and shedding
  // the header controls then would flash them out and back in.
  const bucketIsEmpty = useBucketIsEmpty();
  const showsEmptyState = !folderPath && bucketIsEmpty === true;

  // Both panels share one width transition so they stay in lockstep. On close
  // it waits out the content fade (delay-100): the width curve is a strong
  // ease-out, so without the delay the panel is already ~35% narrow while the
  // content is still half-visible - exactly the squash we're hiding.
  const panelWidthTransition = cn(
    animated &&
      !isResizing &&
      "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
    animated && !isResizing && !assetSidebarOpen && "delay-100",
  );

  return (
    <div ref={panelGroupRef} className="h-screen w-full">
      {uploadOpen && (
        <DefaultDialog
          // Same title UploadButtonWithDialog builds, so arriving by URL and
          // arriving by button are the same dialog.
          title={`Upload Files ${folderPath ? `to '${folderPath}'` : ""}`}
          isOpen
          onClose={() => setUploadOpen(null)}
        >
          <UploadSection uploadToFolder={folderPath || undefined} />
        </DefaultDialog>
      )}
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
          <HeaderBar
            columns={columns}
            onColumnsChange={handleColumnsChange}
            view={view}
            onViewChange={handleViewChange}
            showControls={!showsEmptyState}
          />
          <div
            ref={scrollContainerRef}
            aria-busy={isSwitching}
            className={cn(
              "h-[calc(100vh-64px)] space-y-6 overflow-auto @2xl/main:px-6 px-4 @2xl/main:py-8 py-6 transition-opacity",
              isSwitching && "pointer-events-none opacity-50",
            )}
          >
            <ThumbnailGenerator folderPath={folderPath} />
            <MediaGrid
              onMediaSelect={handleMediaSelect}
              sidebarOpen={assetSidebarOpen}
              columns={columns}
              view={view}
              scrollContainerRef={scrollContainerRef}
              folderPath={folderPath}
              onFolderPathChange={setFolderPath}
              // Cloud's empty state: the beam pushes onboarding, not upload,
              // and the docs link goes to the Cloud manual. Replaces what
              // used to be a pnpm patch on the package.
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
                      <a href="/get-started">
                        <Plug className="h-4 w-4" />
                        Get started
                      </a>
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
                    href="https://docs.openinary.dev/cloud/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation <ArrowUpRight className="ml-1 h-4 w-4" />
                  </a>
                </Button>
              }
            />
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          disabled={!assetSidebarOpen}
          onDragging={setIsResizing}
          className={cn(
            "transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            !assetSidebarOpen && "pointer-events-none opacity-0",
          )}
        />
        <ResizablePanel
          ref={sidebarPanelRef}
          defaultSize={openOnFirstPaint ? Math.min(30, sidebarMaxSize) : 0}
          minSize={Math.min(25, sidebarMaxSize)}
          maxSize={sidebarMaxSize}
          collapsible={true}
          collapsedSize={0}
          onCollapse={() => setAssetId(null)}
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
              assetSidebarOpen
                ? "opacity-100 delay-150 duration-200 ease-out"
                : "opacity-0 duration-100 ease-in",
            )}
          >
            <AssetDetailsSidebar
              assetId={assetId}
              onAssetIdChange={setAssetId}
              open={assetSidebarOpen}
              onOpenChange={setAssetSidebarOpen}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
