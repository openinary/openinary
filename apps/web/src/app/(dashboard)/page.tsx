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
import { Image as ImageIcon, Package, Video } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: "image" | "video";
};

function HomePageContent() {
  const [assetId, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true }),
  );
  const [assetSidebarOpen, setAssetSidebarOpen] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  // Sync sidebar open state with asset selection
  useEffect(() => {
    const shouldOpen = !!assetId;
    setAssetSidebarOpen(shouldOpen);
    // Panel will be rendered/unmounted based on assetSidebarOpen state
  }, [assetId]);

  const handleMediaSelect = (media: MediaFile) => {
    setAssetId(media.id);
  };

  const assetSidebarItems = [
    {
      title: "Details",
      url: "#",
      icon: Package,
      isActive: true,
    },
    {
      title: "Preview",
      url: "#",
      icon: ImageIcon,
    },
    {
      title: "Metadata",
      url: "#",
      icon: Video,
    },
  ];

  return (
    <>
      <AppSidebar onMediaSelect={handleMediaSelect} />
      <SidebarInset>
        <ResizablePanelGroup direction="horizontal" className="h-screen">
          <ResizablePanel
            defaultSize={assetSidebarOpen ? 70 : 100}
            minSize={30}
            id="main-panel"
          >
            <HeaderBar />
            <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 overflow-auto h-[calc(100vh-64px)] overflow-y-scoll">
              <MediaGrid
                onMediaSelect={handleMediaSelect}
                sidebarOpen={assetSidebarOpen}
              />
            </div>
          </ResizablePanel>
          {assetSidebarOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                ref={sidebarPanelRef}
                defaultSize={30}
                minSize={25}
                maxSize={50}
                collapsible={true}
                id="sidebar-panel"
              >
                <AssetDetailsSidebar
                  items={assetSidebarItems}
                  open={assetSidebarOpen}
                  onOpenChange={setAssetSidebarOpen}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
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
