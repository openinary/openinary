"use client"

import Image from "next/image";
import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  Image as ImageIcon,
  Package,
  Video,
} from "lucide-react"

import { NavMain } from "@/components/sidebar/nav-main"
import { NavProjects } from "@/components/sidebar/nav-projects"
import { NavUser } from "@/components/sidebar/nav-user"
import { VersionDisplay } from "@/components/sidebar/version-display"

type MediaFile = {
  id: string
  name: string
  path: string
  type: "image" | "video"
}
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import Link from "next/link"

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
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onMediaSelect?: (media: MediaFile) => void
}

export function AppSidebar({ onMediaSelect, ...props }: AppSidebarProps) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pl-4 pt-4">
        <Link href="/" className="flex items-center">
          <Image
            src={isCollapsed ? "/icon.svg" : "/openinary.svg"}
            alt="Openinary"
            width={100}
            height={25}
            className="dark:invert h-[25px] w-auto"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects onMediaSelect={onMediaSelect} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
        {!isCollapsed && <VersionDisplay />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
