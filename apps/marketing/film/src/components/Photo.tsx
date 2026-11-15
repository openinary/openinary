// Cover-math image primitive = the engine's output rules (concept A 2.6):
//  - default: fill/cover, centre gravity (Sharp fit cover, position centre) -> coverRect
//  - pad: c_pad,b_white = contain on white -> containRect
//  - radius "max" = r_max ellipse (border-radius 50%); a number = r_N at 1:1 display (scale it yourself if zoomed)
// The image rect is computed explicitly (not object-fit) so scenes can reuse it for overflow ghosts and FLIPs.
import type { CSSProperties } from "react";
import { Img } from "remotion";
import type { Rect } from "../lib/camera";
import type { Media } from "../lib/media";
import { C } from "../lib/tokens";

export type Size = { w: number; h: number };

/** Rect (box-local) of an image of natural size `nat` covering a w x h box; pos = object-position fraction. */
export const coverRect = (nat: Size, box: Size, pos = { x: 0.5, y: 0.5 }): Rect => {
  const s = Math.max(box.w / nat.w, box.h / nat.h);
  const w = nat.w * s,
    h = nat.h * s;
  return { x: (box.w - w) * pos.x, y: (box.h - h) * pos.y, w, h };
};

/** Rect (box-local) of an image contained in a w x h box (c_pad: the rest is background). */
export const containRect = (nat: Size, box: Size, pos = { x: 0.5, y: 0.5 }): Rect => {
  const s = Math.min(box.w / nat.w, box.h / nat.h);
  const w = nat.w * s,
    h = nat.h * s;
  return { x: (box.w - w) * pos.x, y: (box.h - h) * pos.y, w, h };
};

export type PhotoProps = {
  media: Media;
  /** Box size in the parent's px. Position it with `style` (left/top/transform) or `x`/`y`. */
  w: number;
  h: number;
  x?: number;
  y?: number;
  radius?: number | "max";
  pos?: { x: number; y: number };
  /** c_pad,b_white: contain on white (t = 1). Fractional t blends the image rect cover -> contain for morphs. */
  pad?: number;
  padColor?: string;
  /** Override the image rect (box-local), e.g. a global stencil alignment during a flight. */
  imageRect?: Rect;
  /** 1 px inset hairline rgba(0,0,0,.08) (cards, tiles). */
  hairline?: boolean;
  shadow?: string;
  opacity?: number;
  style?: CSSProperties;
};

export const Photo = ({ media, w, h, x, y, radius = 0, pos, pad = 0, padColor = C.white, imageRect, hairline, shadow, opacity, style }: PhotoProps) => {
  const box = { w, h };
  const r =
    imageRect ??
    (pad <= 0
      ? coverRect(media, box, pos)
      : pad >= 1
        ? containRect(media, box, pos)
        : mixRect(coverRect(media, box, pos), containRect(media, box, pos), pad));
  const br = radius === "max" ? "50%" : radius;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: br,
        overflow: "hidden",
        background: pad > 0 ? padColor : undefined,
        boxShadow: shadow,
        opacity,
        ...style,
      }}
    >
      <Img
        src={media.src}
        style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, maxWidth: "none", display: "block" }}
      />
      {hairline ? (
        <div style={{ position: "absolute", inset: 0, borderRadius: br, boxShadow: `inset 0 0 0 1px ${C.hairline}`, pointerEvents: "none" }} />
      ) : null}
    </div>
  );
};

export const mixRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});
