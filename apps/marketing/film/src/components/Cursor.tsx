// P4: the macOS cursor (@remotion/mac-cursors artwork, inlined as vector so it stays crisp at any scale),
// 52 px tall arrow, scaled about its tip, soft shadow. Never scaled by a camera.
// press(): the press grammar (concept A 3.0): P = max depth, release default P + 7.
import { resolveCursor } from "@remotion/mac-cursors";
import { useMemo } from "react";
import { E } from "../lib/ease";

export type CursorVariant = "arrow" | "pointer" | "grab" | "grabbing";
const NAME: Record<CursorVariant, string> = { arrow: "default", pointer: "pointer", grab: "grab", grabbing: "grabbing" };

// Tip of the arrow artwork in its 32x32 box (white outline apex); other variants use the package hotspot.
const ARROW_TIP = { x: 10.011, y: 7.407 };
const ARROW_HEIGHT_UNITS = 18.066; // outline height in box units (y 0.407..18.473 inside translate(10 7))
export const CURSOR_HEIGHT = 52;
const PX_PER_UNIT = CURSOR_HEIGHT / ARROW_HEIGHT_UNITS;

const svgOf = (v: CursorVariant) => {
  const r = resolveCursor(NAME[v]);
  if (!r) throw new Error(`cursor ${v} missing`);
  const b64 = r.src.split(",")[1];
  const markup = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString();
  return { inner: markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""), tip: v === "arrow" ? ARROW_TIP : r.hotspot };
};

export type CursorProps = {
  /** Screen position of the tip (hotspot). */
  x: number;
  y: number;
  /** Press scale (1 = rest, 0.86 = pressed), about the tip. */
  scale?: number;
  opacity?: number;
  variant?: CursorVariant;
};

export const Cursor = ({ x, y, scale = 1, opacity = 1, variant = "arrow" }: CursorProps) => {
  const { inner, tip } = useMemo(() => svgOf(variant), [variant]);
  if (opacity <= 0) return null;
  const size = 32 * PX_PER_UNIT;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity,
        transformOrigin: "0 0",
        transform: `translate(${x}px, ${y}px) scale(${scale}) translate(${-tip.x * PX_PER_UNIT}px, ${-tip.y * PX_PER_UNIT}px)`,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.22)) drop-shadow(0 0 0.5px rgba(0,0,0,0.25))",
      }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
};

/** What Film's cursor layer needs from a scene (cursorAt(frame) returns this or null). */
export type CursorState = CursorProps;

/**
 * Press grammar. P = frame of maximum depth (the press SFX frame). Cursor 1 -> 0.86 and target 1 -> targetMin over
 * P-4..P (PRESS ease), held until `release` (default P + 7), then back to 1 over releaseFrames (default 7) f (SITE).
 * darken: 0.04 on frame P relaxing linearly to 0 over 9 f (multiply a background by 1 - darken).
 */
export const press = (
  frame: number,
  P: number,
  { release = P + 7, targetMin = 0.96, releaseFrames = 7 }: { release?: number; targetMin?: number; releaseFrames?: number } = {},
) => {
  const down = frame <= P ? E.PRESS(Math.min(1, Math.max(0, (frame - (P - 4)) / 4))) : 1;
  const up = frame <= release ? 0 : E.SITE(Math.min(1, (frame - release) / releaseFrames));
  const depth = down * (1 - up); // 0 rest, 1 fully pressed
  return {
    cursor: 1 - 0.14 * depth,
    target: 1 - (1 - targetMin) * depth,
    darken: frame < P ? 0 : Math.max(0, 0.04 * (1 - (frame - P) / 9)),
    depth,
  };
};

