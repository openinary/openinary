"use client";

import { HardDrive, KeyRound, User } from "lucide-react";
import { useQueryState } from "nuqs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AccountTab } from "./account-tab";
import { ApiKeysTab } from "./api-keys-tab";
import { StorageTab } from "./storage-tab";

interface SettingsDialogProps {
  userName: string;
  userEmail: string;
  userAvatar: string;
}

const SETTINGS_NAV = [
  { value: "account", label: "Account", icon: User },
  { value: "api-keys", label: "API Keys", icon: KeyRound },
  { value: "storage", label: "Storage", icon: HardDrive },
] as const;

export function SettingsDialog({
  userName,
  userEmail,
  userAvatar,
}: SettingsDialogProps) {
  const [tab, setTab] = useQueryState("settings");

  const dialogOpen = tab !== null;
  const activeTab = tab || "account";
  const activeItem =
    SETTINGS_NAV.find((item) => item.value === activeTab) ?? SETTINGS_NAV[0];

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => !open && setTab(null)}
    >
      <DialogContent className="flex h-[520px] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex w-48 shrink-0 flex-col gap-0.5 border-r bg-muted/30 px-3 py-4">
          <span className="px-2 pb-3 text-xs font-medium text-muted-foreground">
            Settings
          </span>
          {SETTINGS_NAV.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                activeTab === value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <ScrollArea className="flex-1">
          <div className="px-8 py-6">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              {activeItem.label}
            </h2>
            {activeTab === "account" && (
              <AccountTab
                userName={userName}
                userEmail={userEmail}
                userAvatar={userAvatar}
                isOpen={dialogOpen && activeTab === "account"}
              />
            )}
            {activeTab === "api-keys" && <ApiKeysTab />}
            {activeTab === "storage" && <StorageTab />}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
