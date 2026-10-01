"use client";

import {
  ApiKeyScope,
  ApiKeysCard,
  CreateApiKeyDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsField,
} from "@openinary/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { orpc } from "@/utils/orpc";

const DEFAULT_EXPIRES = "365";

export function ApiKeysTab() {
  const queryClient = useQueryClient();
  const keys = useQuery(orpc.apiKey.list.queryOptions());
  const buckets = useQuery(orpc.bucket.list.queryOptions());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [expires, setExpires] = useState(DEFAULT_EXPIRES);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

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

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setCreatedKey(null);
      setName("");
      setExpires(DEFAULT_EXPIRES);
    }
  };

  const handleCreate = async () => {
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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create API key",
      );
    }
  };

  return (
    <>
      <ApiKeysCard
        keys={keys.data?.map((key) => ({
          ...key,
          scopes: [
            key.bucketId ? (
              <ApiKeyScope key="bucket">{bucketName(key.bucketId)}</ApiKeyScope>
            ) : (
              // Pre-dates one-bucket-per-key. Still works, but follows the
              // active bucket, so it's worth replacing.
              <ApiKeyScope
                key="bucket"
                title="Legacy key: writes to whichever bucket is active. Replace it with a bucket-scoped one."
                className="border-amber-600/30 text-amber-700 dark:text-amber-500"
              >
                any bucket
              </ApiKeyScope>
            ),
          ],
        }))}
        isLoading={keys.isLoading}
        error={keys.isError ? "Failed to load API keys." : null}
        onCreate={() => setDialogOpen(true)}
        onToggle={(key) =>
          setEnabled.mutateAsync({ keyId: key.id, enabled: !key.enabled })
        }
        onRevoke={async (key) => {
          await remove.mutateAsync({ keyId: key.id });
          toast.success(`Revoked "${key.name ?? "API key"}"`);
        }}
      />

      <CreateApiKeyDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        createdKey={createdKey}
        pending={create.isPending}
        onSubmit={handleCreate}
        description={
          <>
            Send it as the <code className="font-mono">x-api-key</code> header,
            or as <code className="font-mono">Authorization: Bearer</code>.
            Each key is locked to one bucket.
          </>
        }
      >
        <SettingsField label="Key name" className="col-span-full">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production server"
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
      </CreateApiKeyDialog>
    </>
  );
}
