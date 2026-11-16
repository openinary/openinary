// Easing library (concept A 3.0) + the extra curves FINAL.md names inline, springs, and clamped tweens.
// Everything is a pure function of the frame you pass in.
import { Easing, interpolate, interpolateColors, spring, type SpringConfig } from "remotion";

export type EaseFn = (t: number) => number;

export const E = {
  RISE: Easing.bezier(0.38, 0.43, 0.0, 0.94), // window rise, peak ~25%
  DRAG: Easing.bezier(0.6, 0.0, 0.2, 1.0), // card drag, peak ~43%
  PUSH: Easing.bezier(0.75, 0.0, 0.12, 1.0), // push-in to full bleed, peak ~48%
  DRIFT: Easing.bezier(0.4, 0.2, 0.1, 1), // dashboard push (T.S2.drift): leaves the drop at 2.7 px/f, lands at zero speed
  SNAP: Easing.bezier(0.3, 0.9, 0.2, 1.0), // keystroke slam
  SITE: Easing.bezier(0.22, 1.0, 0.36, 1.0), // openinary.dev micro-ease: FLIPs, crops, radius, pills, badges
  CREEP: Easing.bezier(0.55, 0.0, 0.95, 0.6), // bar-4 tension push
  RELEASE: Easing.bezier(0.05, 0.75, 0.1, 1.0), // drop pull-back, max velocity on frame 1
  WHIP: Easing.bezier(0.7, 0.0, 0.9, 0.5), // collapse-whip content, peak at the end
  COLLAPSE: Easing.bezier(0.7, 0.0, 0.3, 1.0), // cell width collapse
  LAND: Easing.bezier(0.24, 0.9, 0.21, 0.83), // post-whip entry
  RAIL: Easing.bezier(0.8, 0.05, 0.25, 0.9), // one-card pans
  FLY: Easing.bezier(0.3, 0.7, 0.1, 1.0), // cards flying into shards
  MORPH: Easing.bezier(0.65, 0.0, 0.1, 1.0), // big card into the top shard
  CARD: Easing.bezier(0.65, 0.4, 0.1, 0.96), // mark shrink into lockup
  INOUT: Easing.bezier(0.65, 0.0, 0.35, 1.0), // recentres, size bar, counters
  BURST: Easing.bezier(0.48, 0.1, 0.08, 0.92), // the burst
  EXITIN: Easing.bezier(0.7, 0.0, 0.84, 0.0), // shards flung off frame, wordmark retract
  FLOOD: Easing.bezier(0.5, 0.0, 0.2, 1.0), // red flood radius
  // Named inline in FINAL.md / concept A:
  CURSOR: Easing.bezier(0.25, 0.1, 0.1, 1.0), // cursor travel paths
  PROGRESS: Easing.bezier(0.4, 0.0, 0.2, 1.0), // upload progress bar
  PRESS: Easing.bezier(0.4, 0.0, 1.0, 1.0), // press-in (P-4..P), dialog close
  LETTER: Easing.bezier(0.0, 0.5, 0.1, 1.0), // wordmark letters slide in
  REVEAL: Easing.bezier(0.3, 0.7, 0.1, 1.0), // wall cell radial reveal
  LINEAR: (t: number) => t,
} as const satisfies Record<string, EaseFn>;

export const SPRING = {
  FLIP: { stiffness: 500, damping: 40, mass: 1 }, // the site's tooltip spring
  PILL: { stiffness: 300, damping: 30, mass: 1 }, // URL pill width follow
  BADGE: { stiffness: 500, damping: 30, mass: 1 }, // badge pop
} as const satisfies Record<string, Partial<SpringConfig>>;

const FPS = 60;

/** Eased progress 0..1 of `frame` through [f0, f1], clamped both sides. */
export const prog = (frame: number, [f0, f1]: readonly [number, number], ease: EaseFn = E.LINEAR) =>
  f1 <= f0 ? (frame >= f1 ? 1 : 0) : ease(Math.min(1, Math.max(0, (frame - f0) / (f1 - f0))));

/** Clamped tween: value at `frame` going v0 -> v1 over [f0, f1] with `ease`. */
export const tween = (
  frame: number,
  frames: readonly [number, number],
  [v0, v1]: readonly [number, number],
  ease: EaseFn = E.LINEAR,
) => v0 + (v1 - v0) * prog(frame, frames, ease);

/** Multi-key clamped interpolation (same easing on every segment). */
export const keys = (frame: number, frames: readonly number[], values: readonly number[], ease: EaseFn = E.LINEAR) =>
  interpolate(frame, frames as number[], values as number[], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** Clamped colour tween (Remotion interpolateColors under the hood; any CSS colour strings). */
export const tweenColor = (
  frame: number,
  frames: readonly [number, number],
  [c0, c1]: readonly [string, string],
  ease: EaseFn = E.LINEAR,
) => interpolateColors(prog(frame, frames, ease), [0, 1], [c0, c1]);

/** Spring value started at `start` (0 before it). Pure in `frame`. from/to default 0 -> 1. */
export const springAt = (
  frame: number,
  start: number,
  config: Partial<SpringConfig>,
  { from = 0, to = 1, durationInFrames }: { from?: number; to?: number; durationInFrames?: number } = {},
) =>
  frame < start ? from : spring({ frame: frame - start, fps: FPS, config, from, to, durationInFrames });

/** Log-space zoom: z0 * (z1/z0)^p, so a zoom reads as constant-speed to the eye. */
export const logZoom = (p: number, z0: number, z1: number) => z0 * Math.pow(z1 / z0, p);

/** Quadratic bezier point (cursor paths): P0 -> P2 with control P1, t in 0..1. */
export const quad = (t: number, p0: Pt, c: Pt, p2: Pt): Pt => {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y };
};

export type Pt = { x: number; y: number };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
