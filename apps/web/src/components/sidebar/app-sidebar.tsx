"use client"

import Image from "next/image";
import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  Image as ImageIcon,
  MessageSquare,
  Package,
  Video,
} from "lucide-react"

import { NavMain } from "@/components/sidebar/nav-main"
import { NavProjects } from "@/components/sidebar/nav-projects"
import { NavUser } from "@/components/sidebar/nav-user"

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
        <NavProjects onMediaSelect={onMediaSelect} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Help & Feedback"
              onClick={() => {
                if (typeof window !== 'undefined' && (window as any).uj) {
                  (window as any).uj.showWidget({ section: 'feedback' });
                }
              }}
            >
              <MessageSquare />
              <span>Help & Feedback</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser />
        <div className="px-2 py-1 text-center text-[11px] text-muted-foreground opacity-75">
          Version v{process.env.NEXT_PUBLIC_IMAGE_TAG || '-dev'}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
