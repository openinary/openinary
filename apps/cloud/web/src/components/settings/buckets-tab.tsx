"use client";

import { DefaultDialog, formatFileSize, Spinner } from "@openinary/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BucketAvatar } from "@/components/bucket-avatar";
import { useSettingsDialog } from "@/components/settings/use-settings-dialog";
import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/utils/orpc";

// Not an oRPC procedure: the sweep needs the Worker's R2/KV bindings, which
// the oRPC context has no access to (see the route's comment in
// apps/server/worker/app.ts).
async function deleteBucketRequest(bucketId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URL}/buckets/${bucketId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to delete bucket");
  }
}

/**
 * The footprint is a cached snapshot, only ever written by POST
 * /storage/stats/recalculate (see the Storage tab), so a bucket reads empty
 * until it has been measured once. formatFileSize isn't used for that case:
 * its own falsy check answers "Unknown" for zero bytes.
 */
function describeFootprint(bucket: {
  storageBytes: number;
  storageFileCount: number;
}): string {
  if (bucket.storageFileCount === 0) return "Empty · 0 B";
  return `${formatFileSize(bucket.storageBytes)} · ${bucket.storageFileCount} ${
    bucket.storageFileCount === 1 ? "file" : "files"
  }`;
}

export function BucketsTab() {
  const queryClient = useQueryClient();
  const buckets = useQuery(orpc.bucket.list.queryOptions());
  const quota = useQuery(orpc.bucket.quota.queryOptions());
  const [, setSettingsTab] = useSettingsDialog();
  const { isSwitching, switchingToId, switchToBucket } = useBucketSwitch();

  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Both, always: the quota's `used` count moves with every create and delete.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.bucket.list.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.bucket.quota.key() }),
    ]);

  const create = useMutation(orpc.bucket.create.mutationOptions());
  const rename = useMutation(
    orpc.bucket.rename.mutationOptions({ onSuccess: refresh }),
  );

  const isOnlyBucket = buckets.data?.length === 1;
  const atLimit = !!quota.data && quota.data.used >= quota.data.limit;
  // No quota yet (loading, or it failed) means no create: an enabled field
  // would take a name the server is about to refuse.
  const canCreate = !!quota.data && !atLimit;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || !canCreate) return;
    try {
      const created = await create.mutateAsync({ name });
      setNewName("");
      await switchToBucket(created.id);
      await refresh();
      toast.success(`Switched to “${name}”`);
    } catch (error) {
      // Carries the plan-limit message when the server refuses the create.
      toast.error(
        error instanceof Error ? error.message : "Couldn't create bucket",
      );
    }
  };

  const commitRename = async (bucketId: string, original: string) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === original) return;
    try {
      await rename.mutateAsync({ bucketId, name });
    } catch {
      toast.error("Couldn't rename bucket");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await deleteBucketRequest(toDelete.id);
      // The keys pinned to it are gone server-side, and the storage tree still
      // holds the deleted bucket's listing if it was the active one.
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: orpc.apiKey.list.key() }),
        queryClient.invalidateQueries({
          queryKey: ["openinary", "storage-tree"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["openinary", "storage-folders"],
        }),
      ]);
      toast.success(`Deleted “${toDelete.name}”`);
      setToDelete(null);
      setConfirmName("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't delete bucket",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-medium text-sm">Buckets</p>
        <p className="mt-1 text-muted-foreground text-xs">
          Each bucket is a separate space for your media - files, folders and
          transforms never cross between them. Only one is active at a time; API
          keys are pinned to a single bucket at creation.
        </p>
      </div>

      <div className="space-y-2">
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-muted-foreground text-xs">New bucket</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Staging"
              maxLength={60}
              disabled={!canCreate}
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={
              create.isPending || isSwitching || !canCreate || !newName.trim()
            }
          >
            {create.isPending || isSwitching ? "Creating…" : "Create"}
          </Button>
        </form>
        {!quota.data && (
          <p className="text-muted-foreground text-xs">
            {quota.isError
              ? "Couldn't check your plan's bucket limit."
              : "Checking your plan's bucket limit…"}
          </p>
        )}
        {quota.data && (
          <p className="text-muted-foreground text-xs">
            {quota.data.used} of {quota.data.limit} bucket
            {quota.data.limit === 1 ? "" : "s"} used on your plan.
            {atLimit && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setSettingsTab("plan")}
                >
                  Upgrade for more
                </button>
                .
              </>
            )}
          </p>
        )}
      </div>

      <Separator />

      <div>
        <p className="font-medium text-sm">Your buckets</p>
        {buckets.isLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : buckets.isError ? (
          <p className="mt-3 text-destructive text-sm">
            Failed to load buckets.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border">
            {buckets.data?.map((bucket) => (
              <div
                key={bucket.id}
                className="flex items-center gap-3 border-b px-3 py-2.5 text-xs last:border-0"
              >
                <BucketAvatar name={bucket.name} size={28} />
                <div className="min-w-0 flex-1">
                  {renamingId === bucket.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      maxLength={60}
                      className="text-xs"
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(bucket.id, bucket.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          commitRename(bucket.id, bucket.name);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex max-w-full items-center gap-1.5 truncate rounded-md px-1 py-0.5 font-medium hover:bg-muted"
                      onClick={() => {
                        setRenamingId(bucket.id);
                        setRenameValue(bucket.name);
                      }}
                      title="Rename"
                    >
                      <span className="truncate">{bucket.name}</span>
                      {bucket.active && (
                        <Check className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  )}
                  <p className="mt-0.5 truncate px-1 text-muted-foreground">
                    {describeFootprint(bucket)} · created{" "}
                    {new Date(bucket.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {bucket.active ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                      Active
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      disabled={isSwitching}
                      onClick={() => switchToBucket(bucket.id)}
                    >
                      {switchingToId === bucket.id ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        "Switch"
                      )}
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={isOnlyBucket}
                        onClick={() =>
                          setToDelete({ id: bucket.id, name: bucket.name })
                        }
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                        aria-label="Delete bucket"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isOnlyBucket
                        ? "You can't delete your only bucket"
                        : "Delete"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DeleteConfirmDialog has no type-to-confirm field, and this one is
          worth the friction: it takes every file in the bucket with it. */}
      {toDelete && (
        <DefaultDialog
          title={`Delete “${toDelete.name}”`}
          isOpen
          // Same width as DeleteConfirmDialog, which every other delete in the
          // app uses - this one only differs by the type-to-confirm field.
          contentClassName="max-w-[384px]"
          onClose={() => {
            if (isDeleting) return;
            setToDelete(null);
            setConfirmName("");
          }}
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              This permanently deletes every file and folder in this bucket, all
              of its cached transformations, and any API key scoped to it. It
              can't be undone.
            </p>
            <label className="block space-y-1.5">
              <span className="text-muted-foreground text-xs">
                Type <span className="font-medium">{toDelete.name}</span> to
                confirm
              </span>
              <Input
                autoFocus
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                disabled={isDeleting}
              />
            </label>
            {/* Same bleeding footer bar DeleteConfirmDialog renders, which
                DefaultDialog doesn't provide - and DialogFooter/DialogClose
                aren't exported from @openinary/ui. */}
            <div className="-mx-4 -mb-4 flex flex-row justify-end gap-2 rounded-b-lg border-t bg-muted/50 px-4 py-4">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={() => {
                  setToDelete(null);
                  setConfirmName("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="w-[70px]"
                disabled={isDeleting || confirmName !== toDelete.name}
                onClick={handleDelete}
              >
                {isDeleting ? <Spinner size={16} /> : "Delete"}
              </Button>
            </div>
          </div>
        </DefaultDialog>
      )}
    </div>
  );
}
