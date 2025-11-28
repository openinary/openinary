"use client"

import { useEffect, useRef } from "react"

// Global cache to prevent duplicate preloads across components
const globalPreloadedCache = new Set<string>()

/**
 * Check if connection is slow (using Network Information API if available)
 */
function isSlowConnection(): boolean {
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const connection = (navigator as any).connection
    if (connection) {
      // Skip preloading on slow connections (2G, slow-2G, or save-data mode)
      return (
        connection.effectiveType === "2g" ||
        connection.effectiveType === "slow-2g" ||
        connection.saveData === true
      )
    }
  }
  return false
}

/**
 * Hook to preload media (images or videos) for faster display
 * Only preloads if not already cached and connection is not slow
 */
export function usePreloadMedia(url: string | null, type: "image" | "video") {
  const preloadedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!url) return

    // Skip if already preloaded globally
    if (globalPreloadedCache.has(url)) return
    if (preloadedRef.current.has(url)) return

    // Skip preloading on slow connections to save bandwidth
    if (isSlowConnection()) return

    if (type === "image") {
      const img = new Image()
      img.src = url
      globalPreloadedCache.add(url)
      preloadedRef.current.add(url)
    } else {
      const video = document.createElement("video")
      video.src = url
      video.preload = "auto"
      globalPreloadedCache.add(url)
      preloadedRef.current.add(url)
    }
  }, [url, type])
}

/**
 * Preload a media URL immediately (for use in event handlers)
 * Only preloads if not already cached and connection is not slow
 */
export function preloadMedia(url: string, type: "image" | "video") {
  // Skip if already preloaded
  if (globalPreloadedCache.has(url)) return

  // Skip preloading on slow connections to save bandwidth
  if (isSlowConnection()) return

  if (type === "image") {
    const img = new Image()
    img.src = url
    globalPreloadedCache.add(url)
  } else {
    const video = document.createElement("video")
    video.src = url
    video.preload = "auto"
    globalPreloadedCache.add(url)
  }
}

