// The "Openinary" wordmark as the marketing site's header sets it (components/site/header.tsx): the mark at 17 px,
// an 8 px gap, "Openinary" in Mona Sans 500 at 15 px, -0.02em. Lockup units = the mark's 104-unit box (17 px), so
// screen = origin + k * p (same Placement as the mark). Letter positions are HarfBuzz's (kerning on, wght 500) from
// public/fonts/MonaSans-latin.woff2, in em, before tracking.
const PX = 104 / 17; // lockup units per site px
export const WORDMARK = {
  text: "Openinary",
  size: 15 * PX,
  weight: 500,
  trackingEm: -0.02,
  x0: 104 + 8 * PX,
  // items-center with the mark: the line box (ascent 1.09, descent 0.32) centred on the mark's middle
  baseline: 52 + ((1.09 - 0.32) / 2) * 15 * PX,
} as const;
const EM = [0.0, 0.81, 1.448, 1.996, 2.606, 2.852, 3.469, 4.088, 4.476];
const ADVANCE_EM = 5.015;

export type Letter = { char: string; x: number };
export const LETTERS: readonly Letter[] = [...WORDMARK.text].map((char, i) => ({
  char,
  x: WORDMARK.x0 + (EM[i] + WORDMARK.trackingEm * i) * WORDMARK.size,
}));
/** Lockup width in units: the mark, the gap, the word (no trailing tracking). */
export const LOCKUP_VIEWBOX = { w: WORDMARK.x0 + (ADVANCE_EM + WORDMARK.trackingEm * 8) * WORDMARK.size, h: 104 } as const;
