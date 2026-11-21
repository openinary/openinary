"use client";

import { FolderPlus } from "lucide-react";
import { ReactNode, useRef } from "react";
import { CreateFolderSection } from "./create-folder-section";
import { DefaultDialog } from "./default-dialog";
import { Button } from "../ui/button";
import { useOpeninary } from "../provider/openinary-provider";

export function CreateFolderButtonWithDialog({
  uploadToFolder,
  onSuccessfulCreate,
  trigger,
}: {
  uploadToFolder?: string;
  onSuccessfulCreate?: (folder: string) => void;
  trigger?: ReactNode;
}) {
  const dialogRef = useRef<{ close: () => void }>(null);
  const { readOnly } = useOpeninary();
  // Read-only: no trigger either, so the "New folder" tile goes too.
  if (readOnly) return null;

  return (
    <DefaultDialog
      ref={dialogRef}
      contentClassName="max-w-[384px]"
      title={`Create folder ${uploadToFolder ? `inside '${uploadToFolder}'` : ""}`}
      trigger={
        trigger ?? (
          <Button variant="ghost" className="gap-2">
            <FolderPlus className="h-4 w-4" />
            Create folder
          </Button>
        )
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
