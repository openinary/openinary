"use client";

import { Upload } from "lucide-react";
import { DefaultDialog } from "./default-dialog";
import { UploadSection } from "./upload-section";
import { Button } from "../ui/button";

/** The upload dialog on its own, for opening it from state (a URL, say). */
export function UploadDialog({
  uploadToFolder,
  open,
  onOpenChange,
  trigger,
}: {
  uploadToFolder?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  return (
    <DefaultDialog
      title={`Upload Files ${uploadToFolder ? `to '${uploadToFolder}'` : ""}`}
      isOpen={open}
      onClose={() => onOpenChange?.(false)}
      trigger={trigger}
    >
      <UploadSection uploadToFolder={uploadToFolder} />
    </DefaultDialog>
  );
}

export function UploadButtonWithDialog({
  uploadToFolder,
}: {
  uploadToFolder?: string;
}) {
  return (
    <UploadDialog
      uploadToFolder={uploadToFolder}
      trigger={
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      }
    />
  );
}
