"use client";

import { FolderX } from "lucide-react";
import { Button } from "../ui/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateStorage } from "../hooks/use-storage-tree";
import { useOpeninary } from "../provider/openinary-provider";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export function DeleteFolderButton({
  folderPath,
  onSuccessfulDelete,
}: {
  folderPath: string;
  onSuccessfulDelete?: (folder: string) => void;
}) {
  const { apiBaseUrl, fetch } = useOpeninary();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    // Encode each segment of the path separately to preserve slashes
    // This is necessary for files in subdirectories
    const encodedPath = folderPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const deleteUrl = `${apiBaseUrl}/storage/${encodedPath}`;

    const del = async () => {
      const response = await fetch(deleteUrl, {
        method: "DELETE",
      });

      if (!response.ok) {
        // Try to parse JSON error response, but handle cases where it's not JSON
        let errorMessage = `Failed to delete file (${response.status})`;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorBody = await response.json();
            errorMessage = errorBody.message || errorBody.error || errorMessage;
          } else {
            const text = await response.text();
            if (text) {
              errorMessage = text;
            }
          }
        } catch (parseError) {
          // If parsing fails, use the default error message
        }
        throw new Error(errorMessage);
      }

      // For successful responses, consume the body to avoid memory leaks
      // We don't need the data, so we can safely ignore parsing errors
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          await response.json();
        } else {
          await response.text();
        }
      } catch (parseError) {
        // Ignore parsing errors for success responses - we don't need the data
      }
    };

    try {
      await toast.promise(del(), {
        loading: `Deleting "${folderPath}"...`,
        success: `Deleted "${folderPath}"`,
        error: (error) => (error instanceof Error ? error.message : "Failed to delete file"),
      }).unwrap();

      // Refresh the storage tree
      invalidateStorage(queryClient);
      onSuccessfulDelete?.(folderPath);
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  return (
    <>
      <Button
        variant="ghostDestructive"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="gap-2"
      >
        <FolderX className="h-4 w-4" />
        Delete folder
      </Button>
      <DeleteConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete Folder"
        description={`This action cannot be undone. Are you sure you want to permanently delete "${folderPath}" and all its contents?`}
        onConfirm={async () => {
          await handleDelete();
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
