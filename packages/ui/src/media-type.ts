import type { MediaType } from "./types";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".psd"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

export function getMediaType(name: string): MediaType | null {
  const lower = name.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "image";
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
  return null;
}
