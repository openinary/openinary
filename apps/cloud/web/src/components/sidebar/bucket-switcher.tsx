"use client";

import {
  initials,
  SidebarAccount,
  SolarPalette,
} from "@openinary/dashboard";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@openinary/dashboard/ui/dropdown-menu";
import { Spinner } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, LogOut, Settings2, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { BucketAvatar } from "@/components/bucket-avatar";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
import { UsagePanel } from "@/components/sidebar/nav-plan";
import { useAccount } from "@/hooks/use-account";
import { useActiveBucket } from "@/hooks/use-active-bucket";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/**
 * The bottom of the sidebar: the active bucket (switch, manage, this month's
 * usage) and the signed-in account. Switching tears the dashboard's caches
 * down, which is why the switch itself lives in BucketSwitchProvider.
 */
export function BucketSwitcher() {
  const setSettingsTab = useSettingsPage();
  const { isSwitching, switchingToId, switchToBucket, switchToAccount } =
    useBucketSwitch();
  const account = useAccount();
  const currentAccount = account.accounts.find(
    (a) => a.accountId === account.current,
  );
  const router = useRouter();
  const user = authClient.useSession().data?.user;
  const userName = user?.name || user?.email?.split("@")[0] || "You";
  const { buckets, bucket: activeBucket } = useActiveBucket();
  const plan = useQuery(orpc.usage.get.queryOptions()).data?.planName;
  const count = buckets?.length ?? 0;

  return (
    <SidebarAccount
      tile={
        isSwitching ? (
          <span className="flex size-8 shrink-0 items-center justify-center">
            <Spinner className="size-4" />
          </span>
        ) : (
          <BucketAvatar
            id={activeBucket?.id ?? "Openinary"}
            size={32}
            className="shrink-0 rounded-[10px]"
          />
        )
      }
      name={isSwitching ? "Switching…" : (activeBucket?.name ?? "My bucket")}
      detail={
        // Inside someone else's account, say whose: that's the surprise to avoid.
        currentAccount && currentAccount.accountId !== user?.id
          ? `${currentAccount.name} · ${currentAccount.role}`
          : `${plan ?? "Free"} · ${count} ${count === 1 ? "bucket" : "buckets"}`
      }
      workspaceMenu={
        <>
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
            {account.can("bucket.manage") && (
              <DropdownMenuItem
                disabled={isSwitching}
                onSelect={() => setSettingsTab("buckets")}
              >
                <Settings2 />
                Manage buckets
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Usage this month</DropdownMenuLabel>
            <UsagePanel />
          </DropdownMenuGroup>
        </>
      }
      avatar={
        user?.image ? (
          <img src={user.image} alt="" className="size-full object-cover" />
        ) : (
          initials(userName)
        )
      }
      accountMenu={
        <>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate font-medium text-[13px] text-ds-text">
              {userName}
            </span>
            <span className="truncate">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {account.accounts.length > 1 && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Accounts</DropdownMenuLabel>
                {account.accounts.map((a) => (
                  <DropdownMenuItem
                    key={a.accountId}
                    disabled={isSwitching}
                    onSelect={() => {
                      if (a.accountId !== account.current)
                        switchToAccount(a.accountId);
                    }}
                  >
                    <span className="flex-1 truncate">
                      {a.accountId === user?.id ? "Personal" : a.name}
                    </span>
                    {a.accountId === account.current && <Check />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          {account.teamsEnabled && (
            <DropdownMenuItem onSelect={() => setSettingsTab("team")}>
              <Users />
              Team
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setSettingsTab("appearance")}>
            <SolarPalette />
            Appearance
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              authClient.signOut({
                fetchOptions: { onSuccess: () => router.push("/") },
              });
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </>
      }
    />
  );
}
