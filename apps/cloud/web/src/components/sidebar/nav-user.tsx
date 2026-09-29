"use client";

import { UserAvatar } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import { useSettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { CLOUD_AVAILABLE, FEATURES, isMeteredPlan } from "@/lib/usage";
import { orpc } from "@/utils/orpc";

const pct = (used: number, granted: number) =>
  granted > 0 ? Math.min(Math.round((used / granted) * 100), 100) : 0;

function UsagePanel() {
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

export function NavUser() {
  const router = useRouter();
  const [, setSettingsTab] = useSettingsDialog();
  const { data: session, isPending } = authClient.useSession();
  const { data: usage } = useQuery(orpc.usage.get.queryOptions());

  // Free only. On a metered plan the allowance is a billing threshold, not a
  // wall, and a red halo around your own avatar all month reads as "your
  // account is broken".
  const ringPercentage =
    usage && !isMeteredPlan(usage.planId)
      ? Math.max(
          ...Object.values(usage.features).map((f) =>
            f.unlimited ? 0 : pct(f.used, f.granted),
          ),
        )
      : null;

  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            disabled
            className="group-data-[collapsible=icon]:p-1.5!"
          >
            <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const user = session?.user;
  if (!user) return null;

  const userName = user.name || user.email?.split("@")[0] || "User";
  const userEmail = user.email || "";

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="min-w-0 flex-1 text-sidebar-foreground data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-1.5!">
              {/* 20px avatar, 26px ring: fits the 28px row and the 32px
                  collapsed button alike, so neither state needs its own size. */}
              <div className="relative flex size-5 shrink-0 items-center justify-center">
                {ringPercentage !== null && (
                  <CircularProgress
                    value={ringPercentage}
                    size={26}
                    thickness={2}
                    className={`-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 max-w-none ${ringPercentage >= 80 ? "text-destructive" : "text-primary"}`}
                  />
                )}
                <UserAvatar
                  name={userName}
                  email={userEmail}
                  image={user.image ?? ""}
                  className="size-5 rounded-full text-[9px]"
                />
              </div>
              <span className="truncate">{userName}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side="right"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserAvatar
                  name={userName}
                  email={userEmail}
                  image={user.image ?? ""}
                  className="h-8 w-8 rounded-lg"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="truncate text-xs">{userEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="p-0 font-normal">
              <UsagePanel />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSettingsTab("appearance")}>
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => router.push("/"),
                  },
                });
              }}
            >
              <LogOut className="mr-2 size-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Same audience the quiet footer button had: Free, while Alpha is
            the offer. */}
        {usage && !CLOUD_AVAILABLE && !isMeteredPlan(usage.planId) && (
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
