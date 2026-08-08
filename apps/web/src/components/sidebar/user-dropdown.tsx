"use client"

import {
  Globe,
  HardDrive,
  KeyRound,
  LogOut,
  Settings,
  Star,
} from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signOut } from "@/lib/auth-client"
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/ui/sidebar"
import { UserAvatar } from "@openinary/ui"

interface UserDropdownProps {
  userName: string
  userEmail: string
  userAvatar: string
  onAccountClick: () => void
  onApiKeysClick: () => void
  onStorageClick: () => void
}

export function UserDropdown({
  userName,
  userEmail,
  userAvatar,
  onAccountClick,
  onApiKeysClick,
  onStorageClick,
}: UserDropdownProps) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await signOut()
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  return (
    <DropdownMenuContent
      className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
      side={isMobile ? "bottom" : "right"}
      align="end"
      sideOffset={4}
    >
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
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
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={onAccountClick}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onApiKeysClick}>
          <KeyRound />
          API Keys
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStorageClick}>
          <HardDrive />
          Storage
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="https://github.com/openinary/openinary" target="_blank" rel="noopener noreferrer">
            <Star />
            Star on GitHub
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="https://openinary.dev/" target="_blank" rel="noopener noreferrer">
            <Globe />
            Go to Website
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLogout} variant="destructive">
        <LogOut />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}