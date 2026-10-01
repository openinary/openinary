"use client"

import { Globe, LogOut, Star } from "lucide-react"
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
}

// Only what the sidebar doesn't already link to: Settings sits in its footer,
// API keys, Logs and Storage in its navigation.

export function UserDropdown({
  userName,
  userEmail,
  userAvatar,
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