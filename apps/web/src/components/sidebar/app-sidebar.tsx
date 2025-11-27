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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import Link from "next/link"

// This is sample data.
const data = {
  teams: [
    {
      name: "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: Command,
      plan: "Free",
    },
  ],
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
    },
    {
      title: "Video",
      url: "/",
      icon: Video,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pl-4 pt-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/openinary.svg"
            alt="Openinary"
            width={100}
            height={100}
            className="dark:invert"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
