"use client"

import {
  FileType,
  HardDrive,
  Calendar,
  ExternalLink,
  Copy,
  Download,
  Trash2,
} from "lucide-react"
import { CopyInput } from "@/components/ui/copy-input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { MediaFile } from "./types"
import { formatFileSize, formatDate, getFileType } from "./utils"

interface AssetDetailsTabProps {
  asset: MediaFile
  fileSize: number | null
  createdAt: Date | null
  updatedAt: Date | null
  mediaUrl: string
  isDeleting: boolean
  onCopyUrl: () => void
  onDownload: () => void
  onOpenInNewTab: () => void
  onDelete: () => void
}

export function AssetDetailsTab({
  asset,
  fileSize,
  createdAt,
  updatedAt,
  mediaUrl,
  isDeleting,
  onCopyUrl,
  onDownload,
  onOpenInNewTab,
  onDelete,
}: AssetDetailsTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <FileType className="h-4 w-4" />
            Asset Name
          </label>
          <CopyInput value={asset.name} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Asset Size
          </label>
          <div className="text-sm text-muted-foreground">
            {formatFileSize(fileSize)}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <FileType className="h-4 w-4" />
            Asset Type
          </label>
          <div className="text-sm text-muted-foreground">
            {getFileType(asset)}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Asset Path
          </label>
          <CopyInput value={asset.path} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Created At
          </label>
          <div className="text-sm text-muted-foreground">
            {formatDate(createdAt)}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Updated At
          </label>
          <div className="text-sm text-muted-foreground">
            {formatDate(updatedAt)}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Asset URL
          </label>
          <CopyInput value={mediaUrl} />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyUrl}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy URL
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenInNewTab}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  )
}

