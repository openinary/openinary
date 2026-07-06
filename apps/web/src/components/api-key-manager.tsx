"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Ban, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { CopyInput } from "./ui/copy-input";
import { Separator } from "./ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { authClient } from "@/lib/auth-client";
import logger from "@/lib/logger";
import { cn } from "@/lib/utils";

const apiKeyFormSchema = z.object({
  name: z.string().min(1, {
    message: "Key name is required",
  }),
  expires: z
    .string()
    .min(1, {
      message: "Expiration days is required",
    })
    .refine(
      (val) => {
        const num = parseInt(val, 10);
        return !isNaN(num) && num >= 1 && num <= 3650;
      },
      {
        message: "Expiration must be between 1 and 3650 days",
      }
    ),
});

type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>;

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  enabled: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  remaining: number | null;
  rateLimitEnabled: boolean;
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      name: "",
      expires: "365",
    },
  });

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const result = await authClient.apiKey.list();
      if (result.data) {
        const apiKeys = Array.isArray(result.data)
          ? result.data
          : (result.data as { apiKeys?: unknown[] }).apiKeys ?? [];
        setKeys(apiKeys as unknown as ApiKey[]);
      }
    } catch (err) {
      logger.error("Error loading API keys", { error: err });
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  const onCreateKey = async (values: ApiKeyFormValues) => {
    setError(null);
    const expiresInDays = parseInt(values.expires, 10);
    const expiresInSeconds = expiresInDays * 24 * 60 * 60;

    const createKey = async () => {
      const result = await authClient.apiKey.create({
        name: values.name || "API Key",
        expiresIn: expiresInSeconds,
      });

      if (!result.data || !("key" in result.data)) {
        throw new Error(result.error?.message || "Failed to create API key");
      }

      return result.data;
    };

    try {
      const data = await toast.promise(createKey(), {
        loading: `Creating "${values.name || "API Key"}"...`,
        success: `Created "${values.name || "API Key"}"`,
        error: (error) =>
          error instanceof Error ? error.message : "Failed to create API key",
      }).unwrap();

      setCreatedKey(data.key);
      form.reset({
        name: "",
        expires: "365",
      });
      await loadKeys();
    } catch (err) {
      logger.error("Error creating API key", { error: err });
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const deleteKey = async (keyId: string, keyName: string | null) => {
    const displayName = keyName || "API key";

    const del = async () => {
      const result = await authClient.apiKey.delete({
        keyId,
      });

      if (!result.data) {
        throw new Error(result.error?.message || "Failed to delete API key");
      }
    };

    try {
      await toast.promise(del(), {
        loading: `Deleting "${displayName}"...`,
        success: `Deleted "${displayName}"`,
        error: (error) =>
          error instanceof Error ? error.message : "Failed to delete API key",
      }).unwrap();
      await loadKeys();
    } catch (err) {
      logger.error("Error deleting API key", { error: err, keyId });
      setError(err instanceof Error ? err.message : "Failed to delete API key");
    }
  };

  const updateKey = async (keyId: string, updates: { name?: string; enabled?: boolean }) => {
    try {
      const result = await authClient.apiKey.update({
        keyId,
        ...updates,
      });

      if (result.data) {
        await loadKeys();
      } else if (result.error) {
        setError(result.error.message || "Failed to update API key");
      }
    } catch (err) {
      logger.error("Error updating API key", { error: err, keyId });
      setError("Failed to update API key");
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Create keys to authenticate requests to the Openinary API.
      </p>

      {createdKey && (
        <div className="relative rounded-lg border p-3 pr-9">
          <button
            onClick={() => setCreatedKey(null)}
            className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
          <p className="mb-2 text-xs text-muted-foreground">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <CopyInput value={createdKey} />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={() => setError(null)}
            className="text-xs underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onCreateKey)}
            className="flex items-start gap-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="flex-1 space-y-1">
                  <FormLabel className="text-xs font-normal text-muted-foreground">
                    Key name
                  </FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="New key" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expires"
              render={({ field }) => (
                <FormItem className="w-24 space-y-1">
                  <FormLabel className="text-xs font-normal text-muted-foreground">
                    Expires
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="365"
                      min="1"
                      max="3650"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-1">
              <p className="invisible text-xs">Expires</p>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </Form>
        <p className="mt-2 text-xs text-muted-foreground">
          Expires in days, defaults to 365.
        </p>
      </div>

      <Separator />

      <div>
        <p className="mb-3 text-sm font-medium">Your keys</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No API keys yet. Create one above.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <TooltipProvider delayDuration={0}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-3 text-xs">Name</TableHead>
                  <TableHead className="h-8 px-3 text-xs">Prefix</TableHead>
                  <TableHead className="h-8 px-3 text-xs">Status</TableHead>
                  <TableHead className="h-8 px-3 text-xs">Created</TableHead>
                  <TableHead className="h-8 w-16 px-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="px-3 py-2 font-medium">
                      {key.name || "Unnamed Key"}
                    </TableCell>
                    <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {key.start ? `${key.start}…` : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <span
                        className={cn(
                          "text-xs",
                          key.enabled
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {key.enabled ? "Active" : "Disabled"}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() =>
                                updateKey(key.id, { enabled: !key.enabled })
                              }
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label={
                                key.enabled ? "Disable key" : "Enable key"
                              }
                            >
                              {key.enabled ? (
                                <Ban size={14} />
                              ) : (
                                <Power size={14} />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="px-2 py-1 text-xs">
                            {key.enabled ? "Disable" : "Enable"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setKeyToDelete(key)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Delete key"
                            >
                              <Trash2 size={14} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="px-2 py-1 text-xs">
                            Delete
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TooltipProvider>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        isOpen={!!keyToDelete}
        onClose={() => setKeyToDelete(null)}
        title="Delete API key"
        description={`Are you sure you want to delete "${
          keyToDelete?.name || "this API key"
        }"? This action cannot be undone.`}
        onConfirm={async () => {
          if (!keyToDelete) return;
          await deleteKey(keyToDelete.id, keyToDelete.name);
          setKeyToDelete(null);
        }}
      />
    </div>
  );
}
