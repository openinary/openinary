"use client";

import { SettingsPage, type SettingsPageEntry } from "@openinary/dashboard";
import { AppearanceTab, StorageTab } from "@openinary/ui";
import {
  Building2,
  HardDrive,
  KeyRound,
  Palette,
  ScrollText,
  User,
  Users,
} from "lucide-react";
import { type Action, can } from "shared/permissions";

import { ApiKeyManager } from "@/components/api-key-manager";
import { AccountTab } from "@/components/settings/account-tab";
import { ActivityTab } from "@/components/settings/activity-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { WorkspaceTab } from "@/components/settings/workspace-tab";
import { useRole, useSession } from "@/lib/auth-client";
import { Skeleton } from "skullet/react";

function AccountPage() {
  const user = useSession().data?.user;

  // The form takes its defaults at mount, so until the session is known it is
  // drawn as skeleton over sample values, then remounted (key) with the real
  // ones: same fields, same height, nothing pops in.
  return (
    <Skeleton loading={!user} label="Loading your account">
      <AccountTab
        key={user ? "user" : "sample"}
        userName={user ? user.name || user.email.split("@")[0] : "Your name"}
        userEmail={user?.email ?? "you@example.com"}
        userAvatar={user?.image || ""}
        isOpen
      />
    </Skeleton>
  );
}

type WebSettingsPage = SettingsPageEntry & {
  /** What a role needs to see the page. Omitted: everyone. */
  requires?: Action;
};

export const SETTINGS_PAGES: WebSettingsPage[] = [
  {
    value: "account",
    label: "Account",
    description: "Your name, email and avatar.",
    icon: User,
    content: AccountPage,
  },
  {
    value: "appearance",
    label: "Appearance",
    description: "Theme and display preferences for this dashboard.",
    icon: Palette,
    content: AppearanceTab,
  },
  {
    value: "api-keys",
    label: "API keys",
    description: "The keys your apps use to authenticate with Openinary.",
    icon: KeyRound,
    content: ApiKeyManager,
    requires: "apiKeys:manage",
  },
  {
    value: "storage",
    label: "Storage",
    description: "Storage used by your files and by cached transformations.",
    icon: HardDrive,
    content: StorageTab,
  },
  {
    value: "logs",
    label: "Logs",
    description: "The deliveries and video jobs behind your traffic.",
    icon: ScrollText,
    content: ActivityTab,
    wide: true,
  },
  {
    value: "workspace",
    label: "Workspace",
    description: "The name and logo everyone on this instance sees.",
    icon: Building2,
    content: WorkspaceTab,
    requires: "settings:manage",
  },
  {
    value: "users",
    label: "Users",
    description: "Who can sign in to this instance, and what they can do.",
    icon: Users,
    content: UsersTab,
    requires: "users:manage",
  },
];

/** The settings pages `role` may open. Unfiltered while the role loads. */
export function useSettingsPages() {
  const role = useRole();
  return SETTINGS_PAGES.filter(
    (page) => role === undefined || !page.requires || can(role, page.requires),
  );
}

export function Settings({ tab }: { tab: string }) {
  // Hidden rather than refused: the API and Better Auth enforce both. Unfiltered
  // until the role is known, so a direct link never 404s on load; once it is,
  // a page this role can't open is a 404.
  return <SettingsPage tab={tab} pages={useSettingsPages()} />;
}
