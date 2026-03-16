"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileImage, X, type LucideIcon } from "lucide-react";
import React from "react";
import { Sidebar } from "../ui/sidebar";
import { AssetDetailsTab } from "./asset-details-tab";
import { AssetMetadataTab } from "./asset-metadata-tab";
import { AssetPreview } from "./asset-preview";
import { AssetTransformationsTab } from "./asset-transformations-tab";
import { useCurrentAssetDetails } from "./use-asset-details";

export function AssetDetailsSidebar({
  items,
  open,
  onOpenChange,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
  }[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & React.ComponentProps<typeof Sidebar>) {
  const {
    asset,
    treeLoading,
    fileSize,
    optimizedSize,
    createdAt,
    updatedAt,
    isDeleting,
    mediaUrl,
    previewUrl,
    transformBaseUrl,
    videoStatus,
    videoProgress,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleDelete,
  } = useCurrentAssetDetails(onOpenChange);

  return (
    <div
      className="h-[100dvh] flex flex-col border-l bg-sidebar text-sidebar-foreground min-w-[320px]"
      {...props}
    >
      <div className="border-b px-4 py-3 flex items-center justify-between shrink-0">
        <h2 className="text-lg font-semibold">Asset Details</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {treeLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : !asset ? (
          <div className="p-4 text-center text-muted-foreground">
            <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No asset selected</p>
            <p className="text-sm mt-2">
              Click on an asset to view its details
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <AssetPreview asset={asset} previewUrl={previewUrl} />

            <Separator />

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="transformations">
                  Transformations
                </TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <AssetDetailsTab
                  asset={asset}
                  fileSize={fileSize}
                  optimizedSize={optimizedSize}
                  createdAt={createdAt}
                  mediaUrl={mediaUrl}
                  isDeleting={isDeleting}
                  videoStatus={videoStatus}
                  videoProgress={videoProgress}
                  onCopyUrl={handleCopyUrl}
                  onDownload={handleDownload}
                  onOpenInNewTab={handleOpenInNewTab}
                  onDelete={handleDelete}
                />
              </TabsContent>

              <TabsContent value="transformations" className="space-y-4 mt-4">
                <AssetTransformationsTab
                  asset={asset}
                  apiBaseUrl={transformBaseUrl}
                />
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4 mt-4">
                <AssetMetadataTab asset={asset} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
