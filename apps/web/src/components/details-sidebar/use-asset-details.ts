"use client"

import { useState, useEffect } from "react"
import { useQueryState, parseAsString } from "nuqs"
import { useQueryClient } from "@tanstack/react-query"
import { useStorageTree } from "@/hooks/use-storage-tree"
import { usePreloadMedia } from "@/hooks/use-preload-media"
import { useVideoStatus } from "@/hooks/use-video-status"
import { findAssetInTree } from "./utils"
import type { MediaFile } from "./types"

export function useAssetDetails(onOpenChange?: (open: boolean) => void) {
  const [assetId, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true })
  )
  const { data: treeData, isLoading: treeLoading } = useStorageTree()
  const queryClient = useQueryClient()
  const [asset, setAsset] = useState<MediaFile | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [optimizedSize, setOptimizedSize] = useState<number | null>(null)
  const [createdAt, setCreatedAt] = useState<Date | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
  // Use dedicated transform base URL (empty in Docker, falls back to apiBaseUrl without /api)
  const transformBaseUrl = process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL !== undefined
    ? process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL
    : apiBaseUrl.replace(/\/api$/, "")

  const fetchFileMetadata = async (path: string) => {
    try {
      // Encode each segment of the path separately to preserve slashes
      const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}/metadata`, {
        method: "GET",
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()

        if (data.size !== undefined) {
          setFileSize(data.size)
        }

        if (data.createdAt) {
          setCreatedAt(new Date(data.createdAt))
        }

        if (data.updatedAt) {
          setUpdatedAt(new Date(data.updatedAt))
        }
      }
    } catch (error) {
      console.error("Failed to fetch file metadata:", error)
    }
  }

  const fetchOptimizedSize = async (path: string) => {
    try {
      // Use the dedicated endpoint to get optimized size
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
      // Encode each segment separately to preserve slashes
      const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      
      const url = `${apiBaseUrl}/video-status/${encodedPath}/size`
      console.log("Fetching optimized size from:", url)
      
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
      })

      console.log("Optimized size response:", {
        status: response.status,
        ok: response.ok,
        url: response.url
      })

      if (response.ok) {
        const data = await response.json()
        console.log("Optimized size data:", data)
        if (data.size && data.status === 'ready') {
          setOptimizedSize(data.size)
          return
        }
      } else {
        const errorText = await response.text()
        console.warn("Failed to get optimized size:", response.status, errorText)
      }
      
      // Fallback: Try HEAD request on transform endpoint
      const headResponse = await fetch(`${transformBaseUrl}/t/${path}`, {
        method: "HEAD",
        credentials: "include",
      })

      if (headResponse.ok) {
        const videoStatus = headResponse.headers.get("X-Video-Status")
        const isOriginal = headResponse.headers.get("X-Original-Video") === "true"
        const optimizedSizeHeader = headResponse.headers.get("X-Optimized-Size")
        const contentLength = headResponse.headers.get("Content-Length")
        
        console.log("HEAD request headers:", {
          videoStatus,
          isOriginal,
          optimizedSizeHeader,
          contentLength
        })
        
        // If X-Optimized-Size header is present, use it directly
        if (optimizedSizeHeader) {
          setOptimizedSize(parseInt(optimizedSizeHeader, 10))
          return
        }
        
        // Only use Content-Length if it's the optimized version (not the original)
        if (videoStatus === "ready" && !isOriginal && contentLength) {
          const size = parseInt(contentLength, 10)
          if (size > 0) {
            setOptimizedSize(size)
            return
          }
        }
      }
      
      setOptimizedSize(null)
    } catch (error) {
      console.error("Failed to fetch optimized size:", error)
      setOptimizedSize(null)
    }
  }

  // Find asset when assetId or treeData changes
  useEffect(() => {
    if (assetId && treeData) {
      const foundAsset = findAssetInTree(treeData, assetId)
      setAsset(foundAsset)
      if (foundAsset) {
        onOpenChange?.(true)
      }
    } else {
      setAsset(null)
      if (!assetId) {
        onOpenChange?.(false)
      }
    }
  }, [assetId, treeData, onOpenChange])

  // Fetch metadata when asset changes
  useEffect(() => {
    if (asset) {
      fetchFileMetadata(asset.path)
      if (asset.type === "video") {
        fetchOptimizedSize(asset.path)
      } else {
        setOptimizedSize(null)
      }
    } else {
      setFileSize(null)
      setOptimizedSize(null)
      setCreatedAt(null)
      setUpdatedAt(null)
    }
  }, [asset])

  const mediaUrl = asset ? `${transformBaseUrl}/t/${asset.path}` : ""
  // For preview: use thumbnail extraction for videos with crop mode to avoid stretching
  const previewUrl = asset
    ? asset.type === "image"
      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${asset.path}`
      : `${transformBaseUrl}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${asset.path}`
    : ""

  // Preload preview media when asset changes
  // Note: Even videos are preloaded as "image" since we extract thumbnails
  usePreloadMedia(previewUrl, "image")

  // Track video processing status
  const videoPath = asset?.type === "video" ? asset.path : null
  const { status: videoStatus, progress: videoProgress } = useVideoStatus(videoPath, !!asset)

  // Retry fetching optimized size when video status becomes ready
  useEffect(() => {
    if (asset?.type === "video" && videoStatus === "ready" && !optimizedSize) {
      fetchOptimizedSize(asset.path)
    }
  }, [asset, videoStatus, optimizedSize])

  // Trigger job creation for videos when details are opened
  // This ensures the job is created even if the video hasn't been accessed yet
  // Do this immediately to ensure the job exists when status is checked
  useEffect(() => {
    if (asset?.type === "video" && asset.path && transformBaseUrl) {
      // Make a HEAD request to the video URL to trigger job creation immediately
      // This is a lightweight way to ensure the job is created
      fetch(`${transformBaseUrl}/t/${asset.path}`, {
        method: "HEAD",
        credentials: "include",
      }).catch((error) => {
        // Silently fail - this is just to trigger job creation
        console.debug("Failed to trigger video job creation:", error);
      });
    }
  }, [asset?.type, asset?.path, transformBaseUrl])

  const handleCopyUrl = () => {
    if (mediaUrl) {
      navigator.clipboard.writeText(mediaUrl)
    }
  }

  const handleDownload = () => {
    if (mediaUrl) {
      window.open(mediaUrl, "_blank")
    }
  }

  const handleOpenInNewTab = () => {
    if (mediaUrl) {
      window.open(mediaUrl, "_blank")
    }
  }

  const handleClose = () => {
    setAssetId(null)
    onOpenChange?.(false)
  }

  const handleDelete = async () => {
    if (!asset) return

    const confirmed = window.confirm(
      `Are you sure you want to delete "${asset.name}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setIsDeleting(true)
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
      
      // Encode each segment of the path separately to preserve slashes
      // This is necessary for files in subdirectories
      const encodedPath = asset.path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      
      const deleteUrl = `${apiBaseUrl}/storage/${encodedPath}`
      
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        // Try to parse JSON error response, but handle cases where it's not JSON
        let errorMessage = `Failed to delete file (${response.status})`
        try {
          const contentType = response.headers.get("content-type")
          if (contentType && contentType.includes("application/json")) {
            const errorBody = await response.json()
            errorMessage = errorBody.message || errorBody.error || errorMessage
          } else {
            const text = await response.text()
            if (text) {
              errorMessage = text
            }
          }
        } catch (parseError) {
          // If parsing fails, use the default error message
        }
        throw new Error(errorMessage)
      }

      // For successful responses, consume the body to avoid memory leaks
      // We don't need the data, so we can safely ignore parsing errors
      try {
        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
          await response.json()
        } else {
          await response.text()
        }
      } catch (parseError) {
        // Ignore parsing errors for success responses - we don't need the data
      }

      // Refresh the storage tree
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] })

      // Close the sidebar and clear selection
      setAssetId(null)
      onOpenChange?.(false)
    } catch (error) {
      console.error("Failed to delete file:", error)
      alert(error instanceof Error ? error.message : "Failed to delete file")
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    asset,
    assetId,
    setAssetId,
    treeLoading,
    fileSize,
    optimizedSize,
    createdAt,
    updatedAt,
    isDeleting,
    mediaUrl,
    previewUrl,
    apiBaseUrl,
    transformBaseUrl,
    videoStatus,
    videoProgress,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleDelete,
  }
}

