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

const MAX_ROWS = 5;

interface NavProjectsProps {
  onMediaSelect?: (media: MediaFile) => void;
}

/**
 * The storage root, as two short lists: folders to jump into and the latest
 * files to open. Shares the root "storage-tree" query with the grid, so it
 * costs no request of its own.
 */
export function NavProjects({ onMediaSelect }: NavProjectsProps) {
  const { data } = useStorageLevel("");
  if (!data) return null;

  const folders = data.folders.slice(0, MAX_ROWS);
  const recent = [...data.files]
    .sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? ""))
    .slice(0, MAX_ROWS);

  return (
    <>
      {folders.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
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
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
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
