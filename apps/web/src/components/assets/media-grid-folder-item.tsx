import { Folder } from "lucide-react";
import { FolderItem } from "./media-grid";
import { cn } from "@/lib/utils";
import FolderContextMenuWrapper from "./folder-context-menu";
import { TreeDataItem } from "../ui/tree-view";
import MediaHelper from "@/app/helpers/mediaHelper";

export default function MediaGridFolderItem({
  folder,
  treeData,
  ...props
}: {
  folder: FolderItem;
  treeData?: TreeDataItem[];
  onClick: () => void;
}) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  // Use dedicated transform base URL (empty in Docker, falls back to apiBaseUrl without /api)
  const transformBaseUrl =
    process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL !== undefined
      ? process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL
      : apiBaseUrl.replace(/\/api$/, "");

  const folderImages = treeData
    ? MediaHelper.getFolderImages(treeData, folder.path.split("/"))
    : [];

  return (
    <FolderContextMenuWrapper folder={folder.id}>
      <button
        className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all group-hover:border-primary/30 group-hover:shadow-md"
        {...props}
      >
        <div className="relative w-full h-full bg-muted flex items-center justify-center">
          {folderImages.length > 0 && (
            <Folder className="absolute z-50 top-3 left-3 size-8 text-neutral-200 opacity-40" />
          )}
          {folderImages.length === 4 ? (
            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
              {folderImages.map((src, i) => (
                <div key={i} className="overflow-hidden">
                  <img
                    src={`${transformBaseUrl}/t/w_250,h_250,q_70/${src}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : folderImages.length === 3 ? (
            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
              <div className="overflow-hidden row-span-2">
                <img
                  src={`${transformBaseUrl}/t/w_250,h_500,q_70/${folderImages[0]}`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              {folderImages.slice(1).map((src, i) => (
                <div key={i} className="overflow-hidden">
                  <img
                    src={`${transformBaseUrl}/t/w_250,h_250,q_70/${src}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : folderImages.length === 2 ? (
            <div className="grid grid-cols-2 gap-0.5 w-full h-full">
              {folderImages.map((src, i) => (
                <div key={i} className="overflow-hidden">
                  <img
                    src={`${transformBaseUrl}/t/w_250,h_500,q_70/${src}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : folderImages.length === 1 ? (
            <img
              src={`${transformBaseUrl}/t/w_500,h_500,q_70/${folderImages[0]}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <span className="text-muted-foreground text-2xl font-bold tracking-wide">
                {MediaHelper.getFolderInitials(folder.name)}
              </span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 transition-opacity",
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
