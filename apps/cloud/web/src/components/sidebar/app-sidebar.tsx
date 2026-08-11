"use client";

import type { MediaFile } from "@openinary/ui";
import { Package } from "lucide-react";

import { BucketSwitcher } from "@/components/sidebar/bucket-switcher";
import { NavGetStarted } from "@/components/sidebar/nav-get-started";
import { NavMain } from "@/components/sidebar/nav-main";
import { NavProjects } from "@/components/sidebar/nav-projects";
import { NavUser } from "@/components/sidebar/nav-user";
import { UpgradeCard } from "@/components/sidebar/upgrade-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// Image/Video used to sit here as permanently disabled dead ends. They are
// now the playgrounds under Get started.
const platformItems = [{ title: "Assets", url: "/", icon: Package }];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onMediaSelect?: (media: MediaFile) => void;
}

export function AppSidebar({ onMediaSelect, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <BucketSwitcher />
      </SidebarHeader>
      <SidebarContent
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
        }}
      >
        <NavGetStarted />
        <NavMain label="Platform" items={platformItems} />
        <NavProjects onMediaSelect={onMediaSelect} />
      </SidebarContent>
      <SidebarFooter>
        <UpgradeCard />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
