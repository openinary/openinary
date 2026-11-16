import type { MediaFile } from "../types";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 1536 -> "1.50 KB". Null (size not known) -> "Unknown". */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "Unknown";
  if (bytes === 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(2)} ${BYTE_UNITS[exponent]}`;
}

export function formatDate(date: Date | null): string {
  if (!date) return "Unknown";
  return date.toLocaleString();
}

export function getFileType(asset: MediaFile | null): string {
  if (!asset) return "Unknown";
  const ext = asset.name.split(".").pop()?.toUpperCase() || "";
  return `${ext} ${asset.type === "image" ? "Image" : "Video"}`;
}
