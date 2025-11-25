"use client";

import { TreeView, type TreeDataItem } from "@/components/ui/tree-view";
import { File, FileImage, FileVideo, Folder } from "lucide-react";
import { useEffect, useState } from "react";

type ApiTreeItem = {
  id: string;
  name: string;
  children?: ApiTreeItem[];
};

export function StorageTree() {
  const [data, setData] = useState<TreeDataItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

    if (!baseUrl) {
      setError("NEXT_PUBLIC_API_BASE_URL is not configured.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchStorage = async () => {
      try {
        const res = await fetch(`${baseUrl}/storage`, {
          signal: controller.signal,
          credentials: 'include',
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

        setData(enhanceWithIcons(json));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to load storage");
      } finally {
        setLoading(false);
      }
    };

    fetchStorage();

    return () => controller.abort();
  }, []);

  return (
    <section className="flex-1">
      <div className="space-y-2">
        <h2 className="text-left text-xl font-semibold">Storage content</h2>
        {loading && (
          <p className="text-sm text-muted-foreground">Loading storage...</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && data && (
          <TreeView
            data={data}
            expandAll
            className="rounded-lg border border-black/10 bg-neutral-50 max-h-80 overflow-auto"
          />
        )}
      </div>
    </section>
  );
}



