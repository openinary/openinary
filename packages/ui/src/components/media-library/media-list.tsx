"use client";

import { useState } from "react";
import { FolderIcon, GlobeIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { MediaContextMenu } from "./media-context-menu";
import { MediaFile, MediaItem } from "./types";
import { FolderItem } from "./folder-item";
import { toast } from "sonner";
import { Button } from "../ui/button";

interface MediaListProps {
  items: MediaItem[];
  onFileDeleted?: () => void;
  onDeleteFile?: (key: string) => Promise<{ success: boolean; error?: string }>;
  onFolderClick?: (folderKey: string) => void;
}

function MediaListHeader() {
  return (
    <div className="grid grid-cols-8 gap-4 p-3 border-b bg-muted/50 text-sm font-medium">
      <div className="col-span-2">Display name</div>
      <div>Containing folder</div>
      <div>Asset type</div>
      <div>Format</div>
      <div>Size</div>
      <div>Dimensions</div>
      <div>Access control</div>
    </div>
  );
}

function MediaListItem({
  item,
  onFileDeleted,
  onDeleteFile,
  onFolderClick,
}: {
  item: MediaItem;
  onFileDeleted?: () => void;
  onDeleteFile?: (key: string) => Promise<{ success: boolean; error?: string }>;
  onFolderClick?: (folderKey: string) => void;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (item.type === "folder") {
    return (
      <FolderItem folder={item} viewMode="list" onFolderClick={onFolderClick} />
    );
  }

  // C'est un fichier
  const file = item as MediaFile;

  const handleDownload = async () => {
    try {
      // Todo: Handle download
      toast.info(`Not implemented yet`);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(file.url);
    toast.success("URL copied to clipboard");
  };

  const handleOpenInNewTab = () => {
    window.open(file.url, "_blank");
  };

  const handleDelete = async () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!onDeleteFile) {
      toast.error("Delete function not available");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await onDeleteFile(file.key);

      if (result.success) {
        const fileName = file.customMetadata?.originalName || file.key;
        toast.success(`File "${fileName}" deleted successfully`);
        onFileDeleted?.();
      } else {
        toast.error(result.error || "Failed to delete file");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete file");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <MediaContextMenu
        onDownload={handleDownload}
        onCopyUrl={handleCopyUrl}
        onOpenInNewTab={handleOpenInNewTab}
        onDelete={handleDelete}
      >
        <div className="grid grid-cols-8 gap-4 p-3 border-b hover:bg-muted/50 items-center">
          <div className="col-span-2 flex items-center gap-3">
            <input type="checkbox" className="rounded" />
            <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
              {file.customMetadata?.mediaType === "video" ? (
                <video
                  src={file.url}
                  className="w-full h-full object-cover rounded"
                  muted
                  preload="metadata"
                />
              ) : (
                <img
                  src={file.url}
                  alt={file.customMetadata?.originalName || file.key}
                  className="w-full h-full object-cover rounded"
                />
              )}
            </div>
            <span className="text-sm">
              {file.customMetadata?.originalName || file.key}
            </span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <FolderIcon className="size-4" /> Home
          </div>
          <div className="text-sm">
            {file.customMetadata?.mediaType
              ? file.customMetadata.mediaType.charAt(0).toUpperCase() +
                file.customMetadata.mediaType.slice(1)
              : "Unknown"}
          </div>
          <div className="text-sm">
            {file.customMetadata?.extension?.toUpperCase() || "UNKNOWN"}
          </div>
          <div className="text-sm">{(file.size / 1024).toFixed(2)} KB</div>
          <div className="text-sm">
            {file.customMetadata?.originalDimensions || "Unknown"}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <GlobeIcon className="size-4" /> Public
          </div>
        </div>
      </MediaContextMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              {file.customMetadata?.originalName || file.key}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button onClick={confirmDelete} variant="destructive" disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MediaList({
  items,
  onFileDeleted,
  onDeleteFile,
  onFolderClick,
}: MediaListProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <MediaListHeader />
      {items.map((item) => (
        <MediaListItem
          key={item.key}
          item={item}
          onFileDeleted={onFileDeleted}
          onDeleteFile={onDeleteFile}
          onFolderClick={onFolderClick}
        />
      ))}
    </div>
  );
}
