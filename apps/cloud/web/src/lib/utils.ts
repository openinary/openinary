import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * For chrome that stays absent until something asynchronous decides whether it
 * belongs on screen at all. Rendering it early and correcting course makes the
 * sidebar visibly pop; holding the slot empty and fading in does not. Shared so
 * every such element resolves at the same speed.
 */
export const FADE_IN = "fade-in animate-in duration-200";
