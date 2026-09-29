"use client";

import { useQuery } from "@tanstack/react-query";
import { Rocket } from "lucide-react";

import { useSettingsDialog } from "@/components/settings-dialog";
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
  const [, setSettingsTab] = useSettingsDialog();
  const isMetered = isMeteredPlan(data?.planId);

  if (isLoading || !data) {
    return (
      <div className="w-full space-y-1.5 px-1 py-1.5">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5 px-1 py-1.5">
      {data.planId === "free" && (
        <div className="mb-4 flex w-full items-center justify-between">
          <span className="font-medium text-muted-foreground text-xs">
            Free Trial
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setSettingsTab("plan")}
          >
            Upgrade
          </Button>
        </div>
      )}

      {FEATURES.map((feature) => {
        const usage = data.features[feature.id];
        const percentage = usage.unlimited ? 0 : pct(usage.used, usage.granted);
        return (
          <div
            key={feature.id}
            className="flex w-full items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
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
              <span className="font-medium text-muted-foreground">
                {feature.short}
              </span>
            </div>
            <span className="font-medium">
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
 * The footer row: which plan the account is on, and the way up from Free.
 * The account menu itself lives on the bucket switcher.
 */
export function NavPlan() {
  const [, setSettingsTab] = useSettingsDialog();
  const { data: usage } = useQuery(orpc.usage.get.queryOptions());

  if (!usage) return null;
  const metered = isMeteredPlan(usage.planId);

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-2">
        <SidebarMenuButton
          tooltip="Plan"
          className="min-w-0 flex-1 text-sidebar-foreground group-data-[collapsible=icon]:p-1.5!"
          onClick={() => setSettingsTab("plan")}
        >
          <span className="-mx-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Rocket className="size-3" />
          </span>
          <span>{metered ? "Pay as you go" : "Free plan"}</span>
        </SidebarMenuButton>
        {!CLOUD_AVAILABLE && !metered && (
          <Button
            size="sm"
            className="h-6 px-2 text-xs group-data-[collapsible=icon]:hidden"
            onClick={() => setSettingsTab("plan")}
          >
            Upgrade
          </Button>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
