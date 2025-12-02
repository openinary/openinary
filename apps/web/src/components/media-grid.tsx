"use client";

import { useState, useMemo } from "react";
import { FileImage, FileVideo, Folder, ArrowUpRight } from "lucide-react";
import { useQueryState } from "nuqs";
import { useStorageTree } from "@/hooks/use-storage-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { preloadMedia } from "@/hooks/use-preload-media";
import type { TreeDataItem } from "@/components/ui/tree-view";

type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: "image" | "video";
};

type FolderItem = {
  id: string;
  name: string;
  path: string;
};

// Find items in a specific folder path
function findItemsInPath(
  items: TreeDataItem[],
  targetPath: string[]
): { folders: FolderItem[]; files: MediaFile[] } {
  const folders: FolderItem[] = [];
  const files: MediaFile[] = [];

  // Navigate to the target folder
  let currentItems = items;
  for (const pathSegment of targetPath) {
    const found = currentItems.find((item) => item.name === pathSegment);
    if (!found || !found.children) {
      return { folders, files }; // Path doesn't exist
    }
    currentItems = found.children;
  }

  // Process items in the current folder
  for (const item of currentItems) {
    const lowerName = item.name.toLowerCase();
    const isFolder = !!item.children && item.children.length > 0;

    if (isFolder) {
      const folderPath = targetPath.length > 0 
        ? `${targetPath.join("/")}/${item.name}`
        : item.name;
      folders.push({
        id: item.id,
        name: item.name,
        path: folderPath,
      });
    } else {
      // Check if it's a media file
      const isImage =
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".webp") ||
        lowerName.endsWith(".gif") ||
        lowerName.endsWith(".avif");

      const isVideo =
        lowerName.endsWith(".mp4") ||
        lowerName.endsWith(".mov") ||
        lowerName.endsWith(".webm");

      if (isImage || isVideo) {
        const filePath = targetPath.length > 0
          ? `${targetPath.join("/")}/${item.name}`
          : item.name;
        files.push({
          id: item.id,
          name: item.name,
          path: filePath,
          type: isImage ? "image" : "video",
        });
      }
    }
  }

  // Sort: folders first, then files
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files };
}

interface MediaGridProps {
  onMediaSelect: (media: MediaFile) => void;
  sidebarOpen?: boolean;
  onUploadClick?: () => void;
}

export function MediaGrid({ onMediaSelect, sidebarOpen = false, onUploadClick }: MediaGridProps) {
  const { data: treeData, isLoading, error } = useStorageTree();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useQueryState("folder");

  // Parse folder path from URL - must be called before any conditional returns
  const pathSegments = useMemo(() => {
    return folderPath && folderPath.length > 0 ? folderPath.split("/").filter(Boolean) : [];
  }, [folderPath]);

  // Get items in current folder - must be called before any conditional returns
  const { folders, files } = useMemo(() => {
    if (!treeData) return { folders: [], files: [] };
    return findItemsInPath(treeData, pathSegments);
  }, [treeData, pathSegments]);

  // Adjust grid columns based on sidebar state
  const gridColsClass = sidebarOpen
    ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  if (isLoading) {
    return (
      <div className={`grid ${gridColsClass} gap-4`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Failed to load media files. Please try again.</p>
      </div>
    );
  }

  if (!treeData || treeData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileImage />
            </EmptyMedia>
            <EmptyTitle>No Media Files Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t uploaded any media files yet. Get started by uploading
              your first image or video.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              {onUploadClick && (
                <Button onClick={onUploadClick}>Upload</Button>
              )}
              <Button
                variant="outline"
                asChild
              >
                <a
                  href="https://docs.openinary.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Docs
                </a>
              </Button>
            </div>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm"
          >
            <a
              href="https://docs.openinary.dev/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn More <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </Empty>
      </div>
    );
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  // Use dedicated transform base URL (empty in Docker, falls back to apiBaseUrl without /api)
  const transformBaseUrl = process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL !== undefined
    ? process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL
    : apiBaseUrl.replace(/\/api$/, "");

  const handleFolderClick = (folderPath: string) => {
    setFolderPath(folderPath);
  };

  // Preload preview when hovering over a media item
  const handleMediaHover = (media: MediaFile) => {
    const previewUrl = media.type === "image"
      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
      : `${transformBaseUrl}/t/${media.path}`;
    preloadMedia(previewUrl, media.type);
  };

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-4">
        <FileImage className="h-12 w-12 opacity-50" />
        <p>This folder is empty.</p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridColsClass} gap-4`}>
      {/* Render folders */}
      {folders.map((folder) => {
        const isHovered = hoveredId === folder.id;
        return (
          <div
            key={folder.id}
            className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary hover:shadow-md"
            onClick={() => handleFolderClick(folder.path)}
            onMouseEnter={() => setHoveredId(folder.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="relative w-full h-full bg-muted flex items-center justify-center">
              <Folder className="h-16 w-16 text-muted-foreground" />
            </div>
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 transition-opacity",
                isHovered ? "opacity-100" : "opacity-0"
              )}
            >
              <p className="text-white text-xs font-medium truncate">{folder.name}</p>
            </div>
          </div>
        );
      })}

      {/* Render media files */}
      {files.map((media) => {
        const thumbnailUrl = `${apiBaseUrl}/t/w_500,h_500,q_80/${media.path}`;
        const isHovered = hoveredId === media.id;

        return (
          <div
            key={media.id}
            className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary hover:shadow-md"
            onClick={() => onMediaSelect(media)}
            onMouseEnter={() => {
              setHoveredId(media.id);
              handleMediaHover(media);
            }}
            onMouseLeave={() => setHoveredId(null)}
          >
            {media.type === "image" ? (
              <img
                src={thumbnailUrl}
                alt={media.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="relative w-full h-full bg-muted flex items-center justify-center">
                <FileVideo className="h-12 w-12 text-muted-foreground" />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[8px] border-l-primary border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-1" />
                  </div>
                </div>
              </div>
            )}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 transition-opacity",
                isHovered ? "opacity-100" : "opacity-0"
              )}
            >
              <p className="text-white text-xs font-medium truncate">{media.name}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

