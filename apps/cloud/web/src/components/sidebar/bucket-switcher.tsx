"use client";

import { Spinner } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, LogOut, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { BucketAvatar } from "@/components/bucket-avatar";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
import { UsagePanel } from "@/components/sidebar/nav-plan";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
                  id={activeBucket?.id ?? "Openinary"}
                  size={20}
                />
              )}
              <span className="truncate font-medium">
                {activeBucket?.name ?? "Openinary"}
              </span>
              <ChevronDown className="size-3.5!" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {/* The sidebar's own width, flush under the trigger, so the menu
              reads as the header opening rather than as a popup beside it. */}
          <DropdownMenuContent
            className="w-58"
            side="bottom"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="truncate">
              Signed in as {user?.email ?? userName}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Buckets</DropdownMenuLabel>
              {buckets?.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  disabled={isSwitching}
                  onSelect={() => {
                    if (b.active) return;
                    switchToBucket(b.id);
                  }}
                >
                  <BucketAvatar id={b.id} size={16} className="rounded-[4px]" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {switchingToId === b.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    b.active && <Check />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                disabled={isSwitching}
                onSelect={() => setSettingsTab("buckets")}
              >
                <Settings2 />
                Manage buckets
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Usage this month</DropdownMenuLabel>
              <UsagePanel />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/") },
                });
              }}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
