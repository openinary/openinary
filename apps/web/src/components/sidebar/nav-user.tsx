"use client"

import { ChevronDown } from "lucide-react"
import Image from "next/image"
import { useSession } from "@/lib/auth-client"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useOnboardingState } from "@/components/onboarding-gate"
import { UserDropdown } from "./user-dropdown"

export function NavUser() {
  const { data, isPending } = useSession()
  const workspace = useOnboardingState().data?.workspace

  const user = data?.user
  const userName = user?.name || user?.email?.split("@")[0] || "User"
  const userEmail = user?.email || ""
  const userAvatar = user?.image || ""

  // Show loading state or nothing if no user
  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton disabled className="group-data-[collapsible=icon]:p-1.5!">
            <div className="size-5 shrink-0 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (!user) {
    return null
  }

  return (
    <SidebarMenu className="min-w-0 flex-1">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-fit max-w-full text-sidebar-foreground data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-1.5!">
              {workspace?.logo ? (
                <img
                  src={workspace.logo}
                  alt=""
                  className="size-5 shrink-0 rounded-md object-cover"
                />
              ) : (
                <Image
                  src="/icon.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 shrink-0 dark:invert"
                />
              )}
              <span className="truncate font-medium">
                {workspace?.name ?? "Openinary"}
              </span>
              <ChevronDown className="size-3.5!" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <UserDropdown
            userName={userName}
            userEmail={userEmail}
            userAvatar={userAvatar}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
