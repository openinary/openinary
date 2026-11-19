"use client";

import { SettingsPage, type SettingsPageEntry } from "@openinary/dashboard";
import { AppearanceTab, StorageTab } from "@openinary/ui";
import {
  Boxes,
  CreditCard,
  HardDrive,
  KeyRound,
  Palette,
  ScrollText,
  Users,
} from "lucide-react";

import { ActivityTab } from "@/components/settings/activity-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";
import { BucketsTab } from "@/components/settings/buckets-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { TeamTab } from "@/components/settings/team-tab";
import { useAccount } from "@/hooks/use-account";

export const SETTINGS_PAGES = [
  {
    value: "appearance",
    label: "Appearance",
    description: "Theme and display preferences for this dashboard.",
    icon: Palette,
    content: AppearanceTab,
  },
  {
    value: "buckets",
    label: "Buckets",
    description: "The buckets your files live in, and which one is active.",
    icon: Boxes,
    content: BucketsTab,
  },
  {
    value: "storage",
    label: "Storage",
    description: "Storage used by your files and by cached transformations.",
    icon: HardDrive,
    content: StorageTab,
  },
  {
    value: "api-keys",
    label: "API keys",
    description: "The keys your apps use to authenticate with Openinary.",
    icon: KeyRound,
    content: ApiKeysTab,
  },
  {
    value: "team",
    label: "Team",
    description: "The people who can use this account, and what they can do.",
    icon: Users,
    content: TeamTab,
  },
  {
    value: "billing",
    label: "Usage & billing",
    description: "What you've used this period, what it costs and your plan.",
    icon: CreditCard,
    content: BillingTab,
  },
  {
    value: "logs",
    label: "Logs",
    description: "The deliveries and video jobs behind your usage.",
    icon: ScrollText,
    content: ActivityTab,
    wide: true,
  },
] as const satisfies readonly SettingsPageEntry[];

export function Settings({ tab }: { tab: string }) {
  const account = useAccount();
  // Hidden rather than refused: the server enforces both either way.
  // Unfiltered until the role is known, so a direct link never 404s on load.
  const pages = SETTINGS_PAGES.filter(
    (page) =>
      !account.loaded ||
      ((page.value !== "team" || account.teamsEnabled) &&
        (page.value !== "api-keys" || account.can("apiKey.manage"))),
  );
  return <SettingsPage tab={tab} pages={pages} />;
}
