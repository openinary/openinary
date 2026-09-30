"use client";

import {
  type ApiKeyItem,
  ApiKeyScope,
  ApiKeysCard,
  CreateApiKeyDialog,
  SettingsField,
} from "@openinary/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import logger from "@/lib/logger";
import { Input } from "./ui/input";

const DEFAULT_EXPIRES = "365";
const DAY_SECONDS = 24 * 60 * 60;

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  lastRequest: Date | null;
  permissions: Record<string, string[]> | null;
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>();
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState(DEFAULT_EXPIRES);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const result = await authClient.apiKey.list();
      if (result.data) {
        const apiKeys = Array.isArray(result.data)
          ? result.data
          : ((result.data as { apiKeys?: unknown[] }).apiKeys ?? []);
        setKeys(apiKeys as unknown as ApiKey[]);
      }
    } catch (err) {
      logger.error("Error loading API keys", { error: err });
      setError("Failed to load API keys.");
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

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
    if (!name.trim() || !Number.isInteger(days) || days < 1 || days > 3650) {
      toast.error("Enter a name and an expiry between 1 and 3650 days.");
      return;
    }
    setCreating(true);
    try {
      const result = await authClient.apiKey.create({
        name: name.trim(),
        expiresIn: days * DAY_SECONDS,
      });
      if (!result.data || !("key" in result.data)) {
        throw new Error(result.error?.message || "Failed to create API key");
      }
      setCreatedKey(result.data.key);
      await loadKeys();
    } catch (err) {
      logger.error("Error creating API key", { error: err });
      toast.error(
        err instanceof Error ? err.message : "Failed to create API key",
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleKey = async (key: ApiKeyItem) => {
    const result = await authClient.apiKey.update({
      keyId: key.id,
      enabled: !key.enabled,
    });
    if (!result.data) {
      toast.error(result.error?.message || "Failed to update API key");
      return;
    }
    await loadKeys();
  };

  const revokeKey = async (key: ApiKeyItem) => {
    const result = await authClient.apiKey.delete({ keyId: key.id });
    if (!result.data) {
      toast.error(result.error?.message || "Failed to revoke API key");
      return;
    }
    toast.success(`Revoked "${key.name ?? "API key"}"`);
    await loadKeys();
  };

  return (
    <>
      <ApiKeysCard
        keys={keys?.map((key) => ({
          ...key,
          scopes: Object.entries(key.permissions ?? {}).flatMap(
            ([resource, actions]) =>
              actions.map((action) => (
                <ApiKeyScope key={`${resource}:${action}`}>
                  {resource}:{action}
                </ApiKeyScope>
              )),
          ),
        }))}
        isLoading={!keys && !error}
        error={error}
        onCreate={() => setDialogOpen(true)}
        onToggle={toggleKey}
        onRevoke={revokeKey}
      />

      <CreateApiKeyDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        createdKey={createdKey}
        pending={creating}
        onSubmit={handleCreate}
        description={
          <>
            Send it as the <code className="font-mono">x-api-key</code> header,
            or as <code className="font-mono">Authorization: Bearer</code>.
            Name it after the app that will use it.
          </>
        }
      >
        <SettingsField label="Key name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production server"
            maxLength={32}
          />
        </SettingsField>
        <SettingsField label="Expires in (days)" hint="Up to 3650.">
          <Input
            type="number"
            min={1}
            max={3650}
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </SettingsField>
      </CreateApiKeyDialog>
    </>
  );
}
