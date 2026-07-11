"use client";

import { Download, Folder, Move, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MoveTargetNode } from "./media-grid";

/**
 * "Move to" destinations rendered as nested submenus mirroring the folder
 * hierarchy, mirroring MoveTargetMenuItems in media-grid.tsx but built on
 * DropdownMenu primitives (this bar uses a dropdown, not a context menu).
 */
function MoveTargetDropdownItems({
  nodes,
  currentDir,
  onSelect,
}: {
  nodes: MoveTargetNode[];
  currentDir: string;
  onSelect: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.children.length === 0 ? (
          node.path === currentDir ? null : (
            <DropdownMenuItem key={node.path} onClick={() => onSelect(node.path)}>
              <Folder className="h-4 w-4" />
              {node.name}
            </DropdownMenuItem>
          )
        ) : (
          <DropdownMenuSub key={node.path}>
            <DropdownMenuSubTrigger>
              <Folder className="h-4 w-4" />
              {node.name}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[400px] w-48 overflow-y-auto">
              {node.path !== currentDir && (
                <>
                  <DropdownMenuItem onClick={() => onSelect(node.path)}>
                    <Folder className="h-4 w-4" />
                    Move here
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <MoveTargetDropdownItems
                nodes={node.children}
                currentDir={currentDir}
                onSelect={onSelect}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
      )}
    </>
  );
}

function BulkActionIconButton({
  onClick,
  label,
  destructive,
  children,
}: {
  onClick?: () => void;
  label: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-foreground/10",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

export function BulkActionBarContent({
  count,
  onClear,
  onDownload,
  onDelete,
  onMove,
  moveTree,
  currentDir,
  canMoveToRoot,
}: {
  count: number;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: (destination: string) => void;
  moveTree: MoveTargetNode[];
  currentDir: string;
  canMoveToRoot: boolean;
}) {
  return (
    <div className="flex w-fit items-center gap-3 whitespace-nowrap rounded-full border border-border bg-popover px-4 py-2.5 text-popover-foreground shadow-lg">
      <span className="text-sm font-medium">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer rounded-full bg-muted px-3 py-1 text-xs font-semibold transition-colors hover:bg-foreground/10"
      >
        Clear
      </button>
      <div className="h-5 w-px bg-border" />
      <BulkActionIconButton onClick={onDownload} label="Download">
        <Download className="h-4 w-4" />
      </BulkActionIconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Move"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-foreground/10"
          >
            <Move className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="top"
          sideOffset={19}
          className="max-h-[400px] w-48 overflow-y-auto"
        >
          {canMoveToRoot && (
            <DropdownMenuItem onClick={() => onMove("")}>
              <Folder className="h-4 w-4" />
              Root
            </DropdownMenuItem>
          )}
          {moveTree.length === 0 && !canMoveToRoot ? (
            <DropdownMenuItem disabled>No folders available</DropdownMenuItem>
          ) : (
            <MoveTargetDropdownItems
              nodes={moveTree}
              currentDir={currentDir}
              onSelect={onMove}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <BulkActionIconButton onClick={onDelete} label="Delete" destructive>
        <Trash2 className="h-4 w-4" />
      </BulkActionIconButton>
    </div>
  );
}
