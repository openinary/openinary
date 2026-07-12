import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
}

/**
 * Resolve a possibly-relative media/transform URL to an absolute URL.
 *
 * In same-origin deployments (Docker/nginx) the transform base URL is empty,
 * so URLs like "/t/blank.png" are origin-relative, fine for the browser to
 * load, but useless when copied or shared. `new URL` leaves already-absolute
 * URLs untouched and resolves relative ones against the current origin.
 */
export function toAbsoluteUrl(url: string): string {
  if (!url || typeof window === "undefined") return url
  try {
    return new URL(url, window.location.origin).href
  } catch {
    return url
  }
}
