"use client";

import * as React from "react";
import { X, FileImage } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useAssetDetails } from "./use-asset-details";
import { AssetPreview } from "./asset-preview";
import { AssetDetailsTab } from "./asset-details-tab";
import { AssetTransformationsTab } from "./asset-transformations-tab";
import { AssetMetadataTab } from "./asset-metadata-tab";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";

export function AssetDetailsSidebar({
  assetId,
  onAssetIdChange,
  open,
  onOpenChange,
  ...props
}: {
  assetId: string | null;
  onAssetIdChange: (assetId: string | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & React.ComponentProps<"div">) {
  const {
    asset,
    fileSize,
    optimizedSize,
    createdAt,
    isDeleting,
    deleteDialogOpen,
    mediaUrl,
    previewUrl,
    transformBaseUrl,
    videoStatus,
    videoProgress,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleDeleteRequest,
    handleDeleteDialogClose,
    handleDelete,
  } = useAssetDetails(assetId, onAssetIdChange, onOpenChange);

  return (
    <div
      className="h-[100dvh] flex flex-col border-l bg-sidebar text-sidebar-foreground min-w-0"
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
        {!asset ? (
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
                <TabsTrigger value="transformations">Transformations</TabsTrigger>
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
                  onDelete={handleDeleteRequest}
                />
              </TabsContent>

              <TabsContent value="transformations" className="space-y-4 mt-4">
                <AssetTransformationsTab asset={asset} apiBaseUrl={transformBaseUrl} />
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4 mt-4">
                <AssetMetadataTab asset={asset} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </ScrollArea>

      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteDialogClose}
        title="Delete Item"
        description={`This action cannot be undone. Are you sure you want to permanently delete "${asset?.name ?? ""}"?`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
