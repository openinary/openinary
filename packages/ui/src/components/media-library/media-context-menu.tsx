"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@repo/ui/components/ui/context-menu";
import {
  DownloadIcon,
  ExternalLinkIcon,
  LinkIcon,
  TrashIcon,
} from "lucide-react";

interface MediaContextMenuProps {
  children: React.ReactNode;
  onDownload?: () => void;
  onCopyUrl?: () => void;
  onOpenInNewTab?: () => void;
  onDelete?: () => void;
}

export function MediaContextMenu({
  children,
  onDownload,
  onCopyUrl,
  onOpenInNewTab,
  onDelete,
}: MediaContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpenInNewTab}>
          <ExternalLinkIcon className="w-4 h-4 mr-2" />
          Open in new tab
        </ContextMenuItem>
        <ContextMenuItem onClick={onCopyUrl}>
          <LinkIcon className="w-4 h-4 mr-2" />
          Copy URL
        </ContextMenuItem>
        <ContextMenuItem onClick={onDownload}>
          <DownloadIcon className="w-4 h-4 mr-2" />
          Download
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete}>
          <TrashIcon className="w-4 h-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
