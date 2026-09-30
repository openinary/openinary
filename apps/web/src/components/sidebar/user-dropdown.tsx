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
      // The sidebar's own width, flush under the trigger, so the menu reads as
      // the header opening rather than as a popup beside it.
      className="w-58"
      side="bottom"
      align="start"
      sideOffset={4}
    >
      <DropdownMenuLabel className="truncate">
        Signed in as {userEmail || userName}
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