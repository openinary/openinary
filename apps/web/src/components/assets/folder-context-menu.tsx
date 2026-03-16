import { FolderPen, FolderPlus, Trash2 } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import DefaultDialog, { DialogRefProps } from "../default-dialog";
import { CreateFolderSection } from "../create-folder-section";
import { useQueryClient } from "@tanstack/react-query";
import { deleteFolder } from "../delete-folder-button";

export default function FolderContextMenuWrapper({
  folder,
  children,
}: {
  folder: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const dialogRef = useRef<DialogRefProps>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteFolder(folder);

    // Refresh the storage tree
    await queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
    setIsDeleting(false);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => dialogRef.current?.open()}>
              <FolderPlus />
              Create inside
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 />
              {isDeleting ? "Deleting..." : "Delete folder"}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <DefaultDialog
        ref={dialogRef}
        title={`Create folder ${folder ? `inside '${folder}'` : ""}`}
      >
        <CreateFolderSection
          uploadToFolder={folder}
          onSuccessfulCreate={(v) => {
            dialogRef.current?.close();
          }}
        />
      </DefaultDialog>
    </>
  );
}
