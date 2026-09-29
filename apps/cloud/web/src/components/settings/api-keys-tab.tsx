"use client";

import {
  CopyInput,
  DeleteConfirmDialog,
  SettingsActions,
  SettingsField,
  SettingsFields,
  SettingsList,
  SettingsSection,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openinary/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Power, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

const DEFAULT_EXPIRES = "365";

export function ApiKeysTab() {
  const queryClient = useQueryClient();
  const keys = useQuery(orpc.apiKey.list.queryOptions());
  const buckets = useQuery(orpc.bucket.list.queryOptions());

  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [expires, setExpires] = useState(DEFAULT_EXPIRES);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.apiKey.list.key() });

  const create = useMutation(
    orpc.apiKey.create.mutationOptions({ onSuccess: refresh }),
  );
  const setEnabled = useMutation(
    orpc.apiKey.setEnabled.mutationOptions({ onSuccess: refresh }),
  );
  const remove = useMutation(
    orpc.apiKey.delete.mutationOptions({ onSuccess: refresh }),
  );

  const bucketName = (id: string) =>
    buckets.data?.find((b) => b.id === id)?.name ?? "Unknown bucket";

  // Derived rather than synced through an effect: the list arrives after the
  // first render, and the first bucket is the only sensible default now that
  // "no bucket" isn't an option.
  const selectedScope = scope || buckets.data?.[0]?.id || "";

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const days = Number.parseInt(expires, 10);
    if (!name.trim() || !Number.isInteger(days) || days < 1 || days > 365) {
      toast.error("Enter a name and an expiry between 1 and 365 days.");
      return;
    }
    if (!selectedScope) {
      toast.error("Select a bucket for this key.");
      return;
    }
    try {
      const { key } = await create.mutateAsync({
        name: name.trim(),
        bucketId: selectedScope,
        expiresInDays: days,
      });
      setCreatedKey(key);
      setName("");
      setExpires(DEFAULT_EXPIRES);
      toast.success("API key created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create API key",
      );
    }
  };

  return (
    <div className="space-y-6">
      {createdKey && (
        <div className="relative rounded-lg border p-3 pr-9">
          <button
            type="button"
            onClick={() => setCreatedKey(null)}
            className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
          <p className="mb-2 text-muted-foreground text-xs">
            Copy this key now - it won't be shown again.
          </p>
          <CopyInput value={createdKey} />
        </div>
      )}

      <form onSubmit={handleCreate}>
        <SettingsSection
          title="Create a key"
          description={
            <>
              Send a key as the <code className="font-mono">x-api-key</code>{" "}
              header, or as{" "}
              <code className="font-mono">Authorization: Bearer</code>, to
              authenticate requests. Each key is locked to one bucket, so what
              an integration writes to never depends on what's selected in this
              dashboard.
            </>
          }
        >
          <SettingsFields>
            <SettingsField label="Key name" className="col-span-full">
              {/* Naming the key is the first thing to do on this page, and the
                  onboarding checklist links straight here to do exactly that. */}
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production"
                maxLength={32}
              />
            </SettingsField>
            <SettingsField label="Bucket" hint="Can't be changed later.">
              <Select
                disabled={!buckets.data?.length}
                items={buckets.data?.map((bucket) => ({
                  value: bucket.id,
                  label: bucket.name,
                }))}
                onValueChange={(value) => value !== null && setScope(value)}
                value={selectedScope || null}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {buckets.data?.map((bucket) => (
                    <SelectItem key={bucket.id} value={bucket.id}>
                      {bucket.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>
            <SettingsField label="Expires in (days)" hint="Up to 365.">
              <Input
                type="number"
                min={1}
                max={365}
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </SettingsField>
          </SettingsFields>
          <SettingsActions>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create key"}
            </Button>
          </SettingsActions>
        </SettingsSection>
      </form>

      <Separator />

      <SettingsSection
        title="Your keys"
        description="Disable a key to pause it, delete it to revoke it for good."
      >
        {keys.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : keys.isError ? (
          <p className="text-destructive text-sm">
            Failed to load API keys.
          </p>
        ) : keys.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No keys yet. Create one above.
          </p>
        ) : (
          <SettingsList>
            {keys.data?.map((key) => (
              <div
                key={key.id}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate font-medium",
                      !key.enabled && "text-muted-foreground",
                    )}
                  >
                    {key.name ?? "Unnamed key"}
                    {!key.enabled && (
                      <span className="ml-1.5 font-normal">(disabled)</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    <span className="font-mono">
                      {key.start ? `${key.start}…` : "-"}
                    </span>
                    {" · "}
                    {key.bucketId ? (
                      bucketName(key.bucketId)
                    ) : (
                      // Pre-dates one-bucket-per-key. Still works, but follows
                      // the active bucket, so it's worth replacing.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-amber-600 underline decoration-dotted dark:text-amber-500">
                            No bucket
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Legacy key: writes to whichever bucket is active.
                          Replace it with a bucket-scoped one.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {key.expiresAt &&
                      ` · expires ${new Date(key.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={setEnabled.isPending}
                        onClick={() =>
                          setEnabled.mutate({
                            keyId: key.id,
                            enabled: !key.enabled,
                          })
                        }
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label={key.enabled ? "Disable key" : "Enable key"}
                      >
                        {key.enabled ? (
                          <Ban className="size-3.5" />
                        ) : (
                          <Power className="size-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {key.enabled ? "Disable" : "Enable"}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          setKeyToDelete({ id: key.id, name: key.name })
                        }
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete key"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </SettingsList>
        )}
      </SettingsSection>

      <DeleteConfirmDialog
        isOpen={!!keyToDelete}
        onClose={() => setKeyToDelete(null)}
        title="Delete API key"
        description={`Delete "${keyToDelete?.name ?? "this API key"}"? Any integration using it will stop working immediately.`}
        onConfirm={async () => {
          if (!keyToDelete) return;
          await remove.mutateAsync({ keyId: keyToDelete.id });
          setKeyToDelete(null);
          toast.success("API key deleted");
        }}
      />
    </div>
  );
}
