"use client"

import { useState } from "react"
import {
  FileType,
  HardDrive,
  Calendar,
  ExternalLink,
  Copy,
  Check,
  Download,
  Trash2,
  Zap,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { CopyInput } from "@/components/ui/copy-input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { MediaFile } from "./types"
import type { VideoStatus } from "@/hooks/use-video-status"
import { formatFileSize, formatDate, getFileType } from "./utils"
import { Spinner } from "../ui/spinner"

interface AssetDetailsTabProps {
  asset: MediaFile
  fileSize: number | null
  optimizedSize: number | null
  createdAt: Date | null
  mediaUrl: string
  isDeleting: boolean
  videoStatus?: VideoStatus
  videoProgress?: number
  onCopyUrl: () => void
  onDownload: () => void
  onOpenInNewTab: () => void
  onDelete: () => void
}

export function AssetDetailsTab({
  asset,
  fileSize,
  optimizedSize,
  createdAt,
  mediaUrl,
  isDeleting,
  videoStatus,
  videoProgress = 0,
  onCopyUrl,
  onDownload,
  onOpenInNewTab,
  onDelete,
}: AssetDetailsTabProps) {
  const [copied, setCopied] = useState<boolean>(false)

  const handleCopyUrl = () => {
    onCopyUrl()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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

        {asset.type === "video" && (
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Optimization Status
            </label>
            <div className="text-sm text-muted-foreground flex items-center gap-2 min-h-[20px] transition-opacity duration-200">
              {(!videoStatus || videoStatus === "unknown") ? (
                <span className="opacity-50">Checking status...</span>
              ) : videoStatus === "processing" ? (
                <>
                  <Spinner size={16} className="text-primary" />
                  <span>
                    Processing video{videoProgress > 0 ? ` (${Math.round(videoProgress)}%)` : "..."}
                  </span>
                </>
              ) : videoStatus === "ready" ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span>Optimized version ready</span>
                </>
              ) : videoStatus === "error" ? (
                <>
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <span>Processing failed</span>
                </>
              ) : null}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Asset Size
          </label>
          <div className="text-sm text-muted-foreground">
            {asset.type === "video"
              ? optimizedSize
                ? formatFileSize(optimizedSize)
                : formatFileSize(fileSize)
              : formatFileSize(fileSize)}
          </div>
        </div>

        {asset.type === "video" && (
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Original Size
            </label>
            <div className="text-sm text-muted-foreground">
              {formatFileSize(fileSize)}
            </div>
          </div>
        )}

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
            onClick={handleCopyUrl}
            className="gap-2"
            disabled={copied}
          >
            <div className="relative h-4 w-4">
              <div
                className={cn(
                  "absolute inset-0 transition-all",
                  copied ? "scale-100 opacity-100" : "scale-0 opacity-0"
                )}
              >
                <Check className="h-4 w-4 stroke-emerald-500" />
              </div>
              <div
                className={cn(
                  "absolute inset-0 transition-all",
                  copied ? "scale-0 opacity-0" : "scale-100 opacity-100"
                )}
              >
                <Copy className="h-4 w-4" />
              </div>
            </div>
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

