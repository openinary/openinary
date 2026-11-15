// Local media (public/media, built by scripts/make-assets.py) with natural sizes for the cover maths.
import { staticFile } from "remotion";

export type Media = { src: string; w: number; h: number };

const m = (file: string, w: number, h: number): Media => ({ src: staticFile(`media/${file}`), w, h });

export const MEDIA = {
  /** Full bleed, circle, stencil, anything bigger than ~1000 px on screen. */
  hills2400: m("hills-2400.jpg", 2400, 1800),
  /** F0 card, rail cards, wall tiles up to ~1000 px. */
  hills1000: m("hills-1000.jpg", 1000, 750),
  /** Small tiles (<= 600 px on screen). */
  hills600: m("hills-600.jpg", 600, 450),
  portrait: m("portrait.webp", 900, 1350),
  productShoot: m("product-shoot.webp", 900, 600),
  blossomPoster: m("blossom-poster.webp", 1280, 720),
  productAnimation: m("product-animation.webp", 1280, 720),
} as const;

/** 1280x720 source (25 fps, 14.08 s) motion-interpolated to 60 fps, first 6.45 s only (scripts/make-assets.py).
 *  Play with <OffthreadVideo src={BLOSSOM_MP4} trimBefore={...} />. */
export const BLOSSOM_MP4 = staticFile("media/blossom-60.mp4");

/** Pick the smallest hills file that stays sharp for a box of the given on-screen width (px). */
export const hillsFor = (screenW: number) => (screenW <= 600 ? MEDIA.hills600 : screenW <= 1000 ? MEDIA.hills1000 : MEDIA.hills2400);
