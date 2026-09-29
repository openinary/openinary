"use client";

import { Spinner, UserAvatar } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, LogOut, Settings, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { BucketAvatar } from "@/components/bucket-avatar";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
import { UsagePanel } from "@/components/sidebar/nav-plan";
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
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/**
 * Sits where the logo used to be. The top half only switches - creating,
 * renaming and deleting live in the Buckets settings tab - and the bottom half
 * is the account menu: who is signed in, usage, settings, sign out. Buckets are an app-level concept
 * only (there is still a single real R2 bucket underneath, see
 * apps/server/worker/r2-storage.ts) and the active one is a per-account
 * setting the server resolves for every storage/upload/transform request, not
 * something threaded through @openinary/ui - so the switch itself, and the
 * cache teardown it implies, lives in BucketSwitchProvider.
 */
export function BucketSwitcher() {
  const setSettingsTab = useSettingsPage();
  const { isSwitching, switchingToId, switchToBucket } = useBucketSwitch();
  const router = useRouter();
  const user = authClient.useSession().data?.user;
  const userName = user?.name || user?.email?.split("@")[0] || "User";

  const { data: buckets, isLoading } = useQuery(
    orpc.bucket.list.queryOptions(),
  );

  const activeBucket = buckets?.find((b) => b.active) ?? buckets?.[0];

  return (
    <SidebarMenu className="min-w-0 flex-1">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="w-fit max-w-full text-sidebar-foreground data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-1.5!"
              disabled={isLoading || isSwitching}
            >
              {isSwitching ? (
                <div className="flex size-5 shrink-0 items-center justify-center">
                  <Spinner className="size-4" />
                </div>
              ) : (
                <BucketAvatar
                  name={activeBucket?.name ?? "Openinary"}
                  size={20}
                />
              )}
              <span className="truncate font-medium">
                {activeBucket?.name ?? "Openinary"}
              </span>
              <ChevronDown className="size-3.5!" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-60 rounded-lg"
            side="bottom"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Buckets
            </DropdownMenuLabel>
            {buckets?.map((b) => (
              <DropdownMenuItem
                key={b.id}
                disabled={isSwitching}
                onSelect={() => {
                  if (b.active) return;
                  switchToBucket(b.id);
                }}
              >
                <BucketAvatar name={b.name} size={20} />
                <span className="flex-1 truncate">{b.name}</span>
                {switchingToId === b.id ? (
                  <Spinner className="size-4" />
                ) : (
                  b.active && <Check className="size-4" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isSwitching}
              onSelect={() => setSettingsTab("buckets")}
            >
              <Settings2 className="size-4" />
              Manage buckets
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <UserAvatar
                name={userName}
                email={user?.email ?? ""}
                image={user?.image ?? ""}
                className="size-8 rounded-lg"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="p-0 font-normal">
              <UsagePanel />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSettingsTab("appearance")}>
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/") },
                });
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
