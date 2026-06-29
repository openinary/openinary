import { ITEM_CLASS } from "./constants";
import { FolderThumbnail } from "./folder-thumbnail";
import { HoverLabel } from "./hover-label";
import type { FolderItem } from "./types";

interface FolderCardProps {
  folder: FolderItem;
  images: string[];
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function FolderCard({
  folder,
  images,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: FolderCardProps) {
  return (
    <div
      className={ITEM_CLASS}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <FolderThumbnail images={images} folderName={folder.name} />
      <HoverLabel name={folder.name} visible={isHovered} />
    </div>
  );
}
