"use client";

import { ArrowUpRight, Volume2, VolumeX } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { focusRing, pressable } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

/**
 * The product film: 18 s, 1920x1080, made to loop, with its own score. It is
 * the 16:9 reframe of a 1920x1484 master, so the section is shorter than the
 * old 2196x1698 product shot it replaces.
 *
 * It comes in a light and a dark cut. CSS picks the one on screen (the `dark`
 * class next-themes sets), so the right cut shows from the first frame with no
 * hydration guess. Which cut to *play* follows next-themes' resolvedTheme, not
 * the DOM: in production the class can land after this effect has run, and
 * reading visibility then played the hidden light cut on dark pages. Both are
 * preload="none" and only the matching one is played, so the other never
 * downloads. Switching theme mid-play hands over at the same moment, sound
 * state included.
 *
 * The film itself is not a link: a hover veil over it hid the film just as
 * people moved in to watch. The Cloud CTA is a quiet link instead, sharing a
 * small capsule with the sound toggle in the film's bottom corner.
 *
 * Browsers only autoplay muted video, so it starts muted. Turning the sound on
 * restarts the film: the score and the story both read from the top. With
 * reduced motion it never autoplays and the poster (the URL transform frame,
 * the one still that explains the product) stays up.
 *
 * Served as a plain public file. openinary.dev's static assets answer Range
 * requests with a full 200, and Safari wants a 206 for video: if the film
 * stalls there, move it to the Cloud CDN, which handles ranges.
 */
const FILMS = [
  {
    src: "/product/film.mp4",
    poster: "/product/film-poster.jpg",
    className: "dark:hidden",
  },
  {
    src: "/product/film-dark.mp4",
    poster: "/product/film-dark-poster.jpg",
    className: "hidden dark:block",
  },
] as const;

/** Index in FILMS of the cut for a resolved theme (CSS shows the same one). */
const cutFor = (theme: string) => (theme === "dark" ? 1 : 0);

/** Both cuts, so a theme switch keeps the sound where the visitor left it. */
const muteAll = (films: (HTMLVideoElement | null)[], muted: boolean) => {
  for (const f of films) if (f) f.muted = muted;
};

export function ProductPreview() {
  const films = useRef<(HTMLVideoElement | null)[]>([]);
  const [muted, setMuted] = useState(true);
  // Mirrors `muted` for the effect below, which must not re-run on a toggle.
  const mutedRef = useRef(true);
  const { resolvedTheme } = useTheme();

  // Once the theme is known, and on every change: play its cut, park the other.
  useEffect(() => {
    if (!resolvedTheme) return;
    const v = films.current[cutFor(resolvedTheme)];
    if (!v) return;
    for (const other of films.current) {
      if (!other || other === v) continue;
      if (!other.paused) v.currentTime = other.currentTime;
      other.pause();
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Set on the element, not only as a prop: autoplay policies read the
    // property, and React doesn't reliably reflect `muted` into the markup.
    v.muted = mutedRef.current;
    // Blocked (Low Power Mode, data saver): the poster simply stays.
    v.play().catch(() => {});
  }, [resolvedTheme]);

  function toggleSound() {
    if (!resolvedTheme) return;
    const v = films.current[cutFor(resolvedTheme)];
    if (!v) return;
    if (v.muted) v.currentTime = 0;
    const next = !v.muted;
    muteAll(films.current, next);
    mutedRef.current = next;
    setMuted(next);
    v.play().catch(() => {});
  }

  return (
    <section className="relative">
      {FILMS.map((film, i) => (
        <video
          key={film.src}
          ref={(el) => {
            films.current[i] = el;
          }}
          src={film.src}
          poster={film.poster}
          width={1920}
          height={1080}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          className={cn("h-auto w-full", film.className)}
        />
      ))}
      {/* One quiet glass capsule: the film does the selling, this only says
          where to go and whether it can be heard. On a phone the film is
          ~210 px tall and the CTA would sit on its URL pill, so only the sound
          toggle stays (the hero's CTA is right above). */}
      <div className="absolute right-2.5 bottom-2.5 flex h-7 items-center rounded-full border border-black/[0.08] bg-white/55 text-xs font-medium text-black/55 backdrop-blur-md sm:right-4 sm:bottom-4 dark:border-white/10 dark:bg-black/40 dark:text-white/55">
        <a
          href="https://app.openinary.dev"
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="cloud_cta_clicked"
          data-track-prop-location="product_preview"
          className={cn(
            "hidden h-full items-center gap-1 rounded-l-full pr-2 pl-3 transition-colors hover:text-black sm:flex dark:hover:text-white",
            focusRing,
          )}
        >
          Try Cloud for free
          <ArrowUpRight aria-hidden className="size-3" />
        </a>
        <span
          aria-hidden
          className="hidden h-3 w-px bg-black/10 sm:block dark:bg-white/15"
        />
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Play the film with sound" : "Mute the film"}
          aria-pressed={!muted}
          data-track-event="product_film_sound"
          data-track-prop-sound={muted ? "on" : "off"}
          className={cn(
            "grid h-full place-items-center rounded-full px-2 transition-colors hover:text-black sm:rounded-l-none sm:pr-2.5 sm:pl-2 dark:hover:text-white",
            focusRing,
            pressable,
          )}
        >
          {muted ? (
            <VolumeX aria-hidden className="size-3.5" />
          ) : (
            <Volume2 aria-hidden className="size-3.5" />
          )}
        </button>
      </div>
    </section>
  );
}
