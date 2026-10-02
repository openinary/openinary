"use client";

import {
  Download,
  ExternalLink,
  FolderInput,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { type ComponentProps, forwardRef, useState } from "react";
import { DefaultDialog } from "../components/default-dialog";
import { MoveToNavigator } from "../components/move-to-navigator";
import { RenameSection } from "../components/rename-section";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Spinner } from "../ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import type { MediaFile } from "../types";

const IconAction = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button> & { icon: LucideIcon; label: string }
>(({ icon: Icon, label, className, children, ...props }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        aria-label={label}
        className={cn("size-8 text-muted-foreground", className)}
        {...props}
      >
        {children ?? <Icon />}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
));
IconAction.displayName = "IconAction";

/** The asset's own actions, one row of icons under its name. */
export function AssetActions({
  asset,
  isDeleting,
  onDownload,
  onOpenInNewTab,
  onRename,
  onMove,
  onDelete,
}: {
  asset: MediaFile;
  isDeleting: boolean;
  onDownload: () => void;
  onOpenInNewTab: () => void;
  onRename: (newName: string) => Promise<boolean>;
  onMove: (destination: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const dir = asset.path.includes("/")
    ? asset.path.slice(0, asset.path.lastIndexOf("/"))
    : "";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex justify-center gap-1">
        <IconAction icon={Download} label="Download" onClick={onDownload} />
        <IconAction
          icon={ExternalLink}
          label="Open in new tab"
          onClick={onOpenInNewTab}
        />
        <IconAction
          icon={Pencil}
          label="Rename"
          onClick={() => setRenaming(true)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconAction icon={FolderInput} label="Move to" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[400px] w-48 overflow-y-auto">
            <MoveToNavigator
              ItemComponent={DropdownMenuItem}
              currentDir={dir}
              onSelect={onMove}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <IconAction
          icon={Trash2}
          label="Delete"
          onClick={onDelete}
          disabled={isDeleting}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          {isDeleting ? <Spinner size={16} /> : undefined}
        </IconAction>
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
    </TooltipProvider>
  );
}
