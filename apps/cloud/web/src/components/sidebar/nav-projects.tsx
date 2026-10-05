"use client";

import { type MediaFile, useStorageLevel } from "@openinary/ui";
import { Folder } from "lucide-react";
import Link from "next/link";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useBucketIsEmpty } from "@/hooks/use-bucket-empty";
import { cn, FADE_IN } from "@/lib/utils";

const MAX_ROWS = 5;

interface NavProjectsProps {
  onMediaSelect?: (media: MediaFile) => void;
}

/**
 * The bucket's top level, as two short lists: folders to jump into and the
 * latest files to open. Shares the root "storage-tree" query with the grid, so
 * it costs no request of its own.
 */
export function NavProjects({ onMediaSelect }: NavProjectsProps) {
  const isEmpty = useBucketIsEmpty();
  const { data } = useStorageLevel("");

  // Strictly `=== false`, so neither "empty" nor "not known yet" renders:
  // a heading over nothing is a label for nothing.
  if (isEmpty !== false || !data) return null;

  const folders = data.folders.slice(0, MAX_ROWS);
  const recent = [...data.files]
    .sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? ""))
    .slice(0, MAX_ROWS);

  return (
    <>
      {folders.length > 0 && (
        <SidebarGroup
          className={cn("group-data-[collapsible=icon]:hidden", FADE_IN)}
        >
          <SidebarGroupLabel>Folders</SidebarGroupLabel>
          <SidebarMenu>
            {folders.map((folder) => (
              <SidebarMenuItem key={folder.path}>
                <SidebarMenuButton asChild>
                  <Link href={`/?folder=${encodeURIComponent(folder.path)}`}>
                    <Folder />
                    <span>{folder.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      {recent.length > 0 && (
        <SidebarGroup
          className={cn("group-data-[collapsible=icon]:hidden", FADE_IN)}
        >
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarMenu>
            {recent.map((file) => (
              <SidebarMenuItem key={file.path}>
                <SidebarMenuButton onClick={() => onMediaSelect?.(file)}>
                  <span>{file.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  );
}
