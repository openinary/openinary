"use client";

import type React from "react";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  FileImage,
  FileVideo,
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
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "./ui/empty";
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
} from "./ui/context-menu";
import { Checkbox } from "./ui/checkbox";
import { cn, isMac, toAbsoluteUrl } from "./lib/utils";
import { useOpeninary } from "./provider/openinary-provider";
import { VideoThumbnail } from "./components/video-thumbnail";
import { DefaultDialog } from "./components/default-dialog";
import { RenameSection } from "./components/rename-section";
import { DeleteConfirmDialog } from "./components/delete-confirm-dialog";
import {
  invalidateStorage,
  useStorageLevel,
} from "./hooks/use-storage-tree";
import { useHideThumbnails } from "./hooks/use-hide-thumbnails";
import { useFolderSummaries } from "./hooks/use-folder-summaries";
import { preloadMedia } from "./hooks/use-preload-media";
import { MoveToNavigator } from "./components/move-to-navigator";
import { UploadButtonWithDialog } from "./components/upload-button-with-dialog";
import { CreateFolderButtonWithDialog } from "./components/create-folder-button-with-dialog";
import { UploadSection } from "./components/upload-section";
import { CreateFolderSection } from "./components/create-folder-section";
import { BulkActionBarContent } from "./components/bulk-action-bar";
import type { MediaFile } from "./types";

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

function FileTypeIcon({
  type,
  className,
}: {
  type: "image" | "video";
  className?: string;
}) {
  const Icon = type === "video" ? FileVideo : FileImage;
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted/30",
        className,
      )}
    >
      <Icon className="h-1/3 w-1/3 text-muted-foreground" strokeWidth={1.5} />
    </div>
  );
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
  name: string;
  path: string;
};

type SelectionEntry = { path: string; name: string; kind: "file" | "folder" };

const BULK_TOAST_ID = "bulk-selection-bar";

function getFolderThumbnailUrl(
  transformBaseUrl: string,
  item: { path: string; type: "image" | "video" },
  size: "square" | "tall" | "large",
): string {
  if (item.type === "video") {
    const dims =
      size === "large"
        ? "w_500,h_500"
        : size === "tall"
          ? "w_250,h_500"
          : "w_250,h_250";
    return `${transformBaseUrl}/t/t_true,tt_5,f_webp,${dims},c_fill,q_70/${item.path}`;
  }
  const dims =
    size === "large"
      ? "w_500,h_500"
      : size === "tall"
        ? "w_250,h_500"
        : "w_250,h_250";
  return `${transformBaseUrl}/t/${dims},q_70/${item.path}`;
}

export interface MediaGridProps {
  onMediaSelect: (media: MediaFile) => void;
  sidebarOpen?: boolean;
  onUploadClick?: () => void;
  columns?: number;
  view?: "grid" | "list";
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Current folder, e.g. "photos/2024". Root is `null`. Lifted to the caller since this package doesn't dictate a router. */
  folderPath?: string | null;
  onFolderPathChange?: (folderPath: string | null) => void;
}

export function MediaGrid({
  onMediaSelect,
  sidebarOpen = false,
  columns = 6,
  view = "grid",
  scrollContainerRef,
  folderPath = null,
  onFolderPathChange,
}: MediaGridProps) {
  const { apiBaseUrl, transformBaseUrl, fetch } = useOpeninary();
  const [hideThumbnails] = useHideThumbnails();
  const queryClient = useQueryClient();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Context menu contents embed the full "Move to" folder list (potentially
  // thousands of items). Creating those React elements for every visible row
  // on every scroll-driven re-render blocks the main thread, so menu content
  // is only rendered for the hovered row or the row whose menu is open.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const setFolderPath = onFolderPathChange ?? (() => {});

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
  const [folderUploadTarget, setFolderUploadTarget] = useState<string | null>(
    null,
  );

  // Dialog state for rename
  const [renameTarget, setRenameTarget] = useState<MediaFile | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] =
    useState<FolderItem | null>(null);

  // Dialog state for delete confirmation
  const [deleteMediaTarget, setDeleteMediaTarget] = useState<MediaFile | null>(
    null,
  );
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<string | null>(
    null,
  );

  // Dialog state for move confirmation, so picking a destination in the
  // "Move to" picker doesn't fire the move on the same click that navigates
  // the picker - a slow move (e.g. a folder with thousands of objects) can't
  // be undone once started.
  const [moveMediaTarget, setMoveMediaTarget] = useState<{
    media: MediaFile;
    destination: string;
  } | null>(null);
  const [bulkMoveDestination, setBulkMoveDestination] = useState<{
    destination: string;
  } | null>(null);

  const mac = isMac();

  // Parse folder path from URL - must be called before any conditional returns
  const pathSegments = useMemo(() => {
    return folderPath && folderPath.length > 0
      ? folderPath.split("/").filter(Boolean)
      : [];
  }, [folderPath]);

  const currentDir = pathSegments.join("/");

  // Current level, loaded lazily per folder (sorted server-side)
  const { data: level, isLoading, error } = useStorageLevel(currentDir);
  const folders = useMemo(() => level?.folders ?? [], [level]);
  const files = useMemo(() => level?.files ?? [], [level]);

  const effectiveColumns = sidebarOpen ? Math.max(2, columns - 1) : columns;

  const gridStyle = {
    gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`,
  };

  // Grid view is windowed a row at a time (one CSS grid row per virtual
  // item); list view is windowed one file at a time. Only one of the two is
  // ever mounted (based on `view`), but both hooks must run unconditionally.
  const fileRows = useMemo(() => {
    const rows: MediaFile[][] = [];
    for (let i = 0; i < files.length; i += effectiveColumns) {
      rows.push(files.slice(i, i + effectiveColumns));
    }
    return rows;
  }, [files, effectiveColumns]);

  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: fileRows.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => 220,
    overscan: 3,
    scrollMargin: gridWrapperRef.current?.offsetTop ?? 0,
  });

  const listWrapperRef = useRef<HTMLDivElement>(null);
  const listVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => 49,
    overscan: 8,
    scrollMargin: listWrapperRef.current?.offsetTop ?? 0,
  });

  // The folders section (fixed 190x180 tiles in a flex-wrap) is windowed the
  // same way, one flex row per virtual item. Tiles per row depends on the
  // container width, tracked with a ResizeObserver (callback ref because the
  // wrapper mounts after the loading skeleton returns early).
  const [foldersEl, setFoldersEl] = useState<HTMLDivElement | null>(null);
  const [foldersPerRow, setFoldersPerRow] = useState(4);
  useEffect(() => {
    if (!foldersEl) return;
    const compute = () => {
      // Tile 190px + 16px gap
      setFoldersPerRow(
        Math.max(1, Math.floor((foldersEl.clientWidth + 16) / 206)),
      );
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(foldersEl);
    return () => observer.disconnect();
  }, [foldersEl]);

  // First entry is the "New folder" tile/row (null sentinel)
  const folderEntries = useMemo<((typeof folders)[number] | null)[]>(
    () => [null, ...folders],
    [folders],
  );

  const folderRows = useMemo(() => {
    const rows: ((typeof folders)[number] | null)[][] = [];
    for (let i = 0; i < folderEntries.length; i += foldersPerRow) {
      rows.push(folderEntries.slice(i, i + foldersPerRow));
    }
    return rows;
  }, [folderEntries, foldersPerRow]);

  const folderVirtualizer = useVirtualizer({
    count: folderRows.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => 196,
    overscan: 2,
    scrollMargin: foldersEl?.offsetTop ?? 0,
  });

  // List view renders folders as one row each (like the file list), instead
  // of the fixed-size tiles used in grid view - separate virtualizer since
  // the row height and item count per "row" differ from the grid tiling.
  const folderListWrapperRef = useRef<HTMLDivElement>(null);
  const folderListVirtualizer = useVirtualizer({
    count: folderEntries.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => 49,
    overscan: 8,
    scrollMargin: folderListWrapperRef.current?.offsetTop ?? 0,
  });

  // Item count + preview thumbnails are fetched only for currently
  // virtualized folder tiles/rows, not every subfolder in the level - see
  // useFolderSummaries.
  const visibleFolderPaths =
    view === "grid"
      ? folderVirtualizer
          .getVirtualItems()
          .flatMap((virtualRow) =>
            (folderRows[virtualRow.index] ?? [])
              .filter((entry): entry is (typeof folders)[number] => entry !== null)
              .map((entry) => entry.path),
          )
      : folderListVirtualizer
          .getVirtualItems()
          .map((virtualRow) => folderEntries[virtualRow.index])
          .filter((entry): entry is (typeof folders)[number] => entry !== null)
          .map((entry) => entry.path);
  const folderSummaries = useFolderSummaries(visibleFolderPaths);

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
          onMove={(destination) => setBulkMoveDestination({ destination })}
          currentDir={currentDir}
        />
      ),
      {
        id: BULK_TOAST_ID,
        duration: Infinity,
        unstyled: true,
        classNames: {
          toast:
            "!bg-transparent !border-0 !p-0 !shadow-none !w-fit !max-w-[90vw]",
        },
      },
    );
  }, [selection, currentDir]);

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

  // Full-page empty state only at the root; inside a folder the "New folder"
  // tile below keeps the layout
  if (currentDir === "" && folders.length === 0 && files.length === 0) {
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
    navigator.clipboard.writeText(toAbsoluteUrl(`${transformBaseUrl}/t/${path}`));
    toast.success("URL copied to clipboard");
    if (id) {
      setCopiedId(id);
      setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1500,
      );
    }
  };

  const handleRenameMedia = async (path: string, newName: string) => {
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");

    const rename = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to rename "${path}"`);
      }
    };

    try {
      await toast
        .promise(rename(), {
          loading: `Renaming "${path}"...`,
          success: `Renamed to "${newName}"`,
          error: (error) =>
            error instanceof Error
              ? error.message
              : `Failed to rename "${path}"`,
        })
        .unwrap();
      invalidateStorage(queryClient);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyMedia = async (path: string) => {
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");

    const copy = async () => {
      const response = await fetch(
        `${apiBaseUrl}/storage/${encodedPath}/copy`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to copy "${path}"`);
      }
    };

    try {
      await toast
        .promise(copy(), {
          loading: `Copying "${path}"...`,
          success: `Copied "${path}"`,
          error: (error) =>
            error instanceof Error ? error.message : `Failed to copy "${path}"`,
        })
        .unwrap();
      invalidateStorage(queryClient);
    } catch {
      // error toast already shown
    }
  };

  const handleMoveMedia = async (path: string, destination: string) => {
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");

    const move = async () => {
      const response = await fetch(
        `${apiBaseUrl}/storage/${encodedPath}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to move "${path}"`);
      }
    };

    try {
      await toast
        .promise(move(), {
          loading: `Moving "${path}"...`,
          success: `Moved to "${destination || "Root"}"`,
          error: (error) =>
            error instanceof Error ? error.message : `Failed to move "${path}"`,
        })
        .unwrap();
      invalidateStorage(queryClient);
    } catch {
      // error toast already shown
    }
  };

  const handleDeleteMedia = async (path: string, name: string) => {
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");

    const del = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Failed to delete "${name}"`);
      }
    };

    try {
      await toast
        .promise(del(), {
          loading: `Deleting "${name}"...`,
          success: `Deleted "${name}"`,
          error: (error) =>
            error instanceof Error
              ? error.message
              : `Failed to delete "${name}"`,
        })
        .unwrap();
      invalidateStorage(queryClient);
    } catch {
      // error toast already shown
    }
  };

  const handleDownloadFolder = (path: string, name: string) => {
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const a = document.createElement("a");
    a.href = `${apiBaseUrl}/download-folder/${encodedPath}`;
    a.download = `${name}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloading "${name}.zip"`);
  };

  const handleRenameFolder = async (path: string, newName: string) => {
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");

    const rename = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `Failed to rename "${path}"`);
      }
    };

    try {
      await toast
        .promise(rename(), {
          loading: `Renaming "${path}"...`,
          success: `Renamed to "${newName}"`,
          error: (error) =>
            error instanceof Error
              ? error.message
              : `Failed to rename "${path}"`,
        })
        .unwrap();
      invalidateStorage(queryClient);
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
    const encodedPath = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");

    const del = async () => {
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Failed to delete folder "${path}"`);
      }
    };

    try {
      await toast
        .promise(del(), {
          loading: `Deleting "${path}"...`,
          success: `Deleted "${path}"`,
          error: (error) =>
            error instanceof Error
              ? error.message
              : `Failed to delete folder "${path}"`,
        })
        .unwrap();
      invalidateStorage(queryClient);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: entries.map((entry) => ({
            path: entry.path,
            kind: entry.kind,
          })),
        }),
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
      await toast
        .promise(downloadZip(), {
          loading: `Zipping ${entries.length} item(s)...`,
          success: `Downloading ${entries.length} item(s) as a zip`,
          error: "Failed to download items",
        })
        .unwrap();
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destination }),
          }).then((response) => {
            if (!response.ok) throw new Error(`Failed to move "${entry.name}"`);
          });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw new Error(
          `${failed.length} of ${entries.length} item(s) failed to move`,
        );
      }
    };

    try {
      await toast
        .promise(move(), {
          loading: `Moving ${entries.length} item(s)...`,
          success: `Moved to "${destination || "Root"}"`,
          error: (error) =>
            error instanceof Error ? error.message : "Failed to move items",
        })
        .unwrap();
    } catch {
      // error toast already shown
    } finally {
      invalidateStorage(queryClient);
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
          }).then((response) => {
            if (!response.ok)
              throw new Error(`Failed to delete "${entry.name}"`);
          });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw new Error(
          `${failed.length} of ${entries.length} item(s) failed to delete`,
        );
      }
    };

    try {
      await toast
        .promise(del(), {
          loading: `Deleting ${entries.length} item(s)...`,
          success: `Deleted ${entries.length} item(s)`,
          error: (error) =>
            error instanceof Error ? error.message : "Failed to delete items",
        })
        .unwrap();
    } catch {
      // error toast already shown
    } finally {
      invalidateStorage(queryClient);
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

  // Shared context menu shown for any thumbnail while a multi-selection is
  // active, so right-clicking any selected (or unselected) item exposes the
  // same actions as the floating bulk-action bar.
  const renderBulkContextMenuContent = () => (
    <ContextMenuContent className="w-56">
      <ContextMenuItem onClick={clearSelection}>
        <X className="h-4 w-4" />
        Clear selection
      </ContextMenuItem>
      <ContextMenuItem onClick={handleBulkDownload}>
        <Download className="h-4 w-4" />
        Download selection
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Move className="h-4 w-4" />
          Move selection
        </ContextMenuSubTrigger>
        <ContextMenuSubContent
          className="w-48 max-h-[400px] overflow-y-auto"
        >
          <MoveToNavigator
            ItemComponent={ContextMenuItem}
            currentDir={currentDir}
            onSelect={(destination) =>
              setBulkMoveDestination({ destination })
            }
          />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => setBulkDeleteConfirmOpen(true)}
        variant="destructive"
      >
        <Trash2 className="h-4 w-4" />
        Delete selection
      </ContextMenuItem>
    </ContextMenuContent>
  );

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
            keepExtension
            onRename={async (newName) => {
              const success = await handleRenameMedia(
                renameTarget.path,
                newName,
              );
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
              const success = await handleRenameFolder(
                renameFolderTarget.path,
                newName,
              );
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
          await handleDeleteMedia(
            deleteMediaTarget.path,
            deleteMediaTarget.name,
          );
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

      {/* Dialog for single-item move confirmation */}
      <DeleteConfirmDialog
        isOpen={moveMediaTarget !== null}
        onClose={() => setMoveMediaTarget(null)}
        title="Move Item"
        description={`Move "${moveMediaTarget?.media.name ?? ""}" to "${moveMediaTarget?.destination || "Root"}"?`}
        confirmLabel="Move"
        variant="default"
        onConfirm={async () => {
          if (!moveMediaTarget) return;
          await handleMoveMedia(
            moveMediaTarget.media.path,
            moveMediaTarget.destination,
          );
          setMoveMediaTarget(null);
        }}
      />

      {/* Dialog for bulk move confirmation */}
      <DeleteConfirmDialog
        isOpen={bulkMoveDestination !== null}
        onClose={() => setBulkMoveDestination(null)}
        title="Move Items"
        description={`Move ${selection.size} item(s) to "${bulkMoveDestination?.destination || "Root"}"?`}
        confirmLabel="Move"
        variant="default"
        onConfirm={async () => {
          if (!bulkMoveDestination) return;
          await handleBulkMove(bulkMoveDestination.destination);
          setBulkMoveDestination(null);
        }}
      />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="space-y-4">
            {view === "grid" && (
            <div
              ref={setFoldersEl}
              style={{
                height: folderVirtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {folderVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={folderVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-4"
                  style={{
                    transform: `translateY(${virtualRow.start - folderVirtualizer.options.scrollMargin}px)`,
                  }}
                >
                  <div className="flex flex-wrap gap-4">
              {folderRows[virtualRow.index].map((entry) => {
                if (entry === null) {
                  return (
                    <CreateFolderButtonWithDialog
                      key="__new-folder__"
                      uploadToFolder={folderPath || undefined}
                      trigger={
                        <div className="group relative w-[190px] h-[180px] rounded-lg border border-dashed border-border cursor-pointer transition-all hover:border-primary/40 hover:bg-muted/30 flex flex-col items-center justify-center gap-2">
                          <Plus
                            className="h-6 w-6 text-muted-foreground"
                            strokeWidth={1.5}
                          />
                          <p className="text-sm text-muted-foreground">
                            New folder
                          </p>
                        </div>
                      }
                    />
                  );
                }
                const folder = entry;
                const summary = folderSummaries[folder.path];
                const itemCountLabel = !summary
                  ? "…"
                  : summary.truncated
                    ? `${summary.itemCount}+`
                    : `${summary.itemCount}`;
                const previewItems =
                  hideThumbnails || !summary ? [] : summary.previewItems;
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
                  <ContextMenu
                    key={folder.path}
                    onOpenChange={(open) =>
                      setOpenMenuId(open ? folder.path : null)
                    }
                  >
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "group relative w-[190px] h-[180px] rounded-lg overflow-hidden border border-border bg-muted/30 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md data-[state=open]:border-primary/30 data-[state=open]:shadow-md",
                          isSelected(folder.path) &&
                            "ring-2 ring-primary border-primary",
                        )}
                        onClick={() => handleFolderClick(folder.path)}
                        onContextMenu={(e) => e.stopPropagation()}
                      >
                        <div
                          className={cn(
                            "absolute top-2 left-2 z-10 transition-opacity",
                            selectionMode || isSelected(folder.path)
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100",
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected(folder.path)}
                            onCheckedChange={() =>
                              toggleSelection(folder.path, {
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
                        <div
                          className={cn(
                            "absolute inset-x-0 bottom-0 max-w-full p-3 text-left",
                            hideThumbnails
                              ? ""
                              : "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
                          )}
                        >
                          <p
                            className={cn(
                              "text-sm font-medium truncate",
                              hideThumbnails ? "text-foreground" : "text-white",
                            )}
                          >
                            {folder.name}
                          </p>
                          <p
                            className={cn(
                              "text-xs",
                              hideThumbnails
                                ? "text-muted-foreground"
                                : "text-white/70",
                            )}
                          >
                            {itemCountLabel}{" "}
                            {summary && summary.itemCount === 1 && !summary.truncated
                              ? "item"
                              : "items"}
                          </p>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    {selectionMode ? (
                      openMenuId === folder.path ? (
                        renderBulkContextMenuContent()
                      ) : null
                    ) : (
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
                    )}
                  </ContextMenu>
                );
              })}
                  </div>
                </div>
              ))}
            </div>
            )}

            {view === "list" && (
              <div
                ref={folderListWrapperRef}
                className="rounded-lg border border-border overflow-hidden"
                style={{
                  height: folderListVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {folderListVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = folderEntries[virtualRow.index];

                  if (entry === null) {
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={folderListVirtualizer.measureElement}
                        className="absolute top-0 left-0 w-full"
                        style={{
                          transform: `translateY(${virtualRow.start - folderListVirtualizer.options.scrollMargin}px)`,
                        }}
                      >
                        <CreateFolderButtonWithDialog
                          uploadToFolder={folderPath || undefined}
                          trigger={
                            <div className="flex items-center gap-4 px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-muted/50 text-muted-foreground">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                                <Plus className="h-4 w-4" strokeWidth={1.5} />
                              </div>
                              <p className="min-w-0 flex-1 truncate text-sm">
                                New folder
                              </p>
                            </div>
                          }
                        />
                      </div>
                    );
                  }

                  const folder = entry;
                  const summary = folderSummaries[folder.path];
                  const itemCountLabel = !summary
                    ? "…"
                    : summary.truncated
                      ? `${summary.itemCount}+`
                      : `${summary.itemCount}`;
                  const isFolderHovered = hoveredId === folder.path;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={folderListVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full"
                      style={{
                        transform: `translateY(${virtualRow.start - folderListVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <ContextMenu
                        onOpenChange={(open) => {
                          setOpenMenuId(open ? folder.path : null);
                          if (open) setHoveredId(folder.path);
                        }}
                      >
                        <ContextMenuTrigger asChild>
                          <div
                            className={cn(
                              "group flex items-center gap-4 px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-muted/50 data-[state=open]:bg-muted/50",
                              isSelected(folder.path) && "bg-muted/40",
                            )}
                            onClick={() => handleFolderClick(folder.path)}
                            onContextMenu={(e) => e.stopPropagation()}
                            onMouseEnter={() => setHoveredId(folder.path)}
                            onMouseLeave={() => setHoveredId(null)}
                          >
                            <div
                              className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/50 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelection(folder.path, {
                                  path: folder.path,
                                  name: folder.name,
                                  kind: "folder",
                                });
                              }}
                            >
                              <Folder
                                className="h-3.5 w-3.5 text-muted-foreground"
                                strokeWidth={1.5}
                              />
                              <div
                                className={cn(
                                  "absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity",
                                  selectionMode || isSelected(folder.path)
                                    ? "opacity-100"
                                    : "opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100",
                                )}
                              >
                                <Checkbox
                                  checked={isSelected(folder.path)}
                                  onCheckedChange={() =>
                                    toggleSelection(folder.path, {
                                      path: folder.path,
                                      name: folder.name,
                                      kind: "folder",
                                    })
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="size-4"
                                />
                              </div>
                            </div>
                            <p
                              className="min-w-0 flex-1 truncate text-sm"
                              title={folder.name}
                            >
                              {folder.name}
                            </p>
                            <span className="w-32 shrink-0 text-right text-xs text-muted-foreground">
                              Folder
                            </span>
                            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                              {itemCountLabel}{" "}
                              {summary &&
                              summary.itemCount === 1 &&
                              !summary.truncated
                                ? "item"
                                : "items"}
                            </span>
                            <div className="flex w-28 shrink-0 items-center justify-end">
                              {isFolderHovered ? (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const path = folder.path;
                                      setTimeout(
                                        () => setFolderUploadTarget(path),
                                        0,
                                      );
                                    }}
                                    aria-label="Upload to folder"
                                  >
                                    <Upload className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadFolder(
                                        folder.path,
                                        folder.name,
                                      );
                                    }}
                                    aria-label="Download folder"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="cursor-pointer text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const path = folder.path;
                                      setTimeout(
                                        () => setDeleteFolderTarget(path),
                                        0,
                                      );
                                    }}
                                    aria-label="Delete folder"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        {selectionMode ? (
                          openMenuId === folder.path ? (
                            renderBulkContextMenuContent()
                          ) : null
                        ) : (
                          <ContextMenuContent>
                            <ContextMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                const path = folder.path;
                                setTimeout(
                                  () => setFolderUploadTarget(path),
                                  0,
                                );
                              }}
                            >
                              <Upload className="h-4 w-4" />
                              Upload to folder
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                const target = folder;
                                setTimeout(
                                  () => setRenameFolderTarget(target),
                                  0,
                                );
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
                                setTimeout(
                                  () => setDeleteFolderTarget(path),
                                  0,
                                );
                              }}
                              variant="destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete folder
                            </ContextMenuItem>
                          </ContextMenuContent>
                        )}
                      </ContextMenu>
                    </div>
                  );
                })}
              </div>
            )}

            {files.length > 0 && view === "grid" && (
              <div
                ref={gridWrapperRef}
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = fileRows[virtualRow.index];
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full pb-4"
                      style={{
                        transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <div className="grid gap-4" style={gridStyle}>
                        {row.map((media) => {
                  // For images: resize and optimize
                  // For videos: extract thumbnail at 1 second as jpg image with crop mode to avoid stretching
                  const thumbnailUrl =
                    media.type === "image"
                      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
                      : `${transformBaseUrl}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${media.path}`;
                  const isHovered = hoveredId === media.id;

                  return (
                    <ContextMenu
                      key={media.id}
                      onOpenChange={(open) => {
                        setOpenMenuId(open ? media.id : null);
                        if (open) setHoveredId(media.id);
                      }}
                    >
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            "group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-md data-[state=open]:border-primary/30 data-[state=open]:shadow-md [content-visibility:auto] [contain-intrinsic-size:auto_300px]",
                            isSelected(media.id) &&
                              "ring-2 ring-primary border-primary",
                          )}
                          onClick={() => onMediaSelect(media)}
                          onContextMenu={(e) => e.stopPropagation()}
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
                                : "opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100",
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
                          {hideThumbnails ? (
                            <FileTypeIcon type={media.type} />
                          ) : media.type === "image" ? (
                            <img
                              src={thumbnailUrl}
                              alt={media.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105 group-data-[state=open]:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <VideoThumbnail
                              src={thumbnailUrl}
                              alt={media.name}
                              className="transition-transform group-hover:scale-105 group-data-[state=open]:scale-105"
                              loading="lazy"
                            />
                          )}
                          <div
                            className={cn(
                              "absolute inset-x-0 bottom-0 p-2 transition-opacity",
                              hideThumbnails
                                ? ""
                                : "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
                              isHovered ? "opacity-100" : "opacity-0",
                              "group-data-[state=open]:opacity-100",
                            )}
                          >
                            <p
                              className={cn(
                                "text-xs font-medium truncate",
                                hideThumbnails
                                  ? "text-foreground"
                                  : "text-white",
                              )}
                            >
                              {media.name}
                            </p>
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      {!isHovered && openMenuId !== media.id ? null : selectionMode ? (
                        renderBulkContextMenuContent()
                      ) : (
                        <ContextMenuContent className="w-64">
                          <ContextMenuItem onClick={() => onMediaSelect(media)}>
                            <File className="h-4 w-4" />
                            Open
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              setTimeout(() => setRenameTarget(media), 0)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleCopyMedia(media.path)}
                          >
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
                            >
                              <MoveToNavigator
                                ItemComponent={ContextMenuItem}
                                currentDir={currentDir}
                                onSelect={(path) =>
                                  setMoveMediaTarget({
                                    media,
                                    destination: path,
                                  })
                                }
                              />
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuItem
                            onClick={() =>
                              handleDownload(media.path, media.name)
                            }
                          >
                            <Download className="h-4 w-4" />
                            Download
                            <ContextMenuShortcut>
                              {mac ? "⇧⌘D" : "Ctrl Shift D"}
                            </ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() =>
                              setTimeout(() => setDeleteMediaTarget(media), 0)
                            }
                            variant="destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                  );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {files.length > 0 && view === "list" && (
              <div
                ref={listWrapperRef}
                className="rounded-lg border border-border overflow-hidden"
                style={{
                  height: listVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {listVirtualizer.getVirtualItems().map((virtualRow) => {
                  const media = files[virtualRow.index];
                  const isHovered = hoveredId === media.id;
                  // Reuse the exact same transformed URL as the grid view so the
                  // transform server's cache is shared instead of generating a
                  // second thumbnail variant.
                  const thumbnailUrl =
                    media.type === "image"
                      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
                      : `${transformBaseUrl}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${media.path}`;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={listVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full"
                      style={{
                        transform: `translateY(${virtualRow.start - listVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                    <ContextMenu
                      onOpenChange={(open) => {
                        setOpenMenuId(open ? media.id : null);
                        if (open) setHoveredId(media.id);
                      }}
                    >
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            "group flex items-center gap-4 px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-muted/50 data-[state=open]:bg-muted/50 [content-visibility:auto] [contain-intrinsic-size:auto_41px]",
                            isSelected(media.id) && "bg-muted/40",
                          )}
                          onClick={() => onMediaSelect(media)}
                          onContextMenu={(e) => e.stopPropagation()}
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
                            {hideThumbnails ? (
                              <FileTypeIcon type={media.type} />
                            ) : media.type === "image" ? (
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
                                  : "opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100",
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
                                    setTimeout(
                                      () => setDeleteMediaTarget(media),
                                      0,
                                    );
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
                      {!isHovered && openMenuId !== media.id ? null : selectionMode ? (
                        renderBulkContextMenuContent()
                      ) : (
                        <ContextMenuContent className="w-64">
                          <ContextMenuItem onClick={() => onMediaSelect(media)}>
                            <File className="h-4 w-4" />
                            Open
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              setTimeout(() => setRenameTarget(media), 0)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleCopyMedia(media.path)}
                          >
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
                            >
                              <MoveToNavigator
                                ItemComponent={ContextMenuItem}
                                currentDir={currentDir}
                                onSelect={(path) =>
                                  setMoveMediaTarget({
                                    media,
                                    destination: path,
                                  })
                                }
                              />
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuItem
                            onClick={() => handleCopyUrl(media.path)}
                          >
                            <Link2 className="h-4 w-4" />
                            Copy URL
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              handleDownload(media.path, media.name)
                            }
                          >
                            <Download className="h-4 w-4" />
                            Download
                            <ContextMenuShortcut>
                              {mac ? "⇧⌘D" : "Ctrl Shift D"}
                            </ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() =>
                              setTimeout(() => setDeleteMediaTarget(media), 0)
                            }
                            variant="destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => setTimeout(() => setGridUploadOpen(true), 0)}
          >
            <Upload className="h-4 w-4" />
            Upload
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => setTimeout(() => setGridCreateFolderOpen(true), 0)}
          >
            <FolderPlus className="h-4 w-4" />
            Create folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}
