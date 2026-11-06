"use client"

import { ChevronDown } from "lucide-react"
import Image from "next/image"
import { Skeleton } from "skullet/react"
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
import { useHydrated } from "@/hooks/use-hydrated"
import { UserDropdown } from "./user-dropdown"

export function NavUser() {
  const { data, isPending } = useSession()
  const onboarding = useOnboardingState()
  const workspace = onboarding.data?.workspace
  // Client-only, so the skeleton can recall its last shape (useHydrated).
  const hydrated = useHydrated()

  const user = data?.user
  const userName = user?.name || user?.email?.split("@")[0] || "User"
  const userEmail = user?.email || ""
  const userAvatar = user?.image || ""

  if (!isPending && !user) {
    return null
  }

  // The same button from the first paint: the workspace's logo and name are
  // drawn as skeleton until the session and the workspace are known, at the
  // width they had last time.
  return (
    <SidebarMenu className="min-w-0 flex-1">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-fit max-w-full text-sidebar-foreground data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-1.5!">
              {hydrated && (
                <Skeleton
                  id="nav-user"
                  loading={isPending || onboarding.isPending}
                  label="Loading workspace"
                  className="min-w-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
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
                  </div>
                </Skeleton>
              )}
              {hydrated && <ChevronDown className="size-3.5!" />}
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
