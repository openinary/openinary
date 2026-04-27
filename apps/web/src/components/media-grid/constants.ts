export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".psd",
] as const;

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

export const TRANSFORM_BASE_URL = (() => {
  const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL !== undefined
    ? process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL
    : api.replace(/\/api$/, "");
})();

export const GRID_COLS = {
  sidebarOpen:
    "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  sidebarClosed:
    "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
} as const;

export const ITEM_CLASS =
  "group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md";
