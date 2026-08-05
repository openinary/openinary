"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { Skeleton } from "../ui/skeleton";

interface VideoThumbnailProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /**
   * Replaces the default two-line "Thumbnail unavailable" once the retries
   * run out. For surfaces where "thumbnail" is the wrong word, like the
   * details sidebar's preview.
   */
  errorLabel?: string;
  onLoad?: () => void;
  onError?: () => void;
}

// Dashboard thumbnails are generated in the browser and uploaded afterwards,
// and until one exists the server answers 404 deliberately rather than doing
// the work itself. A 404 here therefore means "not yet", not "never", which is
// what makes retrying the right response at all.
//
// The ladder runs to roughly a minute because generation is queued a handful
// at a time: in a large upload batch the last thumbnails are minutes out, and
// the previous 6s ceiling (1s/2s/3s) left exactly those tiles stranded on the
// error state with nothing to bring them back.
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

/**
 * An `<img>` that shows a skeleton until it loads, fades in, and keeps
 * retrying a source that is not ready yet.
 *
 * Named for its first use, but it is the component behind every dashboard
 * thumbnail and preview - still images included. Nothing in it is
 * video-specific.
 */
export function VideoThumbnail({
  src,
  alt,
  className,
  loading = "lazy",
  errorLabel,
  onLoad,
  onError,
}: VideoThumbnailProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [imageKey, setImageKey] = useState(0);
  // Delays reach 30s while the grid is virtualised, so a scheduled retry
  // comfortably outlives the tile that scheduled it - scrolling past a
  // pending thumbnail would otherwise leave a timer setting state on a
  // component that no longer exists.
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset state when src changes. Bumping imageKey matters as much as the
    // flags: a cached image handed to a reused element can fire load before
    // this effect runs, and then there is no load event left to clear
    // isLoading with. A fresh element always fires one.
    setIsLoading(true);
    setHasError(false);
    setRetryCount(0);
    setImageKey((prev) => prev + 1);
    return () => {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, [src]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  };

  const handleError = () => {
    // Running off the end of the ladder is what "out of retries" means, so
    // there is no separate count to keep in step with it.
    const delay = RETRY_DELAYS[retryCount];
    if (delay === undefined) {
      setIsLoading(false);
      setHasError(true);
      onError?.();
      return;
    }
    retryTimer.current = setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setImageKey((prev) => prev + 1); // Force image reload
    }, delay);
  };

  return (
    <div className="relative w-full h-full">
      {isLoading && !hasError && <Skeleton className="absolute inset-0 w-full h-full" />}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
          <div className="text-center text-xs">
            {errorLabel ? (
              <p>{errorLabel}</p>
            ) : (
              <>
                <p>Thumbnail</p>
                <p>unavailable</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <img
          key={imageKey}
          src={src}
          alt={alt}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            isLoading ? "opacity-0" : "opacity-100",
            className,
          )}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
