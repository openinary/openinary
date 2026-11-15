"use client";

import { AppSidebar as DashboardSidebar } from "@openinary/dashboard";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@openinary/dashboard/ui/sidebar";
import { LayoutGrid, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SETTINGS_PAGES } from "@/components/settings/settings-pages";
import { GettingStarted } from "@/components/sidebar/getting-started";
import { NavUser } from "@/components/sidebar/nav-user";
import { VersionLink } from "@/components/sidebar/version-display";

const GITHUB_URL = "https://github.com/openinary/openinary";

function settingsLink(value: string) {
  const page = SETTINGS_PAGES.find((p) => p.value === value);
  if (!page) throw new Error(`No settings page "${value}"`);
  return { title: page.label, icon: page.icon, url: `/settings/${page.value}` };
}

const mainItems = [
  { title: "Assets", icon: LayoutGrid, url: "/" },
  ...["logs", "storage", "api-keys"].map(settingsLink),
];

const settingsShortcuts = ["account", "appearance"].map(settingsLink);

export function AppSidebar() {
  const router = useRouter();

  return (
    <DashboardSidebar
      header={<NavUser />}
      mainItems={mainItems}
      settingsActions={settingsShortcuts.map((link) => ({
        label: link.title,
        group: "Settings",
        icon: link.icon,
        onSelect: () => router.push(link.url),
      }))}
      footer={
        <SidebarFooter className="gap-0 p-0 group-data-[collapsible=icon]:px-0">
          <GettingStarted />
          <div className="border-t px-3 py-2 group-data-[collapsible=icon]:px-2">
            <SidebarMenu>
              <SidebarMenuItem className="flex items-center gap-2">
                <SidebarMenuButton
                  asChild
                  tooltip="Settings"
                  className="min-w-0 flex-1 text-sidebar-foreground"
                >
                  <Link href="/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
                {/* Still worth a glance when reporting a bug, so it stays, quietly. */}
                <VersionLink href={`${GITHUB_URL}/releases`} />
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarFooter>
      }
      uploaderHref="/uploader-demo"
    />
  );
}
