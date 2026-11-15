"use client";

import {
  AppSidebar as DashboardSidebar,
  SolarAssets,
  SolarBuckets,
  SolarKey,
  SolarLogs,
  SolarPalette,
  SolarUsage,
} from "@openinary/dashboard";

import { FILE_UPLOADER_DOCS } from "@/components/dashboard-providers";
import { Logo } from "@/components/logo";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import { BucketSwitcher } from "@/components/sidebar/bucket-switcher";
import { UpgradeCard } from "@/components/sidebar/upgrade-card";

const mainItems = [
  { title: "Assets", icon: SolarAssets, url: "/" },
  { title: "Usage", icon: SolarUsage, url: "/settings/billing" },
  { title: "Logs", icon: SolarLogs, url: "/settings/logs" },
  { title: "API keys", icon: SolarKey, url: "/settings/api-keys" },
];

// The settings pages the sidebar does not already list above.
const settingsPages = [
  { title: "Buckets", url: "/settings/buckets" },
  { title: "Storage", url: "/settings/storage" },
  { title: "Appearance", url: "/settings/appearance" },
];

export function AppSidebar() {
  const setSettingsTab = useSettingsPage();

  return (
    <DashboardSidebar
      brand={<Logo markOnly className="size-[18px]" />}
      mainItems={mainItems}
      settingsPages={settingsPages}
      settingsActions={[
        {
          label: "Manage buckets",
          group: "Settings",
          icon: SolarBuckets,
          onSelect: () => setSettingsTab("buckets"),
        },
        {
          label: "Appearance",
          group: "Settings",
          icon: SolarPalette,
          onSelect: () => setSettingsTab("appearance"),
        },
      ]}
      notices={<UpgradeCard />}
      account={<BucketSwitcher />}
      uploaderHref={FILE_UPLOADER_DOCS}
    />
  );
}
