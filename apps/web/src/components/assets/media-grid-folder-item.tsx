import { Folder } from "lucide-react";
import { FolderItem } from "./media-grid";
import { cn } from "@/lib/utils";
import FolderContextMenuWrapper from "./folder-context-menu";

export default function MediaGridFolderItem({
  folder,
  ...props
}: {
  folder: FolderItem;
  onClick: () => void;
}) {
  return (
    <FolderContextMenuWrapper folder={folder.id}>
      <button
        className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all group-hover:border-primary/30 group-hover:shadow-md"
        {...props}
      >
        <div className="relative w-full h-full bg-muted flex items-center justify-center">
          <Folder className="h-16 w-16 text-muted-foreground" />
        </div>
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2 transition-opacity",
            "opacity-0 group-hover:opacity-100 group-focus:opacity-100",
            "text-white text-xs font-semibold mt-auto py-3 truncate",
            "flex flex-col justify-end",
          )}
        >
          {folder.name}
        </div>
      </button>
    </FolderContextMenuWrapper>
  );
}
