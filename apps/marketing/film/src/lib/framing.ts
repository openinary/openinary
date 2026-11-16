// 16:9 framing camera (f169/SPEC.md). The world keeps its 1920x1484 design space; Film169 (1920x1080) shows it
// through a per-frame framing: output = (design - (960, cy)) * s + (960, 540). Holds, joined by transitions that ride
// the film's own big motions (same frames and curves), so the reframing never reads as a separate camera move.
// s interpolates in log space, cy linearly, both on the same eased progress.
import type { Camera, Rect } from "./camera";
import { E, lerp, logZoom, prog, type EaseFn } from "./ease";
import { bar, CACHE, FRAME_LINE, H, HANDOFF, rt, T, W } from "../timeline";

export type Aspect = "film" | "16:9";
export type Framing = { s: number; cy: number };

/** Output size per aspect ("film" is the 1920x1484 master, untouched). */
export const OUTPUT: Record<Aspect, { w: number; h: number }> = { film: { w: W, h: H }, "16:9": { w: 1920, h: 1080 } };

// Holds (design px). Rule: slot words, the URL pill and its labels, badges, meters and the CTA sit inside the OUTPUT
// frame line with >= 24 px margin (the master's F0 rule), i.e. their design extent spans at most 888 / s px, centred on
// cy. Extents measured on the master render (analysis in the 16:9 report). The spec's table fitted the output frame
// edges instead (slot words under the ruler band), so most holds are wider here.
const F0: Framing = { s: 0.755, cy: 690 }; // shards y 104..1277
const DASH1: Framing = { s: 0.858, cy: 715 }; // "upload once" top 198 .. dialog bottom (f105; the push to DASH2 keeps it inside)
const DASH2: Framing = { s: 0.73, cy: 810 }; // pull back pinned on the word's top: hills tile bottom 1417 (f162)
const FULL: Framing = { s: 1, cy: 940 }; // inside the photo (y 0..1484 at f208); pill labels bottom 1378
const KEYS: Framing = { s: 0.75, cy: 787 }; // "change the url" top 196 .. pill labels bottom 1378
const WALL: Framing = { s: 0.88, cy: 731 }; // top chip row 227..257 lands at y 96..123 (images cropped by the top edge, as in the master) .. the circle's chip bottom 1240 (20 px)
const RAIL: Framing = { s: 0.789, cy: 757.5 }; // "98% smaller" top 195 .. size meter bottom 1320
const CACHE_F: Framing = { s: 0.72, cy: 815 }; // the cache beat: "fast after the first hit" top 196 .. timing chip bottom 1422
const STENCIL: Framing = { s: 1, cy: 802 }; // mark 388..1212
const CTA: Framing = { s: 1.1, cy: 545 }; // "Try openinary cloud" top 204 .. sub-line bottom 886: centred, ~150 px of air top and bottom

type Move = { range: readonly [number, number]; to: Framing; ease: EaseFn };
/** Transitions in film order; before the first and between two, the framing holds. */
export const MOVES: readonly Move[] = [
  { range: T.S2.rise, to: DASH1, ease: E.RISE }, // f50..f100 with the window rise
  { range: T.S2.drift, to: DASH2, ease: E.DRIFT }, // f105..f160 on the dashboard push (same curve): net zoom rises, no reversal
  { range: T.S4.push, to: FULL, ease: E.PUSH }, // f164..f208 with the dive
  { range: T.S6.snap, to: KEYS, ease: E.SNAP }, // f238..f256 the w_600 slam
  { range: CACHE.chipIn, to: CACHE_F, ease: E.SITE }, // f850..f860 the chip rises under the pill
  { range: T.S8.release, to: WALL, ease: E.RELEASE }, // f480..f524 the drop snap-out
  { range: [T.S9.collapse[0], rt(bar(6))], to: RAIL, ease: E.COLLAPSE }, // f575..f600 the whip
  { range: [HANDOFF.CD, rt(880)], to: STENCIL, ease: E.INOUT }, // f837..f880 the stencil flights
  { range: T.S13.toLockup, to: CTA, ease: E.CARD }, // f926..f956 mark into lockup
  { range: T.S14.recentre, to: F0, ease: E.INOUT }, // f1044..f1056 back to F0 with the recentre; the beat and the burst play at F0
];

export const framingAt = (f: number): Framing => {
  let cur = F0;
  for (const m of MOVES) {
    if (f <= m.range[0]) return cur;
    if (f < m.range[1]) {
      const p = prog(f, m.range, m.ease);
      return { s: logZoom(p, cur.s, m.to.s), cy: lerp(cur.cy, m.to.cy, p) };
    }
    cur = m.to;
  }
  return cur;
};

/** What the output frame shows, in design coords: `visible` = the whole output, `frameLine` = the output frame line. */
export type Viewport = { aspect: Aspect; s: number; cy: number; visible: Rect; frameLine: Rect };

const INSET = FRAME_LINE.x0; // 72 output px on every side

export const viewportAt = (f: number, aspect: Aspect = "film"): Viewport => {
  const o = OUTPUT[aspect];
  const { s, cy } = aspect === "film" ? { s: 1, cy: H / 2 } : framingAt(f);
  const inset = (d: number): Rect => ({ x: 960 - (o.w / 2 - d) / s, y: cy - (o.h / 2 - d) / s, w: (o.w - 2 * d) / s, h: (o.h - 2 * d) / s });
  return { aspect, s, cy, visible: inset(0), frameLine: inset(INSET) };
};

/** The framing as a camera (design -> output): identity for "film". */
export const framingCamera = (v: Viewport): Camera => {
  const o = OUTPUT[v.aspect];
  return { zoom: v.s, tx: o.w / 2 - 960 * v.s, ty: o.h / 2 - v.cy * v.s };
};
