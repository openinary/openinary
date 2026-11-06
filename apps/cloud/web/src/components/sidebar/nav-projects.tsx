"use client";

import {
  type MediaFile,
  type StorageLevel,
  useStorageLevel,
} from "@openinary/ui";
import { Folder } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "skullet/react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";

const MAX_ROWS = 5;

interface NavProjectsProps {
  onMediaSelect?: (media: MediaFile) => void;
}

/**
 * The bucket's top level, as two short lists: folders to jump into and the
 * latest files to open. Shares the root "storage-tree" query with the grid, so
 * it costs no request of its own.
 */
const SAMPLE_LEVEL: StorageLevel = {
  path: "",
  folders: [{ name: "Folder", path: "folder" }],
  files: ["sample-image.jpg", "sample-video.mp4", "sample-photo.jpg"].map(
    (name) => ({ id: name, name, path: name, type: "image" as const }),
  ),
};

export function NavProjects({ onMediaSelect }: NavProjectsProps) {
  const { data } = useStorageLevel("");
  // Client-only, so the skeleton can recall its last shape (useHydrated).
  if (!useHydrated()) return null;

  // Kept mounted from the first paint: skullet remembers the lists it last
  // showed under this id, so a reload reserves exactly their rows (or none,
  // for an empty bucket) instead of popping them in once the listing lands.
  return (
    <Skeleton
      id="nav-projects"
      data={data}
      sample={SAMPLE_LEVEL}
      label="Loading folders and recent files"
      className="group-data-[collapsible=icon]:hidden"
    >
      {(data) => <Lists data={data} onMediaSelect={onMediaSelect} />}
    </Skeleton>
  );
}

function Lists({
  data,
  onMediaSelect,
}: {
  data: StorageLevel;
  onMediaSelect?: (media: MediaFile) => void;
}) {
  const folders = data.folders.slice(0, MAX_ROWS);
  const recent = [...data.files]
    .sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? ""))
    .slice(0, MAX_ROWS);

  return (
    <div className="flex flex-col gap-2">
      {folders.length > 0 && (
        <SidebarGroup>
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
        <SidebarGroup>
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
    </div>
  );
}
