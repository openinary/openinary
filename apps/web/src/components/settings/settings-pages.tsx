"use client";

import { AppearanceTab, StorageTab } from "@openinary/ui";
import {
  HardDrive,
  KeyRound,
  type LucideIcon,
  Palette,
  ScrollText,
  User,
} from "lucide-react";

import { ApiKeyManager } from "@/components/api-key-manager";
import { AccountTab } from "@/components/settings/account-tab";
import { ActivityTab } from "@/components/settings/activity-tab";
import { useSession } from "@/lib/auth-client";

function AccountPage() {
  const user = useSession().data?.user;
  // The form takes its defaults at mount, so it waits for the session.
  if (!user) return null;

  return (
    <AccountTab
      userName={user.name || user.email.split("@")[0]}
      userEmail={user.email}
      userAvatar={user.image || ""}
      isOpen
    />
  );
}

export const SETTINGS_PAGES: {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  content: React.ComponentType;
  /** Takes the whole width, for pages that are tables and charts. */
  wide?: boolean;
}[] = [
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
];
