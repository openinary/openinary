"use client";

import { ApiKeyManager } from "@/components/api-key-manager";
import { NavHeader } from "@/components/nav-header";

export default function ApiKeysPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <NavHeader currentPage="api-keys" />

      <div className="px-6 py-8">
        <div className="mx-auto space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold lg:text-4xl">API Keys</h1>
            <p className="text-muted-foreground leading-relaxed">
              Manage your API keys for accessing the Openinary API
            </p>
          </div>

          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
}


