"use client";

import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { useStorageLevel } from "@/hooks/use-storage-tree";

interface MoveToItemProps {
  disabled?: boolean;
  onSelect?: (event: Event) => void;
  className?: string;
  children?: ReactNode;
}

/**
 * "Move to" destination picker, browsed one level at a time (click a folder
 * to look inside it, "Move here" to pick the level you're browsing). Each
 * level is fetched lazily via the same per-folder listing the main grid
 * uses, instead of eagerly loading every folder path in the bucket up front
 * — which used to make this picker slow (or empty, if it hadn't resolved
 * yet) on large buckets, and its old nested-hover-submenu tree structure
 * would silently close itself when the pointer moved between deeply nested
 * levels.
 */
export function MoveToNavigator({
  ItemComponent,
  currentDir,
  onSelect,
}: {
  ItemComponent: ComponentType<MoveToItemProps>;
  currentDir: string;
  onSelect: (destination: string) => void;
}) {
  const [browsePath, setBrowsePath] = useState("");
  const { data, isLoading, error } = useStorageLevel(browsePath);
  const folders = data?.folders ?? [];

  const parentPath = browsePath.includes("/")
    ? browsePath.slice(0, browsePath.lastIndexOf("/"))
    : "";
  const currentLabel =
    browsePath === "" ? "Root" : browsePath.split("/").pop();

  return (
    <>
      {browsePath !== "" && (
        <ItemComponent
          onSelect={(event) => {
            event.preventDefault();
            setBrowsePath(parentPath);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </ItemComponent>
      )}
      {browsePath !== currentDir && (
        <ItemComponent onSelect={() => onSelect(browsePath)}>
          <Folder className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Move to {currentLabel}</span>
        </ItemComponent>
      )}
      {isLoading ? (
        <ItemComponent disabled>Loading…</ItemComponent>
      ) : error ? (
        <ItemComponent disabled>Failed to load folders</ItemComponent>
      ) : folders.length === 0 ? (
        <ItemComponent disabled>No subfolders</ItemComponent>
      ) : (
        folders.map((folder) => (
          <ItemComponent
            key={folder.path}
            onSelect={(event) => {
              event.preventDefault();
              setBrowsePath(folder.path);
            }}
          >
            <Folder className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{folder.name}</span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          </ItemComponent>
        ))
      )}
    </>
  );
}
