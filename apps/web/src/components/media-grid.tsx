"use client";

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

function getFolderInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getFolderImages(
  items: TreeDataItem[],
  folderPath: string[],
  limit = 4,
): string[] {
  let currentItems = items;
  for (const seg of folderPath) {
    const found = currentItems.find((i) => i.name === seg);
    if (!found?.children) return [];
    currentItems = found.children;
  }
  const images: string[] = [];
  for (const item of currentItems) {
    if (images.length >= limit) break;
    if (!item.children) {
      const lower = item.name.toLowerCase();
      const isImage = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".avif",
        ".psd",
      ].some((ext) => lower.endsWith(ext));
      if (isImage) {
        images.push([...folderPath, item.name].join("/"));
      }
    }
  }
  return images;
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
}

export function MediaGrid({
  onMediaSelect,
  sidebarOpen = false,
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

  if (folders.length === 0 && files.length === 0) {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-4">
              <FileImage className="h-12 w-12 opacity-50" />
              <p>This folder is empty.</p>
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
      </>
    );
  }

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
          <div className={`grid ${gridColsClass} gap-4`}>
            {/* Render folders */}
            {folders.map((folder) => {
              const isHovered = hoveredId === folder.id;
              const folderImages = treeData
                ? getFolderImages(treeData, [...pathSegments, folder.name])
                : [];
              return (
                <ContextMenu key={folder.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
                      onClick={() => handleFolderClick(folder.path)}
                      onMouseEnter={() => setHoveredId(folder.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div className="relative w-full h-full">
                        {folderImages.length === 4 ? (
                          <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                            {folderImages.map((src, i) => (
                              <div key={i} className="overflow-hidden">
                                <img
                                  src={`${transformBaseUrl}/t/w_250,h_250,q_70/${src}`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        ) : folderImages.length === 3 ? (
                          <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                            <div className="overflow-hidden row-span-2">
                              <img
                                src={`${transformBaseUrl}/t/w_250,h_500,q_70/${folderImages[0]}`}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            {folderImages.slice(1).map((src, i) => (
                              <div key={i} className="overflow-hidden">
                                <img
                                  src={`${transformBaseUrl}/t/w_250,h_250,q_70/${src}`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        ) : folderImages.length === 2 ? (
                          <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                            {folderImages.map((src, i) => (
                              <div key={i} className="overflow-hidden">
                                <img
                                  src={`${transformBaseUrl}/t/w_250,h_500,q_70/${src}`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        ) : folderImages.length === 1 ? (
                          <img
                            src={`${transformBaseUrl}/t/w_500,h_500,q_70/${folderImages[0]}`}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <span className="text-muted-foreground text-2xl font-bold tracking-wide">
                              {getFolderInitials(folder.name)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        className={cn(
                          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 transition-opacity",
                          isHovered ? "opacity-100" : "opacity-0",
                        )}
                      >
                        <p className="text-white text-xs font-medium truncate">
                          {folder.name}
                        </p>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        const path = folder.path;
                        setTimeout(() => setFolderUploadTarget(path), 0);
                      }}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload to folder
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadFolder(folder.path, folder.name);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download folder
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={(e) => {
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

            {/* Render media files */}
            {files.map((media) => {
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
