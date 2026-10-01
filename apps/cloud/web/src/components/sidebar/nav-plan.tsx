"use client";

import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import Link from "next/link";

import { useSettingsPage } from "@/components/settings/use-settings-page";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { CLOUD_AVAILABLE, FEATURES, isMeteredPlan } from "@/lib/usage";
import { orpc } from "@/utils/orpc";

const pct = (used: number, granted: number) =>
  granted > 0 ? Math.min(Math.round((used / granted) * 100), 100) : 0;

export function UsagePanel() {
  const { data, isLoading } = useQuery(orpc.usage.get.queryOptions());
  const isMetered = isMeteredPlan(data?.planId);

  if (isLoading || !data) {
    return (
      <div className="space-y-1 px-2 pb-1">
        {FEATURES.map((feature) => (
          <Skeleton className="h-5 w-full" key={feature.id} />
        ))}
      </div>
    );
  }

  // Rows on the menu's grid: the gauge sits in the icon column, so the
  // labels line up with every other item's text.
  return (
    <div className="pb-1">
      {FEATURES.map((feature) => {
        const usage = data.features[feature.id];
        const percentage = usage.unlimited ? 0 : pct(usage.used, usage.granted);
        return (
          <div
            key={feature.id}
            className="flex h-7 items-center gap-2.5 px-2 text-[13px]"
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {/* A metered plan has no wall to warn about, so no gauge and no
                  red: this menu is a glance at consumption, the plan tab has
                  the money. */}
              {!isMetered && (
                <CircularProgress
                  value={percentage}
                  size={14}
                  thickness={2}
                  className={
                    percentage >= 80 ? "text-destructive" : "text-primary"
                  }
                />
              )}
            </span>
            <span className="flex-1 truncate text-muted-foreground">
              {feature.short}
            </span>
            <span className="font-medium tabular-nums">
              {isMetered || usage.unlimited
                ? feature.format(usage.used)
                : `${feature.format(usage.used)} / ${feature.format(usage.granted)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The footer row: the way into Settings, and the way up from Free. The
 * account menu itself lives on the bucket switcher.
 */
export function NavSettings() {
  const setSettingsTab = useSettingsPage();
  const { data: usage } = useQuery(orpc.usage.get.queryOptions());
  const metered = isMeteredPlan(usage?.planId);

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-2">
        <SidebarMenuButton
          asChild
          tooltip="Settings"
          className="min-w-0 flex-1 text-sidebar-foreground"
        >
          <Link href="/settings">
            <Settings />
            <span>Settings</span>
          </Link>
        </SidebarMenuButton>
        {usage && !CLOUD_AVAILABLE && !metered && (
          <Button
            size="sm"
            className="h-6 px-2 text-xs group-data-[collapsible=icon]:hidden"
            onClick={() => setSettingsTab("billing")}
          >
            Upgrade
          </Button>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
