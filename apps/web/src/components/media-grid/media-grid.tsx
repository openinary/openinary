"use client";

import { useState, useMemo } from "react";
import { FileImage, ArrowUpRight } from "lucide-react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { useStorageTree } from "@/hooks/use-storage-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import UploadButtonWithDialog from "@/components/upload-button-with-dialog";
import { GRID_COLS } from "./constants";
import { FolderCard } from "./folder-card";
import { MediaCard } from "./media-card";
import { MediaListView } from "./media-list-view";
import { ViewToggle } from "./view-toggle";
import { findItemsInPath, getFolderImages } from "./utils";
import type { MediaFile, MediaRow, ViewMode } from "./types";

export interface MediaGridProps {
  onMediaSelect: (media: MediaFile) => void;
  sidebarOpen?: boolean;
}

const VIEW_OPTIONS = ["grid", "list"] as const;

export function MediaGrid({ onMediaSelect, sidebarOpen = false }: MediaGridProps) {
  const { data: treeData, isLoading, error } = useStorageTree();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useQueryState("folder");
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(VIEW_OPTIONS).withDefault("grid"),
  );

  const pathSegments = useMemo(
    () => (folderPath ? folderPath.split("/").filter(Boolean) : []),
    [folderPath],
  );

  const { folders, files } = useMemo(
    () =>
      treeData
        ? findItemsInPath(treeData, pathSegments)
        : { folders: [], files: [] },
    [treeData, pathSegments],
  );

  const listRows = useMemo<MediaRow[]>(() => {
    const folderRows: MediaRow[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      path: f.path,
      rowType: "folder",
    }));
    const fileRows: MediaRow[] = files.map((f) => ({
      id: f.id,
      name: f.name,
      path: f.path,
      rowType: f.type,
    }));
    return [...folderRows, ...fileRows];
  }, [folders, files]);

  const gridClass = `grid ${sidebarOpen ? GRID_COLS.sidebarOpen : GRID_COLS.sidebarClosed} gap-4`;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <div className={gridClass}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
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

  const handleListRowClick = (row: MediaRow) => {
    if (row.rowType === "folder") {
      setFolderPath(row.path);
    } else {
      onMediaSelect({ id: row.id, name: row.name, path: row.path, type: row.rowType });
    }
  };

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <ViewToggle view={view as ViewMode} onViewChange={setView} />
        </div>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-4">
          <FileImage className="h-12 w-12 opacity-50" />
          <p>This folder is empty.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ViewToggle view={view as ViewMode} onViewChange={setView} />
      </div>

      {view === "list" ? (
        <MediaListView rows={listRows} onRowClick={handleListRowClick} />
      ) : (
        <div className={gridClass}>
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              images={
                treeData
                  ? getFolderImages(treeData, [...pathSegments, folder.name])
                  : []
              }
              isHovered={hoveredId === folder.id}
              onClick={() => setFolderPath(folder.path)}
              onMouseEnter={() => setHoveredId(folder.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          ))}
          {files.map((media) => (
            <MediaCard
              key={media.id}
              media={media}
              isHovered={hoveredId === media.id}
              onClick={() => onMediaSelect(media)}
              onMouseEnter={() => setHoveredId(media.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
