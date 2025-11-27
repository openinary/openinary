"use client"

import { TreeView } from "@/components/ui/tree-view"
import { Skeleton } from "@/components/ui/skeleton"
import { useStorageTree } from "@/hooks/use-storage-tree"
import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"

function TreeSkeleton() {
  return (
    <div className="space-y-1 px-2">
      {/* Root level items */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex items-center gap-2 pl-4">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-2 pl-4">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-center gap-2 pl-4">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  )
}

export function NavProjects() {
  const { data, isLoading, error } = useStorageTree()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Assets</SidebarGroupLabel>
      {isLoading && <TreeSkeleton />}
      {error && (
        <p className="text-sm text-red-600 px-2">
          {error instanceof Error ? error.message : "Failed to load storage"}
        </p>
      )}
      {!isLoading && !error && data && (
        <TreeView
          data={data}
          expandAll
        />
      )}
    </SidebarGroup>
  )
}
