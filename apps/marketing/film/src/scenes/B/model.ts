// Scene B model: every animated value of bars 2 to 5 as a pure function of the ABSOLUTE film frame.
// Geometry is in B-world px (at zoom 1, world = screen and 1 world px = 1 output px of the URL shown).
import { Easing } from "remotion";
import { cameraFromAnchor, compose, IDENTITY, type Camera, type Rect } from "../../lib/camera";
import { E, lerp, logZoom, prog, springAt, tween } from "../../lib/ease";
import { outputOf, S7_STATES, TYPING, type Output } from "../../lib/variants";
import { beat, T } from "../../timeline";

// ------------------------------------------------------------------------------------------------ frame
export type Geom = { cx: number; cy: number; w: number; h: number; rx: number; ry: number; pad: number };

/** f208 hand-off: the tile is exactly the full-bleed photo 1979x1484 centred on T.S4.pushS1 (FINAL S4). */
export const FULL: Geom = { cx: T.S4.pushS1.x, cy: T.S4.pushS1.y, w: 1979, h: 1484, rx: 0, ry: 0, pad: 0 };
/**
 * One continuous camera: after the push lands (f208) the full-bleed photo keeps growing 1 -> 1.02 about its centre
 * (PRESS: from rest, still accelerating into the slam at f238), so it is never a frozen plate under the typing.
 */
const GROW = 1.02;
const growAt = (f: number) => 1 + (GROW - 1) * prog(f, [T.S4.fullBleed, T.S6.snap[0]], E.PRESS);
const grown = (g: number): Geom => ({ ...FULL, w: FULL.w * g, h: FULL.h * g });

const geomOf = (o: Output, c = T.S6.frameCentre): Geom => ({
  cx: c.x,
  cy: c.y,
  w: o.w,
  h: o.h,
  rx: o.radius === "max" ? o.w / 2 : Math.min(o.radius, o.w / 2),
  ry: o.radius === "max" ? o.h / 2 : Math.min(o.radius, o.h / 2),
  pad: o.pad ? 1 : 0,
});
const mixGeom = (a: Geom, b: Geom, t: number): Geom => ({
  cx: lerp(a.cx, b.cx, t),
  cy: lerp(a.cy, b.cy, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  rx: lerp(a.rx, b.rx, t),
  ry: lerp(a.ry, b.ry, t),
  pad: lerp(a.pad, b.pad, t),
});

const G1 = geomOf(outputOf(TYPING[1])); // w_600: 600 x 450
const G2 = geomOf(outputOf(TYPING[2])); // w_600,h_600
const G3 = geomOf(outputOf(TYPING[3])); // w_600,h_600,r_max (= S7 state 0)

// S7 swaps. A swap frame is the first frame of change (hard swaps show the new state on their own frame).
const SW = T.S7.swaps;
const nextSwap = (i: number) => (i + 1 < SW.length ? SW[i + 1] : T.S7.freeze[0]);
/** Index of the last swap at or before f (-1 before the first). */
export const swapIndex = (f: number) => {
  let i = -1;
  while (i + 1 < SW.length && f >= SW[i + 1]) i++;
  return i;
};
/** S7 state number shown after swap i (-1 = S0). */
export const stateAfter = (i: number) => (i < 0 ? 0 : T.S7.order[i]);
/** Progress of a change that starts on swap i's frame and lasts d frames (d <= 1: hard). */
const swapProg = (f: number, i: number, d: number) => (d <= 1 ? 1 : E.SITE(Math.min(1, (f - SW[i] + 1) / d)));
/** Frame morph length: min(10, interval) (concept A S7). */
const morphLen = (i: number) => Math.min(10, nextSwap(i) - SW[i]);
/** Param reel roll length m: min(8, interval - 2); the stutter swaps (from the stutter-freeze on beat 4 of bar 4,
 * f450) are hard cuts (0). */
export const rollLen = (i: number) => (SW[i] >= beat(4, 4) ? 0 : Math.min(8, nextSwap(i) - SW[i] - 2));
/** Reel roll: PROGRESS over m + 1 steps, so the swap frame shows at most 15% of it and frame SW[i] + m lands. */
const rollProg = (f: number, i: number) => {
  const m = rollLen(i);
  return m <= 1 ? 1 : E.PROGRESS(Math.min(1, (f - SW[i] + 1) / (m + 1)));
};
/** S7 progress (f clamped to the freeze, so f478 and f479 are identical). */
export const s7 = (f: number) => {
  const ff = Math.min(f, T.S7.freeze[0]);
  const i = swapIndex(ff);
  return { ff, i, from: stateAfter(i - 1), to: stateAfter(i), morph: i < 0 ? 1 : swapProg(ff, i, morphLen(i)), roll: i < 0 ? 1 : rollProg(ff, i) };
};

/**
 * The keystroke slam (f238 to f256). The SNAP bezier only glides into place (no stop), so the slam is a stiff damped
 * spring on the same frames: peak speed on the kick (about 340 px/f at f240), contact f245, a 12 px recoil, still by f256.
 */
const SLAM = { stiffness: 1300, damping: 60, mass: 1 } as const;
export const slam = (f: number) => (f >= T.S6.snap[1] ? 1 : springAt(f, T.S6.snap[0], SLAM));

/** The photo frame in B-world. From f480 it is the B1 anchor tile (the circle), moved by rowShift on screen. */
export const frameAt = (f: number): Geom => {
  if (f < T.S6.snap[0]) return grown(growAt(f));
  if (f < T.S6.crop[0]) return mixGeom(grown(GROW), G1, slam(f));
  if (f < T.S6.round[0]) return mixGeom(G1, G2, prog(f, T.S6.crop, E.SITE));
  if (f < SW[0]) return mixGeom(G2, G3, prog(f, T.S6.round, E.SITE));
  const s = s7(f);
  return mixGeom(geomOf(S7_STATES[s.from]), geomOf(S7_STATES[s.to]), s.morph);
};

/**
 * Bar 5 clock: the DROP's first frame of motion is f480 itself (the music's hard cut and impact), so every S8
 * progress reads one frame ahead: f480 already shows the first (fastest) step of the pull-back.
 */
export const dropProg = (f: number, range: readonly [number, number], ease = E.LINEAR) => prog(f + 1, range, ease);

// ------------------------------------------------------------------------------------------------ camera
const ANCHOR = T.S6.frameCentre; // drift, creep and release all pin the photo frame centre

/** B-world camera (what the world layer is drawn with). */
export const worldCam = (f: number): Camera => {
  if (f < T.S6.drift[0]) return IDENTITY;
  if (f < T.S7.creep[0]) return cameraFromAnchor(ANCHOR, ANCHOR, tween(f, T.S6.drift, T.S6.driftZ));
  if (f < T.S8.drop) {
    // Creep continues from the drift's end zoom (1.035) to 1.12, so f359 -> f360 does not jump.
    const ff = Math.min(f, T.S7.creep[1]);
    return cameraFromAnchor(ANCHOR, ANCHOR, tween(ff, T.S7.creep, [T.S6.driftZ[1], T.S7.creepZ[1]], E.CREEP));
  }
  const p = dropProg(f, T.S8.release, E.RELEASE);
  const S0 = T.S8.releaseS0;
  const S1 = T.S8.releaseS1;
  return cameraFromAnchor(ANCHOR, { x: lerp(S0.x, S1.x, p), y: lerp(S0.y, S1.y, p) }, logZoom(p, T.S8.releaseZ[0], T.S8.releaseZ[1]));
};

// ------------------------------------------------------------------------------------------------ wall motion
/** Marquee: screen speed v(f) = 2 + 10 e^(-(f-480)/18) px/f, integrated from f480 (concept A S8). */
export const marquee = (f: number) => {
  const t = Math.max(0, f - T.S8.marquee[0]);
  return 2 * t + 180 * (1 - Math.exp(-t / 18));
};
const WHIP_PX = 1200;
/** Harder than E.WHIP: the content is already moving while the cell collapses (74 px/f at f584, 181 px/f at f590). */
const WHIP_EASE = Easing.bezier(0.55, 0, 0.85, 0.5);
const whipIn = (f: number) => WHIP_PX * prog(f, T.S9.whip, WHIP_EASE);
const WHIP_END_V = whipIn(T.S9.whip[1]) - whipIn(T.S9.whip[1] - 1); // last frame step, about 181 px/f
/** Whip: content translateX 0 -> -1200 px (returned positive); after f590 it keeps its last speed. */
export const whip = (f: number) => (f <= T.S9.whip[1] ? whipIn(f) : WHIP_PX + WHIP_END_V * (f - T.S9.whip[1]));
const HERO_WHIP = 0.6; // the hero word rides the whip at 60% (concept A 2.4, P3)
/** Hero word shift: 60% of the whip; after the whip it leaves the thin column at the whip's full speed (no lingering sliver). */
export const heroShift = (f: number) => (f <= T.S9.whip[1] ? HERO_WHIP * whip(f) : HERO_WHIP * WHIP_PX + WHIP_END_V * (f - T.S9.whip[1]));

/** Screen offset of a wall row (dir +1 = A1/B1, -1 = A2/B2) on top of the camera. */
export const rowShift = (f: number, dir: 1 | -1) => dir * marquee(f) - whip(f);

/** Camera of a row: world camera plus its marquee and the whip (a pure screen translation). */
export const rowCam = (f: number, dir: 1 | -1): Camera => {
  const c = worldCam(f);
  return { ...c, tx: c.tx + rowShift(f, dir) };
};

/**
 * Cell mask width about x 960 (COLLAPSE). It starts at the full frame width (1920, not the spec's 1848): starting at
 * 1848 would pop a 36 px strip of the wall to ground on f575; from 1920 the edges slide in from the frame edges.
 * `full` = the visible width before the collapse, `from` = the visible width on its first frame (the 16:9 framing
 * shows more than 1920 design px across).
 */
export const maskWidth = (f: number, full = 1920, from = full) => (f < T.S9.collapse[0] ? full : tween(f, T.S9.collapse, [from, 120], E.COLLAPSE));
export const columnOpacity = (f: number) => 1 - prog(f, T.S9.columnOut);

// ------------------------------------------------------------------------------------------------ screen rects
export const toScreen = (c: Camera, g: Geom): Rect => ({
  x: c.zoom * (g.cx - g.w / 2) + c.tx,
  y: c.zoom * (g.cy - g.h / 2) + c.ty,
  w: c.zoom * g.w,
  h: c.zoom * g.h,
});
/** Camera the photo frame is drawn with (the B1 row camera from the drop on). */
export const frameCam = (f: number) => (f < T.S8.drop ? worldCam(f) : rowCam(f, 1));
/** Screen rect of the photo frame. */
export const frameScreen = (f: number) => toScreen(frameCam(f), frameAt(f));

// ------------------------------------------------------------------------------------------------ ruler camera
/** A's camera at the hand-off (f208): the rulers must not jump there. Then it carries the photo's 2% grow. */
const A_FINAL = cameraFromAnchor(T.S4.pushA, T.S4.pushS1, T.S4.pushZ[1]);
const grownCam = (g: number) => compose(cameraFromAnchor(T.S4.pushS1, T.S4.pushS1, g), A_FINAL);
const A_GROWN = grownCam(GROW);
const A_FIX = { x: A_GROWN.tx / (1 - A_GROWN.zoom), y: A_GROWN.ty / (1 - A_GROWN.zoom) };
/** Scene C's railCamera takes the rulers over at T.S9.whipPeak assuming a 1000 px ruler pan (railLayout WHIP_DIST):
 * report the 1200 px whip scaled to that, so the hand-off has no position jump. */
const RULER_WHIP = 1000 / WHIP_PX;
/**
 * Camera reported to the rulers. From f208 it continues A's push camera, then renormalises to B's own 1:1 world
 * during the keystroke slam (f238 to f256): the rulers snap with the frame. The whip is reported as a pan.
 */
export const rulerCam = (f: number): Camera => {
  if (f < T.S6.snap[0]) return grownCam(growAt(f));
  if (f < T.S6.snap[1]) {
    // A_GROWN is a pure zoom about its fixed point F; zoom back to 1 about F (monotonic, no drift of the numbers)
    const z = logZoom(slam(f), A_GROWN.zoom, 1);
    return { zoom: z, tx: A_FIX.x * (1 - z), ty: A_FIX.y * (1 - z) };
  }
  const c = worldCam(f);
  return f < T.S9.whip[0] ? c : { ...c, tx: c.tx - RULER_WHIP * whip(f) };
};
