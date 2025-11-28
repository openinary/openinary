"use client"

import { useState, useEffect } from "react"
import { useQueryState, parseAsString } from "nuqs"
import { useQueryClient } from "@tanstack/react-query"
import { useStorageTree } from "@/hooks/use-storage-tree"
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
  const [createdAt, setCreatedAt] = useState<Date | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
    } else {
      setFileSize(null)
      setCreatedAt(null)
      setUpdatedAt(null)
    }
  }, [asset])

  const fetchFileMetadata = async (path: string) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
    try {
      const response = await fetch(`${apiBaseUrl}/t/${path}`, {
        method: "HEAD",
        credentials: "include",
      })

      if (response.ok) {
        const contentLength = response.headers.get("content-length")
        const lastModified = response.headers.get("last-modified")

        if (contentLength) {
          setFileSize(parseInt(contentLength, 10))
        }

        if (lastModified) {
          const date = new Date(lastModified)
          setUpdatedAt(date)
          setCreatedAt(date)
        }
      }
    } catch (error) {
      console.error("Failed to fetch file metadata:", error)
    }
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
  const mediaUrl = asset ? `${apiBaseUrl}/t/${asset.path}` : ""
  const previewUrl = asset
    ? asset.type === "image"
      ? `${apiBaseUrl}/t/resize:800x800/quality:90/${asset.path}`
      : `${apiBaseUrl}/t/${asset.path}`
    : ""

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
      // Use the path directly, same as other requests (e.g., /t/${path})
      // Hono will handle URL decoding automatically
      const response = await fetch(`${apiBaseUrl}/storage/${asset.path}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        // Try to parse JSON error response, but handle cases where it's not JSON
        let errorMessage = `Failed to delete file (${response.status})`
        try {
          const contentType = response.headers.get("content-type")
          if (contentType && contentType.includes("application/json")) {
            const error = await response.json()
            errorMessage = error.message || error.error || errorMessage
          } else {
            const text = await response.text()
            if (text) {
              errorMessage = text
            }
          }
        } catch (parseError) {
          // If parsing fails, use the default error message
          console.error("Failed to parse error response:", parseError)
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
      } catch {
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
    createdAt,
    updatedAt,
    isDeleting,
    mediaUrl,
    previewUrl,
    apiBaseUrl,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleDelete,
  }
}

