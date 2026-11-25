"use client";

import {
  AppSidebar as DashboardSidebar,
  initials,
  SidebarAccount,
  SolarAccount,
  SolarAssets,
  SolarKey,
  SolarLogs,
  SolarPalette,
  SolarStorage,
  WorkspaceTile,
} from "@openinary/dashboard";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@openinary/dashboard/ui/dropdown-menu";
import { ArrowUpRight, Building2, LogOut, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { can } from "shared/permissions";

import { useOnboardingState } from "@/components/onboarding-gate";
import { useVersion } from "@/components/sidebar/version-display";
import { useCanManageApiKeys } from "@/components/dashboard-providers";
import { signOut, useRole, useSession } from "@/lib/auth-client";

const GITHUB_URL = "https://github.com/openinary/openinary";

const mainItems = [
  { title: "Assets", icon: SolarAssets, url: "/" },
  { title: "Logs", icon: SolarLogs, url: "/settings/logs" },
  { title: "Storage", icon: SolarStorage, url: "/settings/storage" },
  { title: "API keys", icon: SolarKey, url: "/settings/api-keys" },
];

// The settings pages the sidebar does not already list above.
const settingsPages = [
  { title: "Account", url: "/settings/account" },
  { title: "Appearance", url: "/settings/appearance" },
];

const SETTINGS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Account: SolarAccount,
  Appearance: SolarPalette,
  Workspace: Building2,
  Users,
};

/** The workspace (this instance) and the signed-in account, at the bottom. */
function Account() {
  const router = useRouter();
  const user = useSession().data?.user;
  const workspace = useOnboardingState().data?.workspace;
  const version = useVersion();
  const managesWorkspace = can(useRole(), "settings:manage");
  const name = workspace?.name ?? "Openinary";
  const userName = user?.name || user?.email?.split("@")[0] || "You";

  return (
    <SidebarAccount
      tile={<WorkspaceTile name={name} logo={workspace?.logo} />}
      name={name}
      detail={version ? `Self-hosted · ${version}` : "Self-hosted"}
      workspaceMenu={
        <>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={managesWorkspace ? "/settings/workspace" : "/settings/storage"}>
              <Settings />
              Workspace settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">
              <ArrowUpRight />
              What's new
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <ArrowUpRight />
              Star on GitHub
            </a>
          </DropdownMenuItem>
        </>
      }
      avatar={
        user?.image ? (
          <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
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
          <DropdownMenuItem asChild>
            <Link href="/settings/account">
              <SolarAccount />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/appearance">
              <SolarPalette />
              Appearance
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              router.push("/login");
            }}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </>
      }
    />
  );
}

export function AppSidebar() {
  const router = useRouter();
  // Viewers hold no API keys; only admins manage users. The pages themselves
  // 404 for the rest, this just keeps the links from leading there.
  const canManageKeys = useCanManageApiKeys();
  const role = useRole();
  const isAdmin = role === "admin";
  const items = canManageKeys
    ? mainItems
    : mainItems.filter((item) => item.url !== "/settings/api-keys");
  const pages = [
    ...settingsPages,
    ...(can(role, "settings:manage")
      ? [{ title: "Workspace", url: "/settings/workspace" }]
      : []),
    ...(isAdmin ? [{ title: "Users", url: "/settings/users" }] : []),
  ];

  return (
    <DashboardSidebar
      brand={<img src="/icon.svg" alt="" className="size-[18px] dark:invert" />}
      mainItems={items}
      settingsPages={pages}
      settingsActions={pages.map((page) => ({
        label: page.title,
        group: "Settings",
        icon: SETTINGS_ICONS[page.title],
        onSelect: () => router.push(page.url),
      }))}
      account={<Account />}
      uploaderHref="/uploader-demo"
    />
  );
}
