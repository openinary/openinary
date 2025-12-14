"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface VideoThumbnailProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Video thumbnail component with automatic retry
 * Handles the case where thumbnail is still being generated on the server
 */
export function VideoThumbnail({
  src,
  alt,
  className,
  loading = "lazy",
  onLoad,
  onError,
}: VideoThumbnailProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [imageKey, setImageKey] = useState(0);

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 3000]; // 1s, 2s, 3s

  useEffect(() => {
    // Reset state when src changes
    setIsLoading(true);
    setHasError(false);
    setRetryCount(0);
    setImageKey((prev) => prev + 1);
  }, [src]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  };

  const handleError = () => {
    // If we haven't exhausted retries, try again after a delay
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        setImageKey((prev) => prev + 1); // Force image reload
      }, delay);
    } else {
      // All retries exhausted
      setIsLoading(false);
      setHasError(true);
      onError?.();
    }
  };

  return (
    <div className="relative w-full h-full">
      {isLoading && !hasError && (
        <Skeleton className="absolute inset-0 w-full h-full" />
      )}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
          <div className="text-center text-xs">
            <p>Thumbnail</p>
            <p>unavailable</p>
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
            className
          )}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}







