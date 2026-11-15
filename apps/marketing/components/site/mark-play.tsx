"use client";

import { useEffect } from "react";

/**
 * Plays the mark's wave once per hover and lets it finish: pointing at a link
 * that holds a `.mark` adds `.mark-play`, and only the last piece's
 * animationend takes it off. Leaving early does not cut it short, and
 * hovering again while it runs does not restart it. One listener for every mark on the page.
 */
export function MarkPlay() {
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const link = (e.target as Element).closest?.("a");
      // Only a real entry: moving between the link's own children is not one.
      if (!link || link.contains(e.relatedTarget as Node | null)) return;
      link.querySelector(".mark")?.classList.add("mark-play");
    };
    const onEnd = (e: AnimationEvent) => {
      const piece = e.target as Element;
      if (e.animationName !== "mark-wave" || piece.nextElementSibling) return;
      piece.closest(".mark")?.classList.remove("mark-play");
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("animationend", onEnd);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("animationend", onEnd);
    };
  }, []);
  return null;
}
