"use client";

import { Download, Move, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../lib/utils";
import { MoveToNavigator } from "./move-to-navigator";

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
        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-ds-secondary transition-colors hover:bg-ds-hover hover:text-ds-text",
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
  currentDir,
  inline,
}: {
  /** Sits in a toolbar: no surface of its own, menus open downwards. */
  inline?: boolean;
  count: number;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: (destination: string) => void;
  currentDir: string;
}) {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-2.5 whitespace-nowrap text-ds-text",
        inline
          ? "ds-rise"
          : "ds-modal rounded-[14px]! py-1.5 pr-1.5 pl-4",
      )}
    >
      <span className="font-medium text-[13px]/5 tabular-nums">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer rounded-[8px] px-2 py-1 font-medium text-[13px]/5 text-ds-muted transition-colors hover:bg-ds-hover hover:text-ds-text"
      >
        Clear
      </button>
      <div className="h-5 w-px bg-ds-border-strong" />
      <BulkActionIconButton onClick={onDownload} label="Download">
        <Download className="h-4 w-4" />
      </BulkActionIconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Move"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-ds-secondary transition-colors hover:bg-ds-hover hover:text-ds-text"
          >
            <Move className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={inline ? "end" : "center"}
          side={inline ? "bottom" : "top"}
          sideOffset={inline ? 6 : 19}
          className="max-h-[400px] w-48 overflow-y-auto"
        >
          <MoveToNavigator
            ItemComponent={DropdownMenuItem}
            currentDir={currentDir}
            onSelect={onMove}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <BulkActionIconButton onClick={onDelete} label="Delete" destructive>
        <Trash2 className="h-4 w-4" />
      </BulkActionIconButton>
    </div>
  );
}
