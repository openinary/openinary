// The one photo frame (full bleed -> w_600 -> crop -> round -> S7 reel states -> the circle tile), its overflow
// ghosts, and the screen-space selection kit: 2 px red stroke, handles, guides, dimension badge (odometer).
import { Img } from "remotion";
import { containRect, coverRect, mixRect } from "../../components/Photo";
import type { Rect } from "../../lib/camera";
import { E, lerp, prog } from "../../lib/ease";
import { MEDIA } from "../../lib/media";
import { C, FONT, TNUM } from "../../lib/tokens";
import { outputOf, SOURCE, S7_STATES, TYPING } from "../../lib/variants";
import { useViewport } from "../../lib/viewport";
import { T } from "../../timeline";
import { dropProg, frameAt, frameCam, s7, toScreen, type Geom } from "./model";

const IMG = MEDIA.hills2400;
const imageRect = (g: Geom) => {
  const box = { w: g.w, h: g.h };
  return g.pad <= 0 ? coverRect(IMG, box) : mixRect(coverRect(IMG, box), containRect(IMG, box), Math.min(1, g.pad));
};

/** The photo frame in screen px (drawn directly at its screen size: crisp at every zoom). */
export const PhotoFrame = ({ f }: { f: number }) => {
  const g = frameAt(f);
  const cam = frameCam(f);
  const r = toScreen(cam, g);
  const z = cam.zoom;
  const im = imageRect(g);
  return (
    <div
      style={{
        position: "absolute",
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        borderRadius: `${g.rx * z}px / ${g.ry * z}px`,
        overflow: "hidden",
        background: g.pad > 0 ? C.white : undefined,
      }}
    >
      <Img src={IMG.src} style={{ position: "absolute", left: im.x * z, top: im.y * z, width: im.w * z, height: im.h * z, maxWidth: "none", display: "block" }} />
    </div>
  );
};

/** S6 crop: the 100 px strips cut off each side, at 35%, drifting out 24 px and fading (f283 to f304). */
export const Ghosts = ({ f }: { f: number }) => {
  if (f < T.S6.ghostAppear || f > T.S6.ghostDrift[1]) return null;
  const g = frameAt(f);
  const cam = frameCam(f);
  const z = cam.zoom;
  const im = imageRect(g);
  const ov = -im.x; // overflow on each side, world px
  if (ov < 0.25) return null;
  const p = prog(f, T.S6.ghostDrift, E.SITE);
  const op = 0.35 * (1 - p);
  const d = 24 * p;
  const r = toScreen(cam, g);
  return (
    <>
      {[-1, 1].map((side) => {
        const x = side < 0 ? r.x - ov * z - d * z : r.x + r.w + d * z;
        return (
          <div key={side} style={{ position: "absolute", left: x, top: r.y, width: ov * z, height: r.h, overflow: "hidden", opacity: op }}>
            <Img
              src={IMG.src}
              style={{ position: "absolute", left: side < 0 ? 0 : -(g.w + ov) * z, top: im.y * z, width: im.w * z, height: im.h * z, maxWidth: "none", display: "block" }}
            />
          </div>
        );
      })}
    </>
  );
};

/** Selection opacity (0 before f244), fading with the B1 row in the whip. */
export const selectionOpacity = (f: number) => prog(f, T.S6.selectionIn);

export const Selection = ({ r, f, opacity }: { r: Rect; f: number; opacity: number }) => {
  if (opacity <= 0) return null;
  const hs = lerp(14, 10, dropProg(f, T.S8.release, E.RELEASE)); // handles 14 -> 10 px in the pull-back
  const corners = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ];
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity }}>
      <div style={{ position: "absolute", left: r.x - 1, top: r.y - 1, width: r.w + 2, height: r.h + 2, boxShadow: `inset 0 0 0 2px ${C.red}` }} />
      {corners.map(([x, y], i) => (
        <div
          key={i}
          style={{ position: "absolute", left: x - hs / 2, top: y - hs / 2, width: hs, height: hs, borderRadius: 2, background: C.white, boxShadow: `inset 0 0 0 2px ${C.red}` }}
        />
      ))}
    </div>
  );
};

/** 1 px guides extending the frame's four edges to the (output) frame line (screen space, under the photo). */
export const Guides = ({ r, opacity }: { r: Rect; opacity: number }) => {
  const fl = useViewport().frameLine;
  if (opacity <= 0) return null;
  const [x0, y0, x1, y1] = [fl.x, fl.y, fl.x + fl.w, fl.y + fl.h];
  const xs = [Math.round(r.x), Math.round(r.x + r.w) - 1];
  const ys = [Math.round(r.y), Math.round(r.y + r.h) - 1];
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity }}>
      {ys.map((y, i) => (y > y0 && y < y1 ? <div key={`h${i}`} style={{ position: "absolute", left: x0, top: y, width: x1 - x0, height: 1, background: C.guide }} /> : null))}
      {xs.map((x, i) => (x > x0 && x < x1 ? <div key={`v${i}`} style={{ position: "absolute", left: x, top: y0, width: 1, height: y1 - y0, background: C.guide }} /> : null))}
    </div>
  );
};

// ------------------------------------------------------------------------------------------------ badge
const BADGE = { font: 30, h: 46, radius: 10, padX: 14, below: 18 } as const;
const ADV = BADGE.font * 0.6; // Geist Mono advance
/** Odometer window: rolling digits fade at the badge's top and bottom edges instead of being cut in half (the resting
 * glyphs, rows 12..34 of 46, stay fully opaque). */
const DIGIT_MASK = "linear-gradient(180deg, transparent 0, #000 22%, #000 78%, transparent 100%)";
const dims = (w: number, h: number) => `${w} × ${h}`;
const SRC = dims(SOURCE.w, SOURCE.h);
const W1 = dims(outputOf(TYPING[1]).w, outputOf(TYPING[1]).h); // 600 x 450
const W2 = dims(outputOf(TYPING[2]).w, outputOf(TYPING[2]).h); // 600 x 600

type Col = { w: number; cells: { ch: string; dy: number; opacity: number }[] };
const mod10 = (n: number) => ((n % 10) + 10) % 10;
/** Odometer columns of one number a -> b at progress p: every digit rolls to its new value in the number's direction. */
const numCols = (a: string, b: string, p: number): Col[] => {
  const n = Math.max(a.length, b.length);
  const A = a.padStart(n, " ");
  const B = b.padStart(n, " ");
  const up = Number(b) >= Number(a);
  const LH = BADGE.h;
  return [...A].map((ca, j) => {
    const cb = B[j];
    if (ca === cb) return { w: ADV, cells: [{ ch: ca, dy: 0, opacity: 1 }] };
    if (ca === " ") return { w: ADV * p, cells: [{ ch: cb, dy: (up ? 1 : -1) * (1 - p) * LH, opacity: p }] };
    if (cb === " ") return { w: ADV * (1 - p), cells: [{ ch: ca, dy: (up ? -1 : 1) * p * LH, opacity: 1 - p }] };
    const da = Number(ca);
    const db = Number(cb);
    const delta = up ? mod10(db - da) : -mod10(da - db);
    const v = da + delta * p;
    const n0 = Math.floor(v);
    return { w: ADV, cells: [n0, n0 + 1].map((k) => ({ ch: String(mod10(k)), dy: (k - v) * LH, opacity: 1 })) };
  });
};
const odometer = (a: string, b: string, p: number): Col[] => {
  const [a1, a2] = a.split(" × ");
  const [b1, b2] = b.split(" × ");
  const sep = [..." × "].map((ch) => ({ w: ADV, cells: [{ ch, dy: 0, opacity: 1 }] }));
  return [...numCols(a1, b1, p), ...sep, ...numCols(a2, b2, p)];
};

const badgeCols = (f: number): Col[] => {
  // INOUT (not SITE): the badge only becomes visible at f244, and SITE would have finished rolling by then
  if (f < T.S6.badge2[0]) return odometer(SRC, W1, prog(f, T.S6.badge1, E.INOUT));
  if (f < T.S7.swaps[0]) return odometer(W1, W2, prog(f, T.S6.badge2, E.INOUT));
  const o = S7_STATES[s7(f).to]; // hard swap on the swap frame
  const t = dims(o.w, o.h);
  return odometer(t, t, 1);
};

/** Red dimension badge, 18 px under the frame, odometer digits. */
export const Badge = ({ r, f, opacity }: { r: Rect; f: number; opacity: number }) => {
  if (opacity <= 0) return null;
  const cols = badgeCols(f);
  const w = 2 * BADGE.padX + cols.reduce((s, c) => s + c.w, 0);
  const cx = r.x + r.w / 2;
  let x = BADGE.padX;
  const base = BADGE.h / 2 + BADGE.font * 0.355;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - w / 2,
        top: r.y + r.h + BADGE.below,
        width: w,
        height: BADGE.h,
        borderRadius: BADGE.radius,
        background: C.red,
        overflow: "hidden",
        opacity,
      }}
    >
      <svg width={w} height={BADGE.h} style={{ position: "absolute", left: 0, top: 0, maskImage: DIGIT_MASK, WebkitMaskImage: DIGIT_MASK }}>
        <text style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: BADGE.font, ...TNUM }} fill={C.white} xmlSpace="preserve">
          {cols.flatMap((c, j) => {
            const x0 = x;
            x += c.w;
            return c.cells.map((cell, k) => (
              <tspan key={`${j}-${k}`} x={x0 + (c.w - ADV) / 2} y={base + cell.dy} fillOpacity={cell.opacity}>
                {cell.ch}
              </tspan>
            ));
          })}
        </text>
      </svg>
    </div>
  );
};
