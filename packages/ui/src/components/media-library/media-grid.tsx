"use client";

import { useState } from "react";
import { Card } from "@repo/ui/components/ui/card";
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

interface MediaGridProps {
  items: MediaItem[];
  onFileDeleted?: () => void;
  onDeleteFile?: (key: string) => Promise<{ success: boolean; error?: string }>;
  onFolderClick?: (folderKey: string) => void;
}

export function MediaGrid({
  items,
  onFileDeleted,
  onDeleteFile,
  onFolderClick,
}: MediaGridProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<MediaFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDownload = async (file: MediaFile) => {
    try {
      // Todo: Handle download
      toast.info(`Not implemented yet`);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleCopyUrl = (file: MediaFile) => {
    navigator.clipboard.writeText(file.url);
    toast.success("URL copied to clipboard");
  };

  const handleOpenInNewTab = (file: MediaFile) => {
    window.open(file.url, "_blank");
  };

  const handleDelete = async (file: MediaFile) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete || !onDeleteFile) {
      toast.error("Delete function not available");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await onDeleteFile(fileToDelete.key);

      if (result.success) {
        const fileName =
          fileToDelete.customMetadata?.originalName || fileToDelete.key;
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
      setFileToDelete(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {items.map((item) => {
          if (item.type === "folder") {
            return (
              <FolderItem
                key={item.key}
                folder={item}
                viewMode="grid"
                onFolderClick={onFolderClick}
              />
            );
          }

          // C'est un fichier
          const file = item as MediaFile;
          return (
            <MediaContextMenu
              key={file.key}
              onDownload={() => handleDownload(file)}
              onCopyUrl={() => handleCopyUrl(file)}
              onOpenInNewTab={() => handleOpenInNewTab(file)}
              onDelete={() => handleDelete(file)}
            >
              <Card className="relative group cursor-pointer border-2 rounded-lg overflow-hidden">
                <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden">
                  {file.customMetadata?.mediaType === "video" ? (
                    <video
                      src={file.url}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={file.url}
                      alt={file.customMetadata?.originalName || file.key}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </Card>
            </MediaContextMenu>
          );
        })}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              {fileToDelete?.customMetadata?.originalName || fileToDelete?.key}
              "? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>

            <Button
              onClick={confirmDelete}
              variant="destructive"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
