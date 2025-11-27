"use client";

import { useQuery } from "@tanstack/react-query";
import { File, FileImage, FileVideo, Folder } from "lucide-react";
import type { TreeDataItem } from "@/components/ui/tree-view";

type ApiTreeItem = {
  id: string;
  name: string;
  children?: ApiTreeItem[];
};

async function fetchStorageTree(): Promise<TreeDataItem[]> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  const res = await fetch(`${baseUrl}/storage`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  const json: ApiTreeItem[] = await res.json();

  const enhanceWithIcons = (items: ApiTreeItem[]): TreeDataItem[] => {
    const mapItem = (item: ApiTreeItem): TreeDataItem => {
      const hasChildren = !!item.children && item.children.length > 0;
      const lowerName = item.name.toLowerCase();

      let icon: any;

      if (hasChildren) {
        icon = Folder;
      } else if (
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".webp") ||
        lowerName.endsWith(".gif") ||
        lowerName.endsWith(".avif")
      ) {
        icon = FileImage;
      } else if (
        lowerName.endsWith(".mp4") ||
        lowerName.endsWith(".mov") ||
        lowerName.endsWith(".webm")
      ) {
        icon = FileVideo;
      } else {
        icon = File;
      }

      const children = item.children?.map(mapItem);

      // Sort children: folders first, then files
      const sortedChildren = children?.sort((a, b) => {
        const aIsFolder = a.icon === Folder;
        const bIsFolder = b.icon === Folder;

        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        id: item.id,
        name: item.name,
        icon,
        children: sortedChildren,
      };
    };

    const mappedItems = items.map(mapItem);

    // Sort root level: folders first, then files
    return mappedItems.sort((a, b) => {
      const aIsFolder = a.icon === Folder;
      const bIsFolder = b.icon === Folder;

      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  return enhanceWithIcons(json);
}

export function useStorageTree() {
  return useQuery({
    queryKey: ["storage-tree"],
    queryFn: fetchStorageTree,
  });
}

