import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Trash2,
} from "lucide-react";
import { ReactNode, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { cn } from "@/lib/utils";
import { useAssetDetails } from "../details-sidebar/use-asset-details";

export default function ImageContextMenuWrapper({
  assetId,
  onDetailsOpen,
  children,
}: {
  assetId: string;
  onDetailsOpen: () => void;
  children: ReactNode;
}) {
  const {
    isDeleting,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleDelete,
  } = useAssetDetails(assetId);
  const [copied, setCopied] = useState<boolean>(false);

  const copyUrl = () => {
    handleCopyUrl();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onClick={onDetailsOpen}>
            <Info />
            Details
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem onClick={copyUrl}>
            <div className="relative h-4 w-4">
              <div
                className={cn(
                  "absolute inset-0 transition-all",
                  copied ? "scale-100 opacity-100" : "scale-0 opacity-0",
                )}
              >
                <Check className="h-4 w-4 stroke-emerald-500" />
              </div>
              <div
                className={cn(
                  "absolute inset-0 transition-all",
                  copied ? "scale-0 opacity-0" : "scale-100 opacity-100",
                )}
              >
                <Copy className="h-4 w-4" />
              </div>
            </div>
            Copy URL
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownload}>
            <Download />
            Download
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenInNewTab}>
            <ExternalLink />
            Open
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            variant="destructive"
            onClick={() => handleDelete()}
            disabled={isDeleting}
          >
            <Trash2 />
            {isDeleting ? "Deleting..." : "Delete"}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
