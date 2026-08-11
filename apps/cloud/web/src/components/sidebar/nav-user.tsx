"use client";

import { UserAvatar } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { FEATURES, isMeteredPlan } from "@/lib/usage";
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
  const collapsed = useSidebar().state === "collapsed";
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
          <SidebarMenuButton size="lg" disabled>
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <div className="grid flex-1 gap-1 text-left text-sm leading-tight">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
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
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {/* Collapsed, the button is exactly 32px and clips its overflow,
                  so the ring can't orbit outside a 32px avatar - shrink both
                  down a notch and keep the gap. */}
              <div
                className={`relative flex shrink-0 items-center justify-center ${collapsed ? "size-8" : ""}`}
              >
                {ringPercentage !== null && (
                  <CircularProgress
                    value={ringPercentage}
                    size={collapsed ? 32 : 36}
                    thickness={2}
                    className={`-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 ${ringPercentage >= 80 ? "text-destructive" : "text-primary"}`}
                  />
                )}
                <UserAvatar
                  name={userName}
                  email={userEmail}
                  image={user.image ?? ""}
                  className={`rounded-full ${collapsed ? "size-7" : "size-8"}`}
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-xs">{userEmail}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
