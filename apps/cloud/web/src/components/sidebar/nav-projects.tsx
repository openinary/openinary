"use client";

import type { MediaFile } from "@openinary/ui";

import { LazyStorageTree } from "@/components/sidebar/lazy-storage-tree";
import { SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar";
import { useBucketIsEmpty } from "@/hooks/use-bucket-empty";
import { cn, FADE_IN } from "@/lib/utils";

interface NavProjectsProps {
  onMediaSelect?: (media: MediaFile) => void;
}

export function NavProjects({ onMediaSelect }: NavProjectsProps) {
  const isEmpty = useBucketIsEmpty();

  // Strictly `=== false`, so neither "empty" nor "not known yet" renders. An
  // "Assets" heading over an empty tree is a label for nothing, and showing it
  // while the listing is in flight only to pull it back is the same pop from
  // the other direction - the group waits until it is sure, then fades in.
  if (isEmpty !== false) return null;

  return (
    <SidebarGroup
      className={cn("group-data-[collapsible=icon]:hidden", FADE_IN)}
    >
      <SidebarGroupLabel>Assets</SidebarGroupLabel>
      <LazyStorageTree onMediaSelect={onMediaSelect} />
    </SidebarGroup>
  );
}
