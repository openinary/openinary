"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

/**
 * Sizing the strip. Every SVG's frame is cut to its drawing, so a mark's box
 * is the mark itself and one number sets its size. Height for the upright
 * ones, but the wide ones get less of it: a cloud that is twice as wide as it
 * is tall drawn to the full height outweighs everything around it, so it is
 * given the same area instead, and its height comes out of that.
 *
 * Every file is the same grey at the same alpha, S3 and Wasabi having been
 * redrawn to match the seven that already were, so the strip's grayscale has
 * nothing left to even out.
 */
const MARK_HEIGHT = 22;
const MARK_AREA = MARK_HEIGHT * MARK_HEIGHT;

// Best known first: the three hyperscalers, then Cloudflare, then the
// S3-compatible independents roughly by how often a developer has heard of
// them.
const providers: { src: string; name: string; ratio: number }[] = [
  { src: "/storage/amazon-s3.svg", name: "Amazon S3", ratio: 424 / 512 },
  { src: "/storage/google-cloud.svg", name: "Google Cloud Storage", ratio: 1 },
  { src: "/storage/azure-blob.svg", name: "Azure Blob Storage", ratio: 1 },
  { src: "/storage/cloudflare-r2.svg", name: "Cloudflare R2", ratio: 1059 / 479 },
  { src: "/storage/backblaze.svg", name: "Backblaze B2", ratio: 1 },
  { src: "/storage/wasabi.svg", name: "Wasabi", ratio: 1 },
  { src: "/storage/scaleway.svg", name: "Scaleway Object Storage", ratio: 1 },
  { src: "/storage/ovhcloud.svg", name: "OVHcloud Object Storage", ratio: 29 / 18 },
  { src: "/storage/railway.svg", name: "Railway", ratio: 1 },
];

/** Upright marks take the full height; wide ones take the same area. */
function markSize(ratio: number) {
  const height =
    ratio > 1 ? Math.round(Math.sqrt(MARK_AREA / ratio)) : MARK_HEIGHT;
  return { height, width: Math.round(height * ratio) };
}

/**
 * The provider marks with a name that follows the pointer along the row.
 *
 * One bubble, not one per mark: a tooltip mounted per trigger pops out and
 * back in at every move, where a single bubble that slides to the mark under
 * the pointer and swaps its text lets the name feel carried from one to the
 * next. Its position is the hovered item's centre, measured against the list.
 *
 * Desktop only. On touch there is no hover to follow, and the names are in
 * the alt text already, so nothing is lost by not drawing it.
 */
export function StorageStrip() {
  const list = React.useRef<HTMLUListElement>(null);
  // Which way the name should enter is part of the state, decided when the
  // pointer moves: from the side it came from, so the text appears to be
  // pushed along the row rather than swapped in place.
  const [active, setActive] = React.useState<{
    index: number;
    x: number;
    direction: 1 | -1;
  } | null>(null);

  const show = (index: number, item: HTMLElement) => {
    if (!list.current) return;
    const bounds = list.current.getBoundingClientRect();
    const own = item.getBoundingClientRect();
    setActive((previous) => ({
      index,
      x: own.left + own.width / 2 - bounds.left,
      direction: previous && index < previous.index ? -1 : 1,
    }));
  };

  return (
    <div className="relative">
      {/* The filter stays on the list, but the opacity has to sit on each
          item: a parent's opacity caps its children's, so hover could never
          lift past the list's own value. */}
      <ul
        ref={list}
        onMouseLeave={() => setActive(null)}
        className="flex flex-wrap items-center gap-x-7 gap-y-5 grayscale dark:invert"
      >
        {providers.map((provider, index) => {
          const size = markSize(provider.ratio);
          return (
            <li
              key={provider.name}
              onMouseEnter={(event) => show(index, event.currentTarget)}
              className="flex h-6 items-center opacity-70 transition-opacity duration-200 hover:opacity-100 dark:opacity-75"
            >
              <Image
                src={provider.src}
                alt={provider.name}
                width={size.width}
                height={size.height}
                style={{ height: size.height, width: "auto" }}
              />
            </li>
          );
        })}
      </ul>

      {/* Below the row, centred on the hovered mark. Hidden on coarse pointers
          via the media query on the wrapper rather than by not rendering, so
          the hover handlers above stay inert there instead of absent. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-full hidden pt-2.5 [@media(hover:hover)]:block"
      >
        <AnimatePresence>
          {active && (
            <motion.div
              // The bubble: fades in on the first mark, then glides between
              // marks. Only its left edge is animated; centring is done by
              // the inner layer with a plain CSS translate, kept out of the
              // animated transform so the two cannot fight over one channel.
              key="bubble"
              initial={{ opacity: 0, x: active.x, y: 4 }}
              animate={{ opacity: 1, x: active.x, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{
                x: { type: "spring", stiffness: 500, damping: 40 },
                opacity: { duration: 0.15 },
                y: { duration: 0.15 },
              }}
            >
              <div
                className="overflow-hidden whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-sm"
                style={{ transform: "translateX(-50%)" }}
              >
                {/* Layout element in the flow, so the bubble takes the width of
                    the current name; the swap animates the text inside it. */}
                <AnimatePresence initial={false} mode="popLayout" custom={active.direction}>
                  <motion.span
                    key={active.index}
                    custom={active.direction}
                    variants={{
                      enter: (dir: number) => ({
                        x: 12 * dir,
                        opacity: 0,
                        filter: "blur(4px)",
                      }),
                      center: { x: 0, opacity: 1, filter: "blur(0px)" },
                      exit: (dir: number) => ({
                        x: -12 * dir,
                        opacity: 0,
                        filter: "blur(4px)",
                      }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="block"
                  >
                    {providers[active.index].name}
                  </motion.span>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
