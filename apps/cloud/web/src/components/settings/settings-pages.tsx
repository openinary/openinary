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
} from "lucide-react";

import { ActivityTab } from "@/components/settings/activity-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";
import { BucketsTab } from "@/components/settings/buckets-tab";
import { BillingTab } from "@/components/settings/billing-tab";

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
  return <SettingsPage tab={tab} pages={SETTINGS_PAGES} />;
}
