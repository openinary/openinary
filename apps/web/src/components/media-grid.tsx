"use client";

import type React from "react";
import { useState, useMemo } from "react";
import {
  FileImage,
  FileVideo,
  ArrowUpRight,
  Copy,
  Download,
  File,
  Folder,
  Move,
  Pencil,
  Plus,
  Trash2,
  Upload,
  FolderPlus,
  FolderX,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { isMac } from "@/lib/utils";
import { preloadMedia } from "@/hooks/use-preload-media";
import { VideoThumbnail } from "@/components/video-thumbnail";
import type { TreeDataItem } from "@/components/ui/tree-view";
import UploadButtonWithDialog from "./upload-button-with-dialog";
import CreateFolderButtonWithDialog from "./create-folder-button-with-dialog";
import DefaultDialog from "./default-dialog";
import { UploadSection } from "./upload-section";
import { CreateFolderSection } from "./create-folder-section";
import { RenameSection } from "./rename-section";

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

function getFolderItemCount(items: TreeDataItem[], folderPath: string[]): number {
  let currentItems = items;
  for (const seg of folderPath) {
    const found = currentItems.find((i) => i.name === seg);
    if (!found?.children) return 0;
    currentItems = found.children;
  }
  return currentItems.length;
}

// Flatten all folders in the tree into a list of full paths, for "Move to" menus
function flattenFolders(
  items: TreeDataItem[],
  prefix = "",
): { path: string; label: string }[] {
  const result: { path: string; label: string }[] = [];
  for (const item of items) {
    if (item.children) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      result.push({ path: fullPath, label: fullPath });
      result.push(...flattenFolders(item.children, fullPath));
    }
  }
  return result;
}

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
  columns?: number;
}

export function MediaGrid({
  onMediaSelect,
  sidebarOpen = false,
  columns = 6,
}: MediaGridProps) {
  const { data: treeData, isLoading, error } = useStorageTree();
  const queryClient = useQueryClient();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useQueryState("folder");

  // Dialog state for grid-level context menu
  const [gridUploadOpen, setGridUploadOpen] = useState(false);
  const [gridCreateFolderOpen, setGridCreateFolderOpen] = useState(false);

  // Dialog state for folder context menu (upload to folder)
  const [folderUploadTarget, setFolderUploadTarget] = useState<string | null>(null);

  // Dialog state for rename
  const [renameTarget, setRenameTarget] = useState<MediaFile | null>(null);

  const mac = isMac();

  // Parse folder path from URL - must be called before any conditional returns
  const pathSegments = useMemo(() => {
    return folderPath && folderPath.length > 0
      ? folderPath.split("/").filter(Boolean)
      : [];
  }, [folderPath]);

  const currentDir = pathSegments.join("/");

  // Get items in current folder - must be called before any conditional returns
  const { folders, files } = useMemo(() => {
    if (!treeData) return { folders: [], files: [] };
    return findItemsInPath(treeData, pathSegments);
  }, [treeData, pathSegments]);

  // Flattened folder list for "Move to" submenus, excluding the current folder
  const moveTargets = useMemo(() => {
    if (!treeData) return [];
    return flattenFolders(treeData).filter((f) => f.path !== currentDir);
  }, [treeData, currentDir]);

  const gridStyle = {
    gridTemplateColumns: `repeat(${sidebarOpen ? Math.max(2, columns - 1) : columns}, minmax(0, 1fr))`,
  };

  if (isLoading) {
    return (
      <div className="grid gap-4" style={gridStyle}>
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

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  // Use dedicated transform base URL (empty in Docker, falls back to apiBaseUrl without /api)
  const transformBaseUrl =
    process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL !== undefined
      ? process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL
      : apiBaseUrl.replace(/\/api$/, "");

  const handleFolderClick = (folderPath: string) => {
    setFolderPath(folderPath);
  };

  // Preload preview when hovering over a media item
  const handleMediaHover = (media: MediaFile) => {
    const previewUrl =
      media.type === "image"
        ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
        : `${transformBaseUrl}/t/${media.path}`;
    preloadMedia(previewUrl, media.type);
  };

  const handleDownload = (path: string, name: string) => {
    const downloadUrl = `${apiBaseUrl}/download/${path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/")}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRenameMedia = async (path: string, newName: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      return true;
    }
    const data = await response.json().catch(() => null);
    alert(data?.message || `Failed to rename "${path}"`);
    return false;
  };

  const handleCopyMedia = async (path: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}/copy`, {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    } else {
      const data = await response.json().catch(() => null);
      alert(data?.message || `Failed to copy "${path}"`);
    }
  };

  const handleMoveMedia = async (path: string, destination: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}/move`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination }),
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    } else {
      const data = await response.json().catch(() => null);
      alert(data?.message || `Failed to move "${path}"`);
    }
  };

  const handleDeleteMedia = async (path: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    } else {
      alert(`Failed to delete "${name}"`);
    }
  };

  const handleDownloadFolder = (path: string, name: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const a = document.createElement("a");
    a.href = `${apiBaseUrl}/download-folder/${encodedPath}`;
    a.download = `${name}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDeleteFolder = async (path: string) => {
    if (!confirm(`Delete '${path}' and all its contents? This action cannot be undone.`)) return;
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
    const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      // Navigate up if we deleted the current folder
      if (path === folderPath) setFolderPath(null);
    } else {
      alert(`Failed to delete folder "${path}"`);
    }
  };

  return (
    <>
      {/* Dialogs for grid-level context menu */}
      <DefaultDialog
        isOpen={gridUploadOpen}
        onClose={() => setGridUploadOpen(false)}
        title={`Upload Files${folderPath ? ` to '${folderPath}'` : ""}`}
      >
        <UploadSection uploadToFolder={folderPath ?? undefined} />
      </DefaultDialog>
      <DefaultDialog
        isOpen={gridCreateFolderOpen}
        onClose={() => setGridCreateFolderOpen(false)}
        title={`Create folder${folderPath ? ` inside '${folderPath}'` : ""}`}
      >
        <CreateFolderSection
          uploadToFolder={folderPath ?? undefined}
          onSuccessfulCreate={() => setGridCreateFolderOpen(false)}
        />
      </DefaultDialog>

      {/* Dialog for folder upload context menu */}
      <DefaultDialog
        isOpen={folderUploadTarget !== null}
        onClose={() => setFolderUploadTarget(null)}
        title={`Upload Files to '${folderUploadTarget}'`}
      >
        <UploadSection uploadToFolder={folderUploadTarget ?? undefined} />
      </DefaultDialog>

      {/* Dialog for rename context menu */}
      <DefaultDialog
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={`Rename '${renameTarget?.name ?? ""}'`}
      >
        {renameTarget && (
          <RenameSection
            currentName={renameTarget.name}
            onRename={async (newName) => {
              const success = await handleRenameMedia(renameTarget.path, newName);
              if (success) setRenameTarget(null);
              return success;
            }}
          />
        )}
      </DefaultDialog>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <CreateFolderButtonWithDialog
                uploadToFolder={folderPath || undefined}
                trigger={
                  <div className="group relative w-[190px] h-[180px] rounded-lg border border-dashed border-border cursor-pointer transition-all hover:border-primary/40 hover:bg-muted/30 flex flex-col items-center justify-center gap-2">
                    <Plus
                      className="h-6 w-6 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <p className="text-sm text-muted-foreground">New folder</p>
                  </div>
                }
              />
              {folders.map((folder) => {
                const itemCount = treeData
                  ? getFolderItemCount(treeData, [...pathSegments, folder.name])
                  : 0;
                return (
                  <ContextMenu key={folder.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className="group relative w-[190px] h-[180px] rounded-lg border border-border bg-muted/30 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md flex items-center justify-center"
                        onClick={() => handleFolderClick(folder.path)}
                      >
                        <Folder
                          className="h-8 w-8 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <div className="absolute bottom-0 left-0 max-w-full p-3 text-left">
                          <p className="text-sm font-medium truncate">{folder.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {itemCount} {itemCount === 1 ? "item" : "items"}
                          </p>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          const path = folder.path;
                          setTimeout(() => setFolderUploadTarget(path), 0);
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload to folder
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDownloadFolder(folder.path, folder.name);
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download folder
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.path);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <FolderX className="mr-2 h-4 w-4" />
                        Delete folder
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>

            {files.length > 0 && (
              <div className="grid gap-4" style={gridStyle}>
                {files.map((media) => {
                  // For images: resize and optimize
                  // For videos: extract thumbnail at 1 second as jpg image with crop mode to avoid stretching
                  const thumbnailUrl =
                    media.type === "image"
                      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
                      : `${transformBaseUrl}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${media.path}`;
                  const isHovered = hoveredId === media.id;

                  return (
                    <ContextMenu key={media.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
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
                            <VideoThumbnail
                              src={thumbnailUrl}
                              alt={media.name}
                              className="transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          )}
                          <div
                            className={cn(
                              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 transition-opacity",
                              isHovered ? "opacity-100" : "opacity-0",
                            )}
                          >
                            <p className="text-white text-xs font-medium truncate">
                              {media.name}
                            </p>
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-64">
                        <ContextMenuItem onClick={() => onMediaSelect(media)}>
                          <File className="mr-2 h-4 w-4" />
                          Open
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => setTimeout(() => setRenameTarget(media), 0)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCopyMedia(media.path)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Make a copy
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <Move className="mr-2 h-4 w-4" />
                            Move to
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-48">
                            {pathSegments.length > 0 && (
                              <ContextMenuItem onClick={() => handleMoveMedia(media.path, "")}>
                                <Folder className="mr-2 h-4 w-4" />
                                Root
                              </ContextMenuItem>
                            )}
                            {moveTargets.length === 0 && pathSegments.length === 0 ? (
                              <ContextMenuItem disabled>No folders available</ContextMenuItem>
                            ) : (
                              moveTargets.map((target) => (
                                <ContextMenuItem
                                  key={target.path}
                                  onClick={() => handleMoveMedia(media.path, target.path)}
                                >
                                  <Folder className="mr-2 h-4 w-4" />
                                  {target.label}
                                </ContextMenuItem>
                              ))
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuItem onClick={() => handleDownload(media.path, media.name)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                          <ContextMenuShortcut>{mac ? "⇧⌘D" : "Ctrl Shift D"}</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => handleDeleteMedia(media.path, media.name)}
                          variant="destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setTimeout(() => setGridUploadOpen(true), 0)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setTimeout(() => setGridCreateFolderOpen(true), 0)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Create folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}
