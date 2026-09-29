"use client";

import Image from "next/image";
import { Image as ImageIcon, Package, Video } from "lucide-react";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavProjects } from "@/components/sidebar/nav-projects";
import { NavUser } from "@/components/sidebar/nav-user";
import { VersionDisplay } from "@/components/sidebar/version-display";
import type { MediaFile } from "@openinary/ui";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";

// This is sample data.
const data = {
  navMain: [
    {
      title: "Assets",
      url: "/",
      icon: Package,
      isActive: true,
    },
    {
      title: "Image",
      url: "/",
      icon: ImageIcon,
      disabled: true,
    },
    {
      title: "Video",
      url: "/",
      icon: Video,
      disabled: true,
    },
  ],
};

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onMediaSelect?: (media: MediaFile) => void;
}

export function AppSidebar({ onMediaSelect, ...props }: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex h-7 items-center justify-between gap-1 pl-2 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pt-1">
          <Link href="/" className="flex items-center">
            <Image
              src={isCollapsed ? "/icon.svg" : "/openinary.svg"}
              alt="Openinary"
              width={80}
              height={20}
              className="dark:invert h-5 w-auto"
            />
          </Link>
          <SidebarTrigger className="text-muted-foreground" />
        </div>
      </SidebarHeader>
      <SidebarContent
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
        }}
      >
        <NavMain items={data.navMain} />
        <NavProjects onMediaSelect={onMediaSelect} />
      </SidebarContent>
      <SidebarFooter className="border-t py-2">
        <div className="flex items-center gap-2">
          <NavUser />
          {!isCollapsed && <VersionDisplay />}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
