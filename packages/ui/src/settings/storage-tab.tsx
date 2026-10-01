"use client";

import { useState } from "react";
import { Database, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Skeleton } from "../ui/skeleton";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";
import { useClearCache, useRecalculateStorageStats, useStorageStats } from "../hooks/use-storage-stats";
import { cn } from "../lib/utils";
import { SettingsList, SettingsRow, SettingsSection } from "./settings-section";

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

  const stat = (size?: number, count?: number, noun = "file") =>
    isLoading ? (
      <Skeleton className="h-5 w-32" />
    ) : (
      <>
        <span className="font-medium tabular-nums">
          {formatBytes(size ?? 0)}
        </span>
        <span className="ml-2 text-muted-foreground tabular-nums">
          {count ?? 0} {noun}
          {(count ?? 0) === 1 ? "" : "s"}
        </span>
      </>
    );

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Usage"
        description="View your storage usage and manage cached transformations."
        action={
          <Button
            variant="outline"
            size="sm"
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
            Recalculate
          </Button>
        }
      >
        {isError ? (
          <p className="text-sm text-destructive">
            Failed to load storage information.
          </p>
        ) : (
          <>
            <SettingsList>
              <SettingsRow
                label={
                  <span className="flex items-center gap-2">
                    <HardDrive className="size-4 text-muted-foreground" />
                    Storage used
                  </span>
                }
              >
                {stat(data?.storage.size, data?.storage.fileCount)}
              </SettingsRow>
              <SettingsRow
                label={
                  <span className="flex items-center gap-2">
                    <Database className="size-4 text-muted-foreground" />
                    Cache
                  </span>
                }
              >
                {stat(data?.cache.size, data?.cache.fileCount, "cached file")}
              </SettingsRow>
            </SettingsList>
            {!isLoading && data?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Updated {formatUpdatedAt(data.updatedAt)}
              </p>
            )}
          </>
        )}
      </SettingsSection>

      <Separator />

      <SettingsSection title="Cache">
        <SettingsList>
          <SettingsRow
            label="Clear cache"
            description="Removes all cached image and video transformations. Original files are not affected."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={isLoading || (data?.cache.fileCount ?? 0) === 0}
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

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
