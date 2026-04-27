"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { TreeDataItem } from "@/components/ui/tree-view";
import { useStorageTree } from "@/hooks/use-storage-tree";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import UploadButtonWithDialog from "../upload-button-with-dialog";
import { ArrowUpRight, FileImage } from "lucide-react";
import MediaGridFolderItem from "./media-grid-folder-item";
import MediaGridAssetItem from "./media-grid-asset-item";

type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: "image" | "video";
};

export type FolderItem = {
  id: string;
  name: string;
  path: string;
};

// Find items in a specific folder path
function findItemsInPath(
  items: TreeDataItem[],
  targetPath: string[],
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
    const isFolder = !!item.children;

    if (isFolder) {
      const folderPath =
        targetPath.length > 0
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
        lowerName.endsWith(".avif") ||
        lowerName.endsWith(".psd");

      const isVideo =
        lowerName.endsWith(".mp4") ||
        lowerName.endsWith(".mov") ||
        lowerName.endsWith(".webm");

      if (isImage || isVideo) {
        const filePath =
          targetPath.length > 0
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

export function MediaGrid({
  onMediaSelect,
  sidebarOpen = false,
}: MediaGridProps) {
  const { data: treeData, isLoading, error } = useStorageTree();
  const [folderPath, setFolderPath] = useQueryState("folder");

  // Parse folder path from URL - must be called before any conditional returns
  const pathSegments = useMemo(() => {
    return folderPath && folderPath.length > 0
      ? folderPath.split("/").filter(Boolean)
      : [];
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
              You haven&apos;t uploaded any media files yet. Get started by
              uploading your first image or video.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <UploadButtonWithDialog />
              <Button variant="outline" asChild>
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

  const handleFolderClick = (folderPath: string) => {
    setFolderPath(folderPath);
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
      {folders.map((folder) => (
        <MediaGridFolderItem
          key={folder.id}
          folder={folder}
          treeData={treeData}
          onClick={() => handleFolderClick(folder.path)}
        />
      ))}

      {/* Render media files */}
      {files.map((media) => (
        <MediaGridAssetItem
          key={media.id}
          media={media}
          onClick={() => onMediaSelect(media)}
        />
      ))}
    </div>
  );
}
