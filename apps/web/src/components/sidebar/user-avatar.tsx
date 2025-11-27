"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

interface UserAvatarProps {
  name: string
  email: string
  image?: string
  className?: string
}

export function UserAvatar({ name, email, image, className }: UserAvatarProps) {
  const getInitials = (name: string, email: string) => {
    if (name) {
      const parts = name.split(" ")
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      }
      return name.substring(0, 2).toUpperCase()
    }
    if (email) {
      return email.substring(0, 2).toUpperCase()
    }
    return "U"
  }

  const initials = getInitials(name, email)

  return (
    <Avatar className={className}>
      <AvatarImage src={image} alt={name} />
      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
    </Avatar>
  )
}

