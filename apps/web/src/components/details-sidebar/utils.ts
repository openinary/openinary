import type { TreeDataItem } from "@/components/ui/tree-view"
import type { MediaFile } from "./types"

export function findAssetInTree(
  items: TreeDataItem[],
  assetId: string,
  basePath: string = ""
): MediaFile | null {
  for (const item of items) {
    const currentPath = basePath ? `${basePath}/${item.name}` : item.name
    const lowerName = item.name.toLowerCase()

    const isImage =
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".webp") ||
      lowerName.endsWith(".gif") ||
      lowerName.endsWith(".avif")

    const isVideo =
      lowerName.endsWith(".mp4") ||
      lowerName.endsWith(".mov") ||
      lowerName.endsWith(".webm")

    if ((isImage || isVideo) && item.id === assetId) {
      return {
        id: item.id,
        name: item.name,
        path: currentPath,
        type: isImage ? "image" : "video",
      }
    }

    if (item.children && item.children.length > 0) {
      const found = findAssetInTree(item.children, assetId, currentPath)
      if (found) return found
    }
  }
  return null
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatDate(date: Date | null): string {
  if (!date) return "Unknown"
  return date.toLocaleString()
}

export function getFileType(asset: MediaFile | null): string {
  if (!asset) return "Unknown"
  const ext = asset.name.split(".").pop()?.toUpperCase() || ""
  return `${ext} ${asset.type === "image" ? "Image" : "Video"}`
}

