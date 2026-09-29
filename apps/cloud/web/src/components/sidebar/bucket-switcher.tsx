"use client";

import { Spinner } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { BucketAvatar } from "@/components/bucket-avatar";
import { useSettingsDialog } from "@/components/settings-dialog";
import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
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
import { orpc } from "@/utils/orpc";

/**
 * Sits where the logo used to be, and only switches - creating, renaming and
 * deleting live in the Buckets settings tab. Buckets are an app-level concept
 * only (there is still a single real R2 bucket underneath, see
 * apps/server/worker/r2-storage.ts) and the active one is a per-account
 * setting the server resolves for every storage/upload/transform request, not
 * something threaded through @openinary/ui - so the switch itself, and the
 * cache teardown it implies, lives in BucketSwitchProvider.
 */
export function BucketSwitcher() {
  const [, setSettingsTab] = useSettingsDialog();
  const { isSwitching, switchingToId, switchToBucket } = useBucketSwitch();

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
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
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
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
