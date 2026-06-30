import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
}
