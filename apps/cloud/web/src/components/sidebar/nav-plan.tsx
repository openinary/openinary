"use client";

import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "skullet/react";

import { useSettingsPage } from "@/components/settings/use-settings-page";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";
import { CLOUD_AVAILABLE, FEATURES, isMeteredPlan } from "@/lib/usage";
import { client, orpc } from "@/utils/orpc";

const pct = (used: number, granted: number) =>
  granted > 0 ? Math.min(Math.round((used / granted) * 100), 100) : 0;

type Usage = Awaited<ReturnType<typeof client.usage.get>>;

// Measured into the skeleton while the real figures load.
const SAMPLE_USAGE = {
  planId: "free",
  features: Object.fromEntries(
    FEATURES.map((feature) => [
      feature.id,
      { used: 512, granted: 1024, unlimited: false },
    ]),
  ),
} as unknown as Usage;

export function UsagePanel() {
  const { data } = useQuery(orpc.usage.get.queryOptions());

  return (
    <Skeleton data={data} sample={SAMPLE_USAGE} label="Loading usage">
      {(data) => <UsageRows data={data} />}
    </Skeleton>
  );
}

function UsageRows({ data }: { data: Usage }) {
  const isMetered = isMeteredPlan(data.planId);

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
  const hydrated = useHydrated();

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
        {/* Remembered under its id: a reload reserves the button's width only
            when it was there last time, so Settings never narrows under it. */}
        {hydrated && (
          <Skeleton
            id="nav-upgrade"
            loading={!usage}
            className="shrink-0 group-data-[collapsible=icon]:hidden"
          >
            {(!usage || (!CLOUD_AVAILABLE && !metered)) && (
              <Button
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setSettingsTab("billing")}
              >
                Upgrade
              </Button>
            )}
          </Skeleton>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
