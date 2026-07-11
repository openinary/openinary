import type { MediaFile } from "./types"

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

