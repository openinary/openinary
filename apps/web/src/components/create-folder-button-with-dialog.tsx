import { FolderPlus } from "lucide-react";
import { useRef } from "react";
import { CreateFolderSection } from "./create-folder-section";
import DefaultDialog from "./default-dialog";
import { Button } from "./ui/button";

export default function CreateFolderButtonWithDialog({
  uploadToFolder,
  onSuccessfulCreate,
}: {
  uploadToFolder?: string;
  onSuccessfulCreate?: (folder: string) => void;
}) {
  const dialogRef = useRef<{ close: () => void }>(null);

  return (
    <DefaultDialog
      ref={dialogRef}
      title={`Create folder ${uploadToFolder ? `inside '${uploadToFolder}'` : ""}`}
      trigger={
        <Button variant="ghost" className="gap-2">
          <FolderPlus className="h-4 w-4" />
          Create folder
        </Button>
      }
    >
      <CreateFolderSection
        uploadToFolder={uploadToFolder}
        onSuccessfulCreate={(v) => {
          onSuccessfulCreate?.(v);
          dialogRef.current?.close();
        }}
      />
    </DefaultDialog>
  );
}
