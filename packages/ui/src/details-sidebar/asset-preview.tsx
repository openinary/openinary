"use client";

import { X } from "lucide-react";
import { VideoThumbnail } from "../components/video-thumbnail";
import type { MediaFile } from "../types";
import { formatFileSize } from "./utils";

interface AssetPreviewProps {
  asset: MediaFile;
  previewUrl: string;
  fileSize: number | null;
  /** Shows a close button on the heading's row, sized to the heading. */
  onClose?: () => void;
}

export function AssetPreview({
  asset,
  previewUrl,
  fileSize,
  onClose,
}: AssetPreviewProps) {
  return (
    <div>
      {/* As tall as the page header beside it, so the two rows line up. */}
      <div className="flex h-12 items-center justify-between">
        <h3 className="text-sm font-semibold">Preview</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative rounded-sm text-muted-foreground transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
        {/*
          Both media types go through the same component, which owns the
          skeleton, the fade and the retry.

          This used to keep its own state for stills, remembering the URL that
          failed - and never clearing it. Nothing reset that flag on a
          successful load, so once a preview 404'd (which it does by design
          while its thumbnail is still being generated in the browser) the
          error stayed true for that URL forever: the image showed up on a
          later attempt and painted underneath "Failed to load preview", and
          reselecting the asset brought the message straight back.
        */}
        <VideoThumbnail
          src={previewUrl}
          alt={asset.name}
          className="object-contain"
          loading="eager"
          errorLabel="Failed to load preview"
        />
      </div>
      <div className="mt-3 space-y-0.5 text-center">
        <p className="truncate text-sm font-medium" title={asset.name}>
          {asset.name}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {asset.name.split(".").pop()?.toUpperCase()}
          {fileSize !== null && ` / ${formatFileSize(fileSize)}`}
        </p>
      </div>
    </div>
  );
}
