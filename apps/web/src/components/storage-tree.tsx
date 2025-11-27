"use client";

import { TreeView } from "@/components/ui/tree-view";
import { useStorageTree } from "@/hooks/use-storage-tree";

export function StorageTree() {
  const { data, isLoading, error } = useStorageTree();

  return (
    <section className="flex-1">
      <div className="space-y-2">
        <h2 className="text-left text-xl font-semibold">Storage content</h2>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading storage...</p>
        )}
        {error && (
          <p className="text-sm text-red-600">
            {error instanceof Error ? error.message : "Failed to load storage"}
          </p>
        )}
        {!isLoading && !error && data && (
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



