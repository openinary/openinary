import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}

/**
 * Percent-encode a storage path for use inside a URL path, one segment at a
 * time so the "/" separators survive.
 *
 * Storage paths are user-supplied filenames, and interpolating one straight
 * into a URL silently truncates it: "#" starts a fragment and "?" starts a
 * query, so everything after it is stripped by the browser and never reaches
 * the server. A video uploaded as "The #1 clip.mp4" was requested as "The "
 * and 404'd, while the asset itself was perfectly fine.
 *
 * Every path that becomes part of a URL goes through this - the /t/ delivery
 * and thumbnail URLs just as much as the /storage and /download API calls.
 */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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
  if (!url || typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}
