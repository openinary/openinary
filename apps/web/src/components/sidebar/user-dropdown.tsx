"use client"

import {
  BadgeCheck,
  BookOpen,
  Github,
  Key,
  LogOut,
  Moon,
  Sun,
} from "lucide-react"
import { useTheme } from "next-themes"
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
import { UserAvatar } from "./user-avatar"

interface UserDropdownProps {
  userName: string
  userEmail: string
  userAvatar: string
  onAccountClick: () => void
  onApiKeysClick: () => void
}

export function UserDropdown({
  userName,
  userEmail,
  userAvatar,
  onAccountClick,
  onApiKeysClick,
}: UserDropdownProps) {
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await signOut()
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const cycleTheme = () => {
    if (theme === "dark") {
      setTheme("light")
    } else if (theme === "light") {
      setTheme("system")
    } else {
      setTheme("dark")
    }
  }

  const getThemeLabel = () => {
    if (theme === "dark") return "Dark"
    if (theme === "light") return "Light"
    return "System"
  }

  const getThemeIcon = () => {
    if (theme === "dark") return <Moon />
    if (theme === "light") return <Sun />
    return <Sun />
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
          <BadgeCheck />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onApiKeysClick}>
          <Key />
          API Keys
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="https://docs.openinary.dev/" target="_blank" rel="noopener noreferrer">
            <BookOpen />
            Documentation
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="https://github.com/openinary/openinary" target="_blank" rel="noopener noreferrer">
            <Github />
            Star on GitHub
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={cycleTheme}>
        {getThemeIcon()}
        {getThemeLabel()}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLogout}>
        <LogOut />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

