"use client"

import { useState, useEffect } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { VideoThumbnail } from "@/components/video-thumbnail"
import type { MediaFile } from "./types"

interface AssetPreviewProps {
  asset: MediaFile
  previewUrl: string
}

export function AssetPreview({ asset, previewUrl }: AssetPreviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Reset loading state when previewUrl changes
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
  }, [previewUrl])

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Preview</h3>
      <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
        {asset.type === "video" ? (
          <VideoThumbnail
            src={previewUrl}
            alt={asset.name}
            loading="eager"
          />
        ) : (
          <>
            {isLoading && (
              <Skeleton className="absolute inset-0 w-full h-full" />
            )}
            <img
              src={previewUrl}
              alt={asset.name}
              className={`w-full h-full object-contain transition-opacity duration-200 ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={handleLoad}
              onError={handleError}
              loading="eager"
            />
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">Failed to load preview</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

