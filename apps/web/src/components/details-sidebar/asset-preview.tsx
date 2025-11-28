"use client"

import type { MediaFile } from "./types"

interface AssetPreviewProps {
  asset: MediaFile
  previewUrl: string
}

export function AssetPreview({ asset, previewUrl }: AssetPreviewProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Preview</h3>
      <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
        {asset.type === "image" ? (
          <img
            src={previewUrl}
            alt={asset.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <video
            src={previewUrl}
            controls
            className="max-w-full max-h-full"
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    </div>
  )
}

