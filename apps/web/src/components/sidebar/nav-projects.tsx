"use client"

import { LazyStorageTree } from "@/components/sidebar/lazy-storage-tree"
import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"
import type { MediaFile } from "@openinary/ui"

interface NavProjectsProps {
  onMediaSelect?: (media: MediaFile) => void
}

export function NavProjects({ onMediaSelect }: NavProjectsProps) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Assets</SidebarGroupLabel>
      <LazyStorageTree onMediaSelect={onMediaSelect} />
    </SidebarGroup>
  )
}
