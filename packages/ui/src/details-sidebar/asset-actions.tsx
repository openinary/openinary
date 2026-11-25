"use client";

import {
  Download,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { DefaultDialog } from "../components/default-dialog";
import { MoveToNavigator } from "../components/move-to-navigator";
import { RenameSection } from "../components/rename-section";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Spinner } from "../ui/spinner";
import { useOpeninary } from "../provider/openinary-provider";
import type { MediaFile } from "../types";

/** The asset's own actions, under its name. */
export function AssetActions({
  asset,
  isDeleting,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  asset: MediaFile;
  isDeleting: boolean;
  onDownload: () => void;
  onRename: (newName: string) => Promise<boolean>;
  onMove: (destination: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  // Read-only: Download alone, full width, and no menu of changes.
  const { readOnly } = useOpeninary();
  const dir = asset.path.includes("/")
    ? asset.path.slice(0, asset.path.lastIndexOf("/"))
    : "";

  return (
    <>
      {/* Download, named; the file's housekeeping behind one menu. Opening
          it lives on the delivery URL card below, next to the URL it opens. */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onDownload}>
          <Download />
          Download
        </Button>
        {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="More actions"
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner size={14} /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput />
                Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[400px] w-48 overflow-y-auto">
                <MoveToNavigator
                  ItemComponent={DropdownMenuItem}
                  currentDir={dir}
                  onSelect={onMove}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      <DefaultDialog
        isOpen={renaming}
        onClose={() => setRenaming(false)}
        title={`Rename '${asset.name}'`}
        contentClassName="max-w-[384px]"
      >
        {renaming && (
          <RenameSection
            currentName={asset.name}
            keepExtension
            onRename={async (newName) => {
              const success = await onRename(newName);
              if (success) setRenaming(false);
              return success;
            }}
          />
        )}
      </DefaultDialog>
    </>
  );
}
