"use client";

import { AppSidebar as DashboardSidebar } from "@openinary/dashboard";
import { SidebarFooter } from "@openinary/dashboard/ui/sidebar";
import {
  Boxes,
  ChartColumn,
  KeyRound,
  LayoutGrid,
  Palette,
  ScrollText,
} from "lucide-react";

import { FILE_UPLOADER_DOCS } from "@/components/dashboard-providers";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import { BucketSwitcher } from "@/components/sidebar/bucket-switcher";
import { NavSettings } from "@/components/sidebar/nav-plan";
import { UpgradeCard } from "@/components/sidebar/upgrade-card";

const mainItems = [
  { title: "Assets", icon: LayoutGrid, url: "/" },
  { title: "Usage", icon: ChartColumn, url: "/settings/billing" },
  { title: "Logs", icon: ScrollText, url: "/settings/logs" },
  { title: "API keys", icon: KeyRound, url: "/settings/api-keys" },
];

export function AppSidebar() {
  const setSettingsTab = useSettingsPage();

  return (
    <DashboardSidebar
      header={<BucketSwitcher />}
      mainItems={mainItems}
      settingsActions={[
        {
          label: "Manage buckets",
          group: "Settings",
          icon: Boxes,
          onSelect: () => setSettingsTab("buckets"),
        },
        {
          label: "Appearance",
          group: "Settings",
          icon: Palette,
          onSelect: () => setSettingsTab("appearance"),
        },
      ]}
      footer={
        <SidebarFooter className="gap-0 p-0 group-data-[collapsible=icon]:px-0">
          <UpgradeCard />
          <div className="border-t px-3 py-2 group-data-[collapsible=icon]:px-2">
            <NavSettings />
          </div>
        </SidebarFooter>
      }
      uploaderHref={FILE_UPLOADER_DOCS}
    />
  );
}
