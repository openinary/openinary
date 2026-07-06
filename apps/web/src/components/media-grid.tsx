"use client";

import type React from "react";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  FileImage,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  File,
  Folder,
  Link2,
  Move,
  Pencil,
  Plus,
  Trash2,
  Upload,
  FolderPlus,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import UploadButtonWithDialog from "./upload-button-with-dialog";
import CreateFolderButtonWithDialog from "./create-folder-button-with-dialog";
import DefaultDialog from "./default-dialog";
import { UploadSection } from "./upload-section";
import { CreateFolderSection } from "./create-folder-section";
import { RenameSection } from "./rename-section";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { BulkActionBarContent } from "./bulk-action-bar";

type MediaFile = {
  id: string;
  name: string;
  path: string;
  type: "image" | "video";
  size?: number;
  mtime?: string;
};

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  psd: "image/vnd.adobe.photoshop",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function getMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || ext;
}

function formatListSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${parseFloat((bytes / 1024).toFixed(2))} KB`;
  return `${parseFloat((bytes / (1024 * 1024)).toFixed(2))} MB`;
}

function formatListDate(mtime?: string): string {
  if (!mtime) return "—";
  const date = new Date(mtime);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type FolderItem = {
  id: string;
  name: string;
  path: string;
};

type SelectionEntry = { path: string; name: string; kind: "file" | "folder" };

const BULK_TOAST_ID = "bulk-selection-bar";

function getFolderItemCount(items: TreeDataItem[], folderPath: string[]): number {
  let currentItems = items;
  for (const seg of folderPath) {
    const found = currentItems.find((i) => i.name === seg);
    if (!found?.children) return 0;
    currentItems = found.children;
  }
  return currentItems.length;
}

function getFolderPreviewItems(
  items: TreeDataItem[],
  folderPath: string[],
  limit = 4,
): { path: string; type: "image" | "video" }[] {
  let currentItems = items;
  for (const seg of folderPath) {
    const found = currentItems.find((i) => i.name === seg);
    if (!found?.children) return [];
    currentItems = found.children;
  }
  const previews: { path: string; type: "image" | "video" }[] = [];
  for (const item of currentItems) {
    if (previews.length >= limit) break;
    if (!item.children) {
      const lower = item.name.toLowerCase();
      const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".psd"].some(
        (ext) => lower.endsWith(ext),
      );
      const isVideo = [".mp4", ".mov", ".webm"].some((ext) => lower.endsWith(ext));
      if (isImage || isVideo) {
        previews.push({
          path: [...folderPath, item.name].join("/"),
          type: isImage ? "image" : "video",
        });
      }
    }
  }
  return previews;
}

function getFolderThumbnailUrl(
  transformBaseUrl: string,
  item: { path: string; type: "image" | "video" },
  size: "square" | "tall" | "large",
): string {
  if (item.type === "video") {
    const dims =
      size === "large" ? "w_500,h_500" : size === "tall" ? "w_250,h_500" : "w_250,h_250";
    return `${transformBaseUrl}/t/t_true,tt_5,f_webp,${dims},c_fill,q_70/${item.path}`;
  }
  const dims =
    size === "large" ? "w_500,h_500" : size === "tall" ? "w_250,h_500" : "w_250,h_250";
  return `${transformBaseUrl}/t/${dims},q_70/${item.path}`;
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
          size: item.size,
          mtime: item.mtime,
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
  view?: "grid" | "list";
}

export function MediaGrid({
  onMediaSelect,
  sidebarOpen = false,
  columns = 6,
  view = "grid",
}: MediaGridProps) {
  const { data: treeData, isLoading, error } = useStorageTree();
  const queryClient = useQueryClient();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useQueryState("folder");

  // Bulk selection state
  const [selection, setSelection] = useState<Map<string, SelectionEntry>>(
    new Map(),
  );
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const selectionMode = selection.size > 0;
  const isSelected = (id: string) => selection.has(id);
  const toggleSelection = (id: string, entry: SelectionEntry) => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, entry);
      }
      return next;
    });
  };
  const clearSelection = () => {
    setSelection(new Map());
    toast.dismiss(BULK_TOAST_ID);
  };
  // Bulk action handlers are defined later (they need apiBaseUrl); this ref
  // lets the effect below (which must run unconditionally, before any early
  // returns, to satisfy the Rules of Hooks) always call the latest versions.
  const bulkActionsRef = useRef({
    onDownload: () => {},
    onMove: (_destination: string) => {},
    onDelete: () => {},
  });

  // Dialog state for grid-level context menu
  const [gridUploadOpen, setGridUploadOpen] = useState(false);
  const [gridCreateFolderOpen, setGridCreateFolderOpen] = useState(false);

  // Dialog state for folder context menu (upload to folder)
  const [folderUploadTarget, setFolderUploadTarget] = useState<string | null>(null);

  // Dialog state for rename
  const [renameTarget, setRenameTarget] = useState<MediaFile | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderItem | null>(null);

  // Dialog state for delete confirmation
  const [deleteMediaTarget, setDeleteMediaTarget] = useState<MediaFile | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<string | null>(null);

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

  // Keep the floating bulk-action bar in sync with the current selection by
  // rendering it as a persistent toast (fixed id, infinite duration) so it
  // stacks with regular toasts instead of floating independently. Must run
  // unconditionally (before the early returns below) per the Rules of Hooks.
  useEffect(() => {
    if (selection.size === 0) {
      toast.dismiss(BULK_TOAST_ID);
      return;
    }
    toast.custom(
      () => (
        <BulkActionBarContent
          count={selection.size}
          onClear={clearSelection}
          onDownload={() => bulkActionsRef.current.onDownload()}
          onDelete={() => bulkActionsRef.current.onDelete()}
          onMove={(destination) => bulkActionsRef.current.onMove(destination)}
          moveTargets={moveTargets}
          canMoveToRoot={pathSegments.length > 0}
        />
      ),
      {
        id: BULK_TOAST_ID,
        duration: Infinity,
        unstyled: true,
        classNames: {
          toast: "!bg-transparent !border-0 !p-0 !shadow-none !w-fit !max-w-[90vw]",
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, moveTargets, pathSegments.length]);

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
              Learn More <ArrowUpRight className="mr-2 h-4 w-4" />
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
    toast.success(`Downloading "${name}"`);
  };

  const handleCopyUrl = (path: string, id?: string) => {
    navigator.clipboard.writeText(`${transformBaseUrl}/t/${path}`);
    toast.success("URL copied to clipboard");
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    }
  };

  const handleRenameMedia = async (path: string, newName: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");

    const rename = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to rename "${path}"`);
      }
    };

    try {
      await toast.promise(rename(), {
        loading: `Renaming "${path}"...`,
        success: `Renamed to "${newName}"`,
        error: (error) => (error instanceof Error ? error.message : `Failed to rename "${path}"`),
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyMedia = async (path: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");

    const copy = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}/copy`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to copy "${path}"`);
      }
    };

    try {
      await toast.promise(copy(), {
        loading: `Copying "${path}"...`,
        success: `Copied "${path}"`,
        error: (error) => (error instanceof Error ? error.message : `Failed to copy "${path}"`),
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    } catch {
      // error toast already shown
    }
  };

  const handleMoveMedia = async (path: string, destination: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");

    const move = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}/move`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to move "${path}"`);
      }
    };

    try {
      await toast.promise(move(), {
        loading: `Moving "${path}"...`,
        success: `Moved to "${destination || "Root"}"`,
        error: (error) => (error instanceof Error ? error.message : `Failed to move "${path}"`),
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    } catch {
      // error toast already shown
    }
  };

  const handleDeleteMedia = async (path: string, name: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");

    const del = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to delete "${name}"`);
      }
    };

    try {
      await toast.promise(del(), {
        loading: `Deleting "${name}"...`,
        success: `Deleted "${name}"`,
        error: (error) => (error instanceof Error ? error.message : `Failed to delete "${name}"`),
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    } catch {
      // error toast already shown
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
    toast.success(`Downloading "${name}.zip"`);
  };

  const handleRenameFolder = async (path: string, newName: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");

    const rename = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to rename "${path}"`);
      }
    };

    try {
      await toast.promise(rename(), {
        loading: `Renaming "${path}"...`,
        success: `Renamed to "${newName}"`,
        error: (error) => (error instanceof Error ? error.message : `Failed to rename "${path}"`),
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      // Update current folder path if we renamed the folder we're inside of
      if (path === folderPath) {
        const dir = path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
        setFolderPath(dir ? `${dir}/${newName}` : newName);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteFolder = async (path: string) => {
    const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");

    const del = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to delete folder "${path}"`);
      }
    };

    try {
      await toast.promise(del(), {
        loading: `Deleting "${path}"...`,
        success: `Deleted "${path}"`,
        error: (error) =>
          error instanceof Error ? error.message : `Failed to delete folder "${path}"`,
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      // Navigate up if we deleted the current folder
      if (path === folderPath) setFolderPath(null);
    } catch {
      // error toast already shown
    }
  };

  const handleBulkDownload = async () => {
    const entries = Array.from(selection.values());
    if (entries.length === 1) {
      // Single item: reuse the existing per-item download (no zip needed).
      const entry = entries[0];
      if (entry.kind === "folder") {
        handleDownloadFolder(entry.path, entry.name);
      } else {
        handleDownload(entry.path, entry.name);
      }
      return;
    }

    const downloadZip = async () => {
      const response = await fetch(`${apiBaseUrl}/download-zip`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: entries.map((entry) => entry.path) }),
      });
      if (!response.ok) {
        throw new Error("Failed to download items");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "download.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    try {
      await toast.promise(downloadZip(), {
        loading: `Zipping ${entries.length} item(s)...`,
        success: `Downloading ${entries.length} item(s) as a zip`,
        error: "Failed to download items",
      }).unwrap();
    } catch {
      // error toast already shown
    }
  };

  const handleBulkMove = async (destination: string) => {
    const entries = Array.from(selection.values());

    const move = async () => {
      const results = await Promise.allSettled(
        entries.map((entry) => {
          const encodedPath = entry.path
            .split("/")
            .map((s) => encodeURIComponent(s))
            .join("/");
          return fetch(`${apiBaseUrl}/storage/${encodedPath}/move`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destination }),
          }).then((response) => {
            if (!response.ok) throw new Error(`Failed to move "${entry.name}"`);
          });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw new Error(`${failed.length} of ${entries.length} item(s) failed to move`);
      }
    };

    try {
      await toast.promise(move(), {
        loading: `Moving ${entries.length} item(s)...`,
        success: `Moved to "${destination || "Root"}"`,
        error: (error) => (error instanceof Error ? error.message : "Failed to move items"),
      }).unwrap();
    } catch {
      // error toast already shown
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      clearSelection();
    }
  };

  const handleBulkDelete = async () => {
    const entries = Array.from(selection.values());

    const del = async () => {
      const results = await Promise.allSettled(
        entries.map((entry) => {
          const encodedPath = entry.path
            .split("/")
            .map((s) => encodeURIComponent(s))
            .join("/");
          return fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
            method: "DELETE",
            credentials: "include",
          }).then((response) => {
            if (!response.ok) throw new Error(`Failed to delete "${entry.name}"`);
          });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw new Error(`${failed.length} of ${entries.length} item(s) failed to delete`);
      }
    };

    try {
      await toast.promise(del(), {
        loading: `Deleting ${entries.length} item(s)...`,
        success: `Deleted ${entries.length} item(s)`,
        error: (error) => (error instanceof Error ? error.message : "Failed to delete items"),
      }).unwrap();
    } catch {
      // error toast already shown
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      clearSelection();
    }
  };

  // Keep the ref current so the effect declared earlier (before the early
  // returns) always invokes the latest handler closures.
  bulkActionsRef.current = {
    onDownload: handleBulkDownload,
    onMove: handleBulkMove,
    onDelete: () => setBulkDeleteConfirmOpen(true),
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
        contentClassName="max-w-[384px]"
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

      {/* Dialog for folder rename context menu */}
      <DefaultDialog
        isOpen={renameFolderTarget !== null}
        onClose={() => setRenameFolderTarget(null)}
        title={`Rename '${renameFolderTarget?.name ?? ""}'`}
        contentClassName="max-w-[384px]"
      >
        {renameFolderTarget && (
          <RenameSection
            currentName={renameFolderTarget.name}
            onRename={async (newName) => {
              const success = await handleRenameFolder(renameFolderTarget.path, newName);
              if (success) setRenameFolderTarget(null);
              return success;
            }}
          />
        )}
      </DefaultDialog>

      {/* Dialog for delete media confirmation */}
      <DeleteConfirmDialog
        isOpen={deleteMediaTarget !== null}
        onClose={() => setDeleteMediaTarget(null)}
        title="Delete Item"
        description={`This action cannot be undone. Are you sure you want to permanently delete "${deleteMediaTarget?.name ?? ""}"?`}
        onConfirm={async () => {
          if (!deleteMediaTarget) return;
          await handleDeleteMedia(deleteMediaTarget.path, deleteMediaTarget.name);
          setDeleteMediaTarget(null);
        }}
      />

      {/* Dialog for delete folder confirmation */}
      <DeleteConfirmDialog
        isOpen={deleteFolderTarget !== null}
        onClose={() => setDeleteFolderTarget(null)}
        title="Delete Folder"
        description={`This action cannot be undone. Are you sure you want to permanently delete "${deleteFolderTarget ?? ""}" and all its contents?`}
        onConfirm={async () => {
          if (!deleteFolderTarget) return;
          await handleDeleteFolder(deleteFolderTarget);
          setDeleteFolderTarget(null);
        }}
      />

      {/* Dialog for bulk delete confirmation */}
      <DeleteConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        title="Delete Items"
        description={`This action cannot be undone. Are you sure you want to permanently delete ${selection.size} item(s)?`}
        onConfirm={async () => {
          await handleBulkDelete();
          setBulkDeleteConfirmOpen(false);
        }}
      />

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
                const previewItems = treeData
                  ? getFolderPreviewItems(treeData, [...pathSegments, folder.name])
                  : [];
                const renderPreview = (
                  item: { path: string; type: "image" | "video" },
                  size: "square" | "tall" | "large",
                ) =>
                  item.type === "video" ? (
                    <VideoThumbnail
                      src={getFolderThumbnailUrl(transformBaseUrl, item, size)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <img
                      src={getFolderThumbnailUrl(transformBaseUrl, item, size)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  );
                return (
                  <ContextMenu key={folder.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "group relative w-[190px] h-[180px] rounded-lg overflow-hidden border border-border bg-muted/30 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md",
                          isSelected(folder.id) && "ring-2 ring-primary border-primary",
                        )}
                        onClick={() => handleFolderClick(folder.path)}
                      >
                        <div
                          className={cn(
                            "absolute top-2 left-2 z-10 transition-opacity",
                            selectionMode || isSelected(folder.id)
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected(folder.id)}
                            onCheckedChange={() =>
                              toggleSelection(folder.id, {
                                path: folder.path,
                                name: folder.name,
                                kind: "folder",
                              })
                            }
                          />
                        </div>
                        <div className="relative w-full h-full">
                          {previewItems.length === 4 ? (
                            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                              {previewItems.map((item, i) => (
                                <div key={i} className="overflow-hidden">
                                  {renderPreview(item, "square")}
                                </div>
                              ))}
                            </div>
                          ) : previewItems.length === 3 ? (
                            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                              <div className="overflow-hidden row-span-2">
                                {renderPreview(previewItems[0], "tall")}
                              </div>
                              {previewItems.slice(1).map((item, i) => (
                                <div key={i} className="overflow-hidden">
                                  {renderPreview(item, "square")}
                                </div>
                              ))}
                            </div>
                          ) : previewItems.length === 2 ? (
                            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                              {previewItems.map((item, i) => (
                                <div key={i} className="overflow-hidden">
                                  {renderPreview(item, "tall")}
                                </div>
                              ))}
                            </div>
                          ) : previewItems.length === 1 ? (
                            renderPreview(previewItems[0], "large")
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted/30">
                              <Folder
                                className="h-8 w-8 text-muted-foreground"
                                strokeWidth={1.5}
                              />
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 max-w-full bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 text-left">
                          <p className="text-sm font-medium text-white truncate">{folder.name}</p>
                          <p className="text-xs text-white/70">
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
                        <Upload className="h-4 w-4" />
                        Upload to folder
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          const target = folder;
                          setTimeout(() => setRenameFolderTarget(target), 0);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Rename
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDownloadFolder(folder.path, folder.name);
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download folder
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          const path = folder.path;
                          setTimeout(() => setDeleteFolderTarget(path), 0);
                        }}
                        variant="destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete folder
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>

            {files.length > 0 && view === "grid" && (
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
                          className={cn(
                            "group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md",
                            isSelected(media.id) && "ring-2 ring-primary border-primary",
                          )}
                          onClick={() => onMediaSelect(media)}
                          onMouseEnter={() => {
                            setHoveredId(media.id);
                            handleMediaHover(media);
                          }}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <div
                            className={cn(
                              "absolute top-2 left-2 z-10 transition-opacity",
                              selectionMode || isSelected(media.id)
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected(media.id)}
                              onCheckedChange={() =>
                                toggleSelection(media.id, {
                                  path: media.path,
                                  name: media.name,
                                  kind: "file",
                                })
                              }
                            />
                          </div>
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
                          <File className="h-4 w-4" />
                          Open
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => setTimeout(() => setRenameTarget(media), 0)}>
                          <Pencil className="h-4 w-4" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCopyMedia(media.path)}>
                          <Copy className="h-4 w-4" />
                          Make a copy
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <Move className="h-4 w-4" />
                            Move to
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent
                            className="w-48 max-h-[400px] overflow-y-auto"
                            style={{
                              maskImage:
                                "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
                              WebkitMaskImage:
                                "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
                            }}
                          >
                            {pathSegments.length > 0 && (
                              <ContextMenuItem onClick={() => handleMoveMedia(media.path, "")}>
                                <Folder className="h-4 w-4" />
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
                                  <Folder className="h-4 w-4" />
                                  {target.label}
                                </ContextMenuItem>
                              ))
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuItem onClick={() => handleDownload(media.path, media.name)}>
                          <Download className="h-4 w-4" />
                          Download
                          <ContextMenuShortcut>{mac ? "⇧⌘D" : "Ctrl Shift D"}</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => setTimeout(() => setDeleteMediaTarget(media), 0)}
                          variant="destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}

            {files.length > 0 && view === "list" && (
              <div className="rounded-lg border border-border overflow-hidden">
                {files.map((media) => {
                  const isHovered = hoveredId === media.id;
                  // Reuse the exact same transformed URL as the grid view so the
                  // transform server's cache is shared instead of generating a
                  // second thumbnail variant.
                  const thumbnailUrl =
                    media.type === "image"
                      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
                      : `${transformBaseUrl}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${media.path}`;

                  return (
                    <ContextMenu key={media.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            "group flex items-center gap-4 px-3 py-2 border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50",
                            isSelected(media.id) && "bg-muted/40",
                          )}
                          onClick={() => onMediaSelect(media)}
                          onMouseEnter={() => {
                            setHoveredId(media.id);
                            handleMediaHover(media);
                          }}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <div
                            className="relative h-6 w-6 shrink-0 overflow-hidden rounded bg-muted/50 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelection(media.id, {
                                path: media.path,
                                name: media.name,
                                kind: "file",
                              });
                            }}
                          >
                            {media.type === "image" ? (
                              <img
                                src={thumbnailUrl}
                                alt={media.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <VideoThumbnail
                                src={thumbnailUrl}
                                alt={media.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            )}
                            <div
                              className={cn(
                                "absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity",
                                selectionMode || isSelected(media.id)
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100",
                              )}
                            >
                              <Checkbox
                                checked={isSelected(media.id)}
                                onCheckedChange={() =>
                                  toggleSelection(media.id, {
                                    path: media.path,
                                    name: media.name,
                                    kind: "file",
                                  })
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="size-4"
                              />
                            </div>
                          </div>
                          <p
                            className="min-w-0 flex-1 truncate text-sm"
                            title={media.name}
                          >
                            {media.name}
                          </p>
                          <span className="w-32 shrink-0 text-right text-xs text-muted-foreground">
                            {getMimeType(media.name)}
                          </span>
                          <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                            {formatListSize(media.size)}
                          </span>
                          <div className="flex w-28 shrink-0 items-center justify-end">
                            {isHovered ? (
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  className="relative h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground disabled:cursor-default"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyUrl(media.path, media.id);
                                  }}
                                  disabled={copiedId === media.id}
                                  aria-label="Copy URL"
                                >
                                  <Check
                                    className={cn(
                                      "absolute inset-0 h-4 w-4 stroke-emerald-500 transition-all",
                                      copiedId === media.id
                                        ? "scale-100 opacity-100 blur-0"
                                        : "scale-0 opacity-0 blur-sm",
                                    )}
                                  />
                                  <Link2
                                    className={cn(
                                      "absolute inset-0 h-4 w-4 transition-all",
                                      copiedId === media.id
                                        ? "scale-0 opacity-0 blur-sm"
                                        : "scale-100 opacity-100 blur-0",
                                    )}
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(media.path, media.name);
                                  }}
                                  aria-label="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTimeout(() => setDeleteMediaTarget(media), 0);
                                  }}
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {formatListDate(media.mtime)}
                              </span>
                            )}
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-64">
                        <ContextMenuItem onClick={() => onMediaSelect(media)}>
                          <File className="h-4 w-4" />
                          Open
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => setTimeout(() => setRenameTarget(media), 0)}>
                          <Pencil className="h-4 w-4" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCopyMedia(media.path)}>
                          <Copy className="h-4 w-4" />
                          Make a copy
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <Move className="h-4 w-4" />
                            Move to
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent
                            className="w-48 max-h-[400px] overflow-y-auto"
                            style={{
                              maskImage:
                                "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
                              WebkitMaskImage:
                                "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
                            }}
                          >
                            {pathSegments.length > 0 && (
                              <ContextMenuItem onClick={() => handleMoveMedia(media.path, "")}>
                                <Folder className="h-4 w-4" />
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
                                  <Folder className="h-4 w-4" />
                                  {target.label}
                                </ContextMenuItem>
                              ))
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuItem onClick={() => handleCopyUrl(media.path)}>
                          <Link2 className="h-4 w-4" />
                          Copy URL
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleDownload(media.path, media.name)}>
                          <Download className="h-4 w-4" />
                          Download
                          <ContextMenuShortcut>{mac ? "⇧⌘D" : "Ctrl Shift D"}</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => setTimeout(() => setDeleteMediaTarget(media), 0)}
                          variant="destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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
            <Upload className="h-4 w-4" />
            Upload
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setTimeout(() => setGridCreateFolderOpen(true), 0)}>
            <FolderPlus className="h-4 w-4" />
            Create folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}
