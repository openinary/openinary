"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryState, parseAsString } from "nuqs";
import { useSession } from "@/lib/auth-client";
import { UploadSection } from "@/components/upload-section";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { AssetDetailsSidebar, AssetDetailsSidebarTrigger } from "@/components/details-sidebar";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Package, Image as ImageIcon, Video } from "lucide-react";
import { MediaGrid } from "@/components/media-grid";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Spinner } from "@/components/ui/spinner";

type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: "image" | "video";
};

function HomePageContent() {
  const [assetId, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true })
  );
  const [folderPath, setFolderPath] = useQueryState("folder");
  const [assetSidebarOpen, setAssetSidebarOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
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

  const handleUploadClick = () => {
    setUploadDialogOpen(true);
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
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center justify-between w-full px-4">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-[orientation=vertical]:h-4"
                  />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          onClick={() => setFolderPath(null)}
                          className="cursor-pointer"
                        >
                          Assets
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      {folderPath &&
                        folderPath.split("/").filter(Boolean).map((segment, index, segments) => {
                          const pathToSegment = segments.slice(0, index + 1).join("/");
                          const isLast = index === segments.length - 1;
                          return (
                            <div key={pathToSegment} className="flex items-center">
                              <BreadcrumbSeparator />
                              <BreadcrumbItem>
                                {isLast ? (
                                  <BreadcrumbPage>{segment}</BreadcrumbPage>
                                ) : (
                                  <BreadcrumbLink
                                    onClick={() => setFolderPath(pathToSegment)}
                                    className="cursor-pointer"
                                  >
                                    {segment}
                                  </BreadcrumbLink>
                                )}
                              </BreadcrumbItem>
                            </div>
                          );
                        })}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                  <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Upload
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="flex flex-col gap-0 p-0 max-w-2xl [&>button:last-child]:top-3.5">
                      <DialogHeader className="contents space-y-0 text-left">
                        <DialogTitle className="border-b px-6 py-4 text-base">
                          Upload Files
                        </DialogTitle>
                      </DialogHeader>
                      <div className="px-6 py-4">
                        <UploadSection />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
            </header>
            <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 overflow-auto">
              <MediaGrid 
                onMediaSelect={handleMediaSelect} 
                sidebarOpen={assetSidebarOpen}
                onUploadClick={handleUploadClick}
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
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}

