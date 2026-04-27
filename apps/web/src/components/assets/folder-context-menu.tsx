import { useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Trash2, Upload } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { CreateFolderSection } from "../create-folder-section";
import DefaultDialog, { DialogRefProps } from "../default-dialog";
import { deleteFolder } from "../delete-folder-button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { UploadSection } from "../upload-section";

export default function FolderContextMenuWrapper({
  folder,
  children,
}: {
  folder: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const createFolderDialogRef = useRef<DialogRefProps>(null);
  const uploadDialogRef = useRef<DialogRefProps>(null);

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
            <ContextMenuItem onClick={() => uploadDialogRef.current?.open()}>
              <Upload />
              Upload
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => createFolderDialogRef.current?.open()}
            >
              <FolderPlus />
              Create folder
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
        ref={createFolderDialogRef}
        title={`Create folder ${folder ? `inside '${folder}'` : ""}`}
      >
        <CreateFolderSection
          uploadToFolder={folder}
          onSuccessfulCreate={(v) => {
            createFolderDialogRef.current?.close();
          }}
        />
      </DefaultDialog>
      <DefaultDialog
        ref={uploadDialogRef}
        title={`Upload Files ${folder ? `to '${folder}'` : ""}`}
      >
        <UploadSection uploadToFolder={folder} />
      </DefaultDialog>
    </>
  );
}
