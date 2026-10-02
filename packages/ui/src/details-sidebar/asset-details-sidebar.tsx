"use client";

import * as React from "react";
import { FileImage } from "lucide-react";
import { cn } from "../lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useAssetDetails } from "./use-asset-details";
import { AssetPreview } from "./asset-preview";
import { AssetActions } from "./asset-actions";
import { AssetDeliverTab } from "./asset-deliver-tab";
import { AssetTransformationsTab } from "./asset-transformations-tab";
import { AssetInfoTab } from "./asset-info-tab";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";

export function AssetDetailsSidebar({
  assetId,
  onAssetIdChange,
  open,
  onOpenChange,
  hideClose,
  className,
  ...props
}: {
  assetId: string | null;
  onAssetIdChange: (assetId: string | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** For hosts that close the panel themselves, like a bottom sheet's handle. */
  hideClose?: boolean;
} & React.ComponentProps<"div">) {
  const {
    asset,
    fileSize,
    createdAt,
    isDeleting,
    deleteDialogOpen,
    mediaUrl,
    previewUrl,
    transformBaseUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleRename,
    handleMove,
    handleDeleteRequest,
    handleDeleteDialogClose,
    handleDelete,
  } = useAssetDetails(assetId, onAssetIdChange, onOpenChange);

  // Escape closes the panel - unless it is closing something on top of it
  // (a dialog, menu or select), which has focus while open, so the key
  // press comes from inside it.
  const closeRef = React.useRef(handleClose);
  closeRef.current = handleClose;
  React.useEffect(() => {
    if (!assetId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assetId]);

  return (
    <div
      // The shell's 8px gutter on the outside, 8px more inside: content sits
      // 16px from the page sheet and from the window, like the main sidebar's.
      className={cn(
        "h-[100dvh] flex flex-col py-2 pr-2 text-sidebar-foreground min-w-0",
        className,
      )}
      {...props}
    >
      {/* Radix lays the viewport's content out as a table, which grows to
          its widest line: a long file name would push the whole panel past
          its edge instead of truncating. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        {!asset ? (
          <div className="p-4 text-center text-muted-foreground">
            <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No asset selected</p>
            <p className="text-sm mt-2">
              Click on an asset to view its details
            </p>
          </div>
        ) : (
          <div className="px-2 pb-4 space-y-4">
            <AssetPreview
              asset={asset}
              previewUrl={previewUrl}
              fileSize={fileSize}
              onClose={hideClose ? undefined : handleClose}
            />

            <AssetActions
              asset={asset}
              isDeleting={isDeleting}
              onDownload={handleDownload}
              onOpenInNewTab={handleOpenInNewTab}
              onRename={handleRename}
              onMove={handleMove}
              onDelete={handleDeleteRequest}
            />

            <Tabs defaultValue="deliver" className="gap-3">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="deliver" className="h-8 text-sm">Deliver</TabsTrigger>
                <TabsTrigger value="transform" className="h-8 text-sm">Transform</TabsTrigger>
                <TabsTrigger value="info" className="h-8 text-sm">Info</TabsTrigger>
              </TabsList>

              <TabsContent value="deliver">
                <AssetDeliverTab
                  asset={asset}
                  mediaUrl={mediaUrl}
                  onOpenInNewTab={handleOpenInNewTab}
                />
              </TabsContent>

              <TabsContent value="transform">
                {/* Keyed on the type: image and video take different settings. */}
                <AssetTransformationsTab
                  key={asset.type}
                  asset={asset}
                  transformBaseUrl={transformBaseUrl}
                />
              </TabsContent>

              <TabsContent value="info">
                <AssetInfoTab
                  asset={asset}
                  fileSize={fileSize}
                  createdAt={createdAt}
                />
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
