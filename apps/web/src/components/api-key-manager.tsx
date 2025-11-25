"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { X } from "lucide-react";
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
import { CopyInput } from "./ui/copy-input";
import { authClient } from "@/lib/auth-client";

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
        setKeys(result.data as ApiKey[]);
      }
    } catch (err) {
      console.error("Error loading API keys:", err);
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  const onCreateKey = async (values: ApiKeyFormValues) => {
    try {
      setError(null);
      const expiresInDays = parseInt(values.expires, 10);
      const expiresInSeconds = expiresInDays * 24 * 60 * 60;

      const result = await authClient.apiKey.create({
        name: values.name || "API Key",
        expiresIn: expiresInSeconds,
      });

      if (result.data && "key" in result.data) {
        setCreatedKey(result.data.key);
        form.reset({
          name: "",
          expires: "365",
        });
        await loadKeys();
      } else if (result.error) {
        setError(result.error.message || "Failed to create API key");
      }
    } catch (err) {
      console.error("Error creating API key:", err);
      setError("Failed to create API key");
    }
  };

  const deleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key?")) {
      return;
    }

    try {
      const result = await authClient.apiKey.delete({
        keyId,
      });

      if (result.data) {
        await loadKeys();
      } else if (result.error) {
        setError(result.error.message || "Failed to delete API key");
      }
    } catch (err) {
      console.error("Error deleting API key:", err);
      setError("Failed to delete API key");
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
      console.error("Error updating API key:", err);
      setError("Failed to update API key");
    }
  };


  return (
    <div className="space-y-6">
      {/* Created Key Alert */}
      {createdKey && (
        <div className="relative p-4 border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <button
            onClick={() => setCreatedKey(null)}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            aria-label="Dismiss"
          >
            <X size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 pr-6">
            API Key Created Successfully!
          </h3>
          <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">
            Save this key now - it will not be shown again!
          </p>
          <CopyInput value={createdKey} />
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          <Button
            onClick={() => setError(null)}
            variant="ghost"
            className="mt-2"
            size="sm"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Create New Key */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Create New API Key</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onCreateKey)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key Name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="My API Key"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expires"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires In (days)</FormLabel>
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
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Create API Key"}
            </Button>
          </form>
        </Form>
      </div>

      {/* Existing Keys */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Your API Keys</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet. Create one above!</p>
        ) : (
          <div className="space-y-4">
            {keys.map((key) => (
              <div
                key={key.id}
                className="border rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium">{key.name || "Unnamed Key"}</h4>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        key.enabled
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {key.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Created: {new Date(key.createdAt).toLocaleDateString()}
                    {key.expiresAt && (
                      <> • Expires: {new Date(key.expiresAt).toLocaleDateString()}</>
                    )}
                    {key.start && ` • Start with: ${key.start}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => updateKey(key.id, { enabled: !key.enabled })}
                    variant="outline"
                    size="sm"
                  >
                    {key.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    onClick={() => deleteKey(key.id)}
                    variant="destructive"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

