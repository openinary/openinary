"use client";

import { invalidateStorage, useOpeninary } from "@openinary/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  decodeImage,
  type RenderedImage,
  renderWidth,
} from "@/lib/playground/render";

export interface OwnImage {
  file: File;
  bitmap: ImageBitmap;
  /** Object URL for the untouched source, created once and revoked on reset. */
  previewUrl: string;
  /** Set once the upload lands, so the URL shown can be the real one. */
  path: string | null;
}

/**
 * A file the user brought to the playground. Two independent things happen to
 * it, and only one of them touches the network:
 *
 * 1. It is decoded and re-encoded locally for the comparison. Every width the
 *    user clicks is canvas work in their browser - the transform container is
 *    never woken, which is the whole constraint these pages are built around.
 * 2. It is uploaded to their bucket, because it's their file and it ticks the
 *    "first asset" step of the checklist. Same session-authenticated
 *    POST /upload the dashboard's own upload button uses - no signature needed
 *    while a session cookie is present.
 */
export function useOwnImage() {
  const { apiBaseUrl, fetch: fetchImpl } = useOpeninary();
  const queryClient = useQueryClient();
  const [image, setImage] = useState<OwnImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Keyed by target width. Object URLs are revoked when the source changes.
  const cache = useRef(new Map<number, RenderedImage>());
  const previewUrl = useRef<string | null>(null);

  const reset = useCallback(() => {
    for (const rendered of cache.current.values())
      URL.revokeObjectURL(rendered.url);
    cache.current.clear();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }, []);

  useEffect(() => reset, [reset]);

  const select = useCallback(
    async (file: File) => {
      reset();
      let bitmap: ImageBitmap;
      try {
        bitmap = await decodeImage(file);
      } catch {
        toast.error("Couldn't read that image.");
        return;
      }
      previewUrl.current = URL.createObjectURL(file);
      setImage({ file, bitmap, previewUrl: previewUrl.current, path: null });

      setIsUploading(true);
      try {
        const body = new FormData();
        body.append("files", file);
        const response = await fetchImpl(`${apiBaseUrl}/upload`, {
          method: "POST",
          body,
        });
        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
          files?: { path: string }[];
        };
        if (!data.success) throw new Error(data.error ?? "Upload failed");
        const path = data.files?.[0]?.path ?? null;
        setImage((current) =>
          current?.file === file ? { ...current, path } : current,
        );
        // The media grid, the storage tree and the checklist's "first asset"
        // step all read these.
        invalidateStorage(queryClient);
      } catch (error) {
        // The comparison above still works: it never needed the upload. Only
        // the copyable URL and the checklist step do.
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn't add that file to your bucket",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [apiBaseUrl, fetchImpl, queryClient, reset],
  );

  const render = useCallback(
    async (width: number): Promise<RenderedImage | null> => {
      if (!image) return null;
      const cached = cache.current.get(width);
      if (cached) return cached;
      const rendered = await renderWidth(image.bitmap, width);
      cache.current.set(width, rendered);
      return rendered;
    },
    [image],
  );

  return { image, isUploading, select, render };
}
