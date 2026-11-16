"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { lenis } from "@/components/site/smooth-scroll";
import { focusRing } from "@/components/site/ui";
import { cn } from "@/lib/utils";

/**
 * The product film (37.5 s loop with its own score), in a light and a dark cut. Source: apps/marketing/film.
 * CSS shows the cut for the current theme from the first frame; which one to
 * *play* follows next-themes' resolvedTheme, not the DOM, since the theme
 * class can land after this effect runs. Both are preload="none", so only the
 * played cut downloads.
 *
 * Browsers only autoplay muted video, so it starts muted; turning the sound on
 * restarts it so the score reads from the top. With reduced motion it never
 * autoplays and the poster stays up. If Safari stalls on the plain public
 * files (it wants 206 Range answers), move them to the Cloud CDN.
 */
const CUTS = [
  { src: "/product/film.mp4", poster: "/product/film-poster.jpg", className: "dark:hidden" },
  { src: "/product/film-dark.mp4", poster: "/product/film-dark-poster.jpg", className: "hidden dark:block" },
] as const;

const cutFor = (theme: string) => (theme === "dark" ? 1 : 0);

/**
 * Turning the sound on straight from the top of the page brings the film to
 * the middle of the screen, or just under the header when it is taller.
 */
const HEADER = 72;
function bringIntoView(el: HTMLElement) {
  if (window.scrollY > 40) return;
  const r = el.getBoundingClientRect();
  const y = window.scrollY + r.top - Math.max(HEADER, (window.innerHeight - r.height) / 2);
  if (lenis) lenis.scrollTo(y);
  else window.scrollTo({ top: y });
}

/** Both cuts, so a theme switch keeps the sound where the visitor left it. */
const muteAll = (films: (HTMLVideoElement | null)[], muted: boolean) => {
  for (const f of films) if (f) f.muted = muted;
};

export function ProductFilm({ className }: { className?: string }) {
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true); // read by the effect, which must not re-run on a toggle
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const v = refs.current[cutFor(resolvedTheme)];
    if (!v) return;
    for (const other of refs.current) {
      if (!other || other === v) continue;
      if (!other.paused) v.currentTime = other.currentTime;
      other.pause();
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.muted = mutedRef.current; // the property, not the attribute, is what autoplay policies read
    v.play().catch(() => {}); // blocked (Low Power Mode): the poster stays
  }, [resolvedTheme]);

  function toggleSound() {
    if (!resolvedTheme) return;
    const v = refs.current[cutFor(resolvedTheme)];
    if (!v) return;
    if (v.muted) {
      v.currentTime = 0;
      if (v.parentElement) bringIntoView(v.parentElement);
    }
    const next = !v.muted;
    muteAll(refs.current, next);
    mutedRef.current = next;
    setMuted(next);
    v.play().catch(() => {});
  }

  return (
    <div className={cn("relative", className)}>
      {CUTS.map((cut, i) => (
        <video
          key={cut.src}
          ref={(el) => {
            refs.current[i] = el;
          }}
          src={cut.src}
          poster={cut.poster}
          width={1920}
          height={1080}
          muted
          loop
          playsInline
          preload="none"
          aria-label="Openinary in 37 seconds: upload once, change the URL, change the file."
          className={cn("aspect-video h-auto w-full", cut.className)}
        />
      ))}
      <button
        type="button"
        onClick={toggleSound}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        className={cn(
          "absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-black/50 text-white/70 backdrop-blur-md transition-colors hover:text-white",
          focusRing,
        )}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </div>
  );
}
