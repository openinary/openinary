"use client";

import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../lib/utils";

export interface SettingsNavItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: SettingsNavItem[];
  tab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

/** Composable settings dialog shell: nav + content layout only. Tab state
 * (nuqs, router params, useState, ...) and tab content are owned by the
 * consumer — pass whatever `nav` items and `children` you want. */
export function SettingsDialog({
  open,
  onOpenChange,
  nav,
  tab,
  onTabChange,
  children,
}: SettingsDialogProps) {
  const activeItem = nav.find((item) => item.value === tab) ?? nav[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[520px] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex w-48 shrink-0 flex-col gap-0.5 border-r bg-muted/30 px-3 py-4">
          <span className="px-2 pb-3 text-xs font-medium text-muted-foreground">
            Settings
          </span>
          {nav.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                tab === value
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
              {activeItem?.label}
            </h2>
            {children}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
