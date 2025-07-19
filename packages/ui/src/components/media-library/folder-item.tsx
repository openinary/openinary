"use client";

import { Card } from "@repo/ui/components/ui/card";
import { FolderIcon, GlobeIcon } from "lucide-react";
import { MediaFolder } from "./types";

interface FolderItemProps {
  folder: MediaFolder;
  viewMode: "grid" | "list";
  onFolderClick?: (folderKey: string) => void;
}

export function FolderItem({ folder, viewMode, onFolderClick }: FolderItemProps) {
  const handleClick = () => {
    onFolderClick?.(folder.key);
  };

  if (viewMode === "grid") {
    return (
      <Card
        className="relative group cursor-pointer border-2 rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
        onClick={handleClick}
      >
        <div className="aspect-square bg-muted/20 flex flex-col items-center justify-center p-4">
          <FolderIcon className="w-12 h-12 text-primary mb-2" />
          <span className="text-sm font-medium text-center truncate w-full">
            {folder.name}
          </span>
        </div>
      </Card>
    );
  }

  // List view
  return (
    <div 
      className="grid grid-cols-8 gap-4 p-3 border-b hover:bg-muted/50 items-center cursor-pointer"
      onClick={handleClick}
    >
      <div className="col-span-2 flex items-center gap-3">
        <input type="checkbox" className="rounded" />
        <div className="w-10 h-10 bg-muted/20 rounded flex items-center justify-center flex-shrink-0">
          <FolderIcon className="w-6 h-6 text-primary" />
        </div>
        <span className="text-sm font-medium">{folder.name}</span>
      </div>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <FolderIcon className="size-4" /> Home
      </div>
      <div className="text-sm">Folder</div>
      <div className="text-sm">-</div>
      <div className="text-sm">-</div>
      <div className="text-sm">-</div>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <GlobeIcon className="size-4" /> Public
      </div>
    </div>
  );
}