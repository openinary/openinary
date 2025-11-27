"use client"

import { useQueryState } from "nuqs"
import { ChevronsUpDown } from "lucide-react"
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
import { UserAvatar } from "./user-avatar"
import { UserDropdown } from "./user-dropdown"
import { SettingsDialog } from "./settings-dialog"

export function NavUser() {
  const { data, isPending } = useSession()
  const [tab, setTab] = useQueryState("settings")

  const user = data?.user
  const userName = user?.name || user?.email?.split("@")[0] || "User"
  const userEmail = user?.email || ""
  const userAvatar = user?.image || ""

  const handleAccountClick = () => {
    setTab("account")
  }

  const handleApiKeysClick = () => {
    setTab("api-keys")
  }

  // Show loading state or nothing if no user
  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              <div className="h-3 w-32 bg-muted rounded animate-pulse mt-1" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (!user) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserAvatar
                name={userName}
                email={userEmail}
                image={userAvatar}
                className="h-8 w-8 rounded-lg"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-xs">{userEmail}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <UserDropdown
            userName={userName}
            userEmail={userEmail}
            userAvatar={userAvatar}
            onAccountClick={handleAccountClick}
            onApiKeysClick={handleApiKeysClick}
          />
        </DropdownMenu>
      </SidebarMenuItem>

      <SettingsDialog
        userName={userName}
        userEmail={userEmail}
        userAvatar={userAvatar}
      />
    </SidebarMenu>
  )
}
