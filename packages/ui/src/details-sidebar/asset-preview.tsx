"use client";

import { useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { VideoThumbnail } from "../components/video-thumbnail";
import type { MediaFile } from "../types";

interface AssetPreviewProps {
  asset: MediaFile;
  previewUrl: string;
}

export function AssetPreview({ asset, previewUrl }: AssetPreviewProps) {
  // Keyed by URL rather than reset in an effect. usePreloadMedia warms the
  // same URL, so on a revisit the <img> is served from cache and fires load
  // before the passive effect runs - the effect then set isLoading back to
  // true with no load event left to clear it, and the preview stayed an empty
  // grey square until the sidebar was closed and reopened.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const isLoading = loadedUrl !== previewUrl && failedUrl !== previewUrl;
  const hasError = failedUrl === previewUrl;

  const handleLoad = () => {
    setLoadedUrl(previewUrl);
  };

  const handleError = () => {
    setFailedUrl(previewUrl);
  };

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
              // Fresh element per URL, so the load event is guaranteed to
              // fire for the URL the state above is keyed on rather than
              // being swallowed by a reused node that already loaded.
              key={previewUrl}
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
  );
}
