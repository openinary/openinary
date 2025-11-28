"use client"

import React from "react"
import { type LucideIcon } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { X, FileImage } from "lucide-react"
import { Sidebar } from "../ui/sidebar"
import { useAssetDetails } from "./use-asset-details"
import { AssetPreview } from "./asset-preview"
import { AssetDetailsTab } from "./asset-details-tab"
import { AssetTransformationsTab } from "./asset-transformations-tab"
import { AssetMetadataTab } from "./asset-metadata-tab"

export function AssetDetailsSidebar({
  items,
  open,
  onOpenChange,
  ...props
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
  }[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
} & React.ComponentProps<typeof Sidebar>) {
  const {
    asset,
    treeLoading,
    fileSize,
    createdAt,
    updatedAt,
    isDeleting,
    mediaUrl,
    previewUrl,
    apiBaseUrl,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleDelete,
  } = useAssetDetails(onOpenChange)

  return (
    <div
      className="h-[100dvh] flex flex-col border-l bg-sidebar text-sidebar-foreground"
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
                <TabsTrigger value="transformations">Transformations</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <AssetDetailsTab
                  asset={asset}
                  fileSize={fileSize}
                  createdAt={createdAt}
                  updatedAt={updatedAt}
                  mediaUrl={mediaUrl}
                  isDeleting={isDeleting}
                  onCopyUrl={handleCopyUrl}
                  onDownload={handleDownload}
                  onOpenInNewTab={handleOpenInNewTab}
                  onDelete={handleDelete}
                />
              </TabsContent>

              <TabsContent value="transformations" className="space-y-4 mt-4">
                <AssetTransformationsTab asset={asset} apiBaseUrl={apiBaseUrl} />
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4 mt-4">
                <AssetMetadataTab asset={asset} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

