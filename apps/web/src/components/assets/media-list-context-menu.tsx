import { ReactNode, useRef } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { FolderPlus, Upload } from "lucide-react";
import DefaultDialog, { DialogRefProps } from "../default-dialog";
import { CreateFolderSection } from "../create-folder-section";
import { UploadSection } from "../upload-section";

export default function MediaListContextMenuWrapper({
  folder,
  children,
}: {
  folder?: string;
  children: ReactNode;
}) {
  const createFolderDialogRef = useRef<DialogRefProps>(null);
  const uploadDialogRef = useRef<DialogRefProps>(null);

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
