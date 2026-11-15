"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * serveros.com's scroll, setting for setting: Lenis 1.3.27 with lerp 0.1,
 * its own rAF loop and smooth in-page anchors. Anchors land where the html
 * scroll-padding-top puts them, which Lenis and the browser both honour, so
 * links from another page land in the same place. Off for visitors who ask
 * for reduced motion.
 */
/** The live instance, for code that scrolls on purpose (null under reduced motion). */
export let lenis: Lenis | null = null;

export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const instance = new Lenis({ autoRaf: true, lerp: 0.1, anchors: true });
    lenis = instance;
    return () => {
      instance.destroy();
      lenis = null;
    };
  }, []);
  return null;
}
