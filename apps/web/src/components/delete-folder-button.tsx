import { FolderX } from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const deleteFolder = async (folderPath: string) => {
  if (
    !confirm(
      `Are you sure you want to delete the folder '${folderPath}' and its contents?\nThis action cannot be undone.`,
    )
  )
    return;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

    // Encode each segment of the path separately to preserve slashes
    // This is necessary for files in subdirectories
    const encodedPath = folderPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const deleteUrl = `${apiBaseUrl}/storage/${encodedPath}`;

    const response = await fetch(deleteUrl, {
      method: "DELETE",
      credentials: "include",
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
  } catch (error) {
    console.error("Failed to delete file:", error);
    alert(error instanceof Error ? error.message : "Failed to delete file");
  }
};

export default function DeleteFolderButton({
  folderPath,
  onSuccessfulDelete,
}: {
  folderPath: string;
  onSuccessfulDelete?: (folder: string) => void;
}) {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteFolder(folderPath);

    // Refresh the storage tree
    await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    onSuccessfulDelete?.(folderPath);
    setIsDeleting(false);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      className="gap-2 text-destructive hover:text-destructive"
    >
      <FolderX className="h-4 w-4" />
      {isDeleting ? "Deleting..." : "Delete folder"}
    </Button>
  );
}
