"use client";

import { useState } from "react";
import { Database, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DeleteConfirmDialog,
  useClearCache,
  useRecalculateStorageStats,
  useStorageStats,
} from "@openinary/ui";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(2)} ${units[exponent]}`;
}

function formatUpdatedAt(iso: string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function StorageTab() {
  const { data, isLoading, isError } = useStorageStats();
  const clearCache = useClearCache();
  const recalculate = useRecalculateStorageStats();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          View your storage usage and manage cached transformations.
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Recalculate from storage"
          disabled={isLoading || recalculate.isPending}
          onClick={() =>
            toast.promise(recalculate.mutateAsync(), {
              loading: "Recalculating storage",
              success: "Storage stats recalculated",
              error: (error) =>
                error instanceof Error
                  ? error.message
                  : "Failed to recalculate stats",
            })
          }
        >
          <RefreshCw
            className={cn("size-4", recalculate.isPending && "animate-spin")}
          />
        </Button>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          Failed to load storage information.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <HardDrive className="size-4" />
                <span className="text-xs font-medium">Storage used</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="text-xl font-semibold tracking-tight">
                  {formatBytes(data?.storage.size ?? 0)}
                </p>
              )}
              {!isLoading && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.storage.fileCount ?? 0} file
                  {(data?.storage.fileCount ?? 0) === 1 ? "" : "s"}
                </p>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Database className="size-4" />
                <span className="text-xs font-medium">Cache</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="text-xl font-semibold tracking-tight">
                  {formatBytes(data?.cache.size ?? 0)}
                </p>
              )}
              {!isLoading && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.cache.fileCount ?? 0} cached file
                  {(data?.cache.fileCount ?? 0) === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
          {!isLoading && data?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Updated {formatUpdatedAt(data.updatedAt)}
            </p>
          )}
        </div>
      )}

      <Separator />

      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Clear cache</p>
          <p className="text-xs text-muted-foreground">
            Removes all cached image and video transformations. Original files
            are not affected.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={isLoading || (data?.cache.fileCount ?? 0) === 0}
        >
          <Trash2 className="size-4" />
          Clear
        </Button>
      </div>

      <DeleteConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear cache?"
        description="This will delete all cached transformations. They will be regenerated on next request."
        confirmLabel="Clear"
        onConfirm={async () => {
          try {
            await toast
              .promise(clearCache.mutateAsync(), {
                loading: "Clearing cache...",
                success: "Cache cleared",
                error: (error) =>
                  error instanceof Error
                    ? error.message
                    : "Failed to clear cache",
              })
              .unwrap();
          } finally {
            setConfirmOpen(false);
          }
        }}
      />
    </div>
  );
}
