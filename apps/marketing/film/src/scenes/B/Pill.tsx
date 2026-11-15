// The URL pill (HUD, bars 2 to 4) and its FLIP into the circle's world label chip (bar 5).
// S5: slides in, caret, keys insert at the caret (carriage: text right of the caret slides 31.2 px over 3 f, SITE).
// S6: `,h_600`, `,r_max` insert before the `/`; plain-English labels blur-slide in under each committed group.
// S7: labels out, host `cdn.openinary.dev/` collapses, the params block becomes a reel (18 swaps).
// S8: `…/t/`, `/hills.jpg` and the link icon collapse; the params FLIP into the world chip under the circle.
import { interpolateColors } from "remotion";
import { E, lerp, prog, tween } from "../../lib/ease";
import { FONT, C } from "../../lib/tokens";
import { Link2 } from "../../lib/icons";
import { HOST, PILL_FILE, PILL_HOST, S7_STATES, TYPING } from "../../lib/variants";
import { T, TYPE } from "../../timeline";
import { dropProg, rowCam, s7 } from "./model";

const P = T.S5.pill;
const ADV = P.advance; // 31.2
const HOST_N = HOST.length; // 18, collapses in S7
const REST = PILL_HOST.slice(HOST_N); // "…/t/"
const FILE = PILL_FILE.slice(1); // "hills.jpg" (the "/" is typed at T.S5.keys[5])
const URL_RAMP = 8; // concept A: URL typing ramps to ink in 8 f
/** S7 slot window (pill-local y 16..96 = screen 1238..1318): the reel rolls 80 px inside it, soft 13 px fade edges;
 * the resting ink rows (pill-local 31..80) stay fully opaque. */
const REEL = { top: 16, h: 80, mask: "linear-gradient(180deg, transparent 0, #000 13px, #000 67px, transparent 80px)" } as const;
/** Behind "/hills.jpg" in the slot rows: a longer outgoing string's tail slides under it (16 px soft left edge). */
const fileBg = () => `linear-gradient(90deg, rgba(${C.wash},0) 0, ${C.surface} 16px)`;

// Typed cells in display order: params (time order), then the typed "/".
type Cell = { ch: string; t: number };
const PARAMS: Cell[] = [
  ...[...TYPING[1]].map((ch, i) => ({ ch, t: T.S5.keys[i] })),
  ...[...TYPING[2].slice(TYPING[1].length)].map((ch, i) => ({ ch, t: T.S6.keys2[i] })),
  ...[...TYPING[3].slice(TYPING[2].length)].map((ch, i) => ({ ch, t: T.S6.keys3[i] })),
];
const SLASH: Cell = { ch: "/", t: T.S5.keys[TYPING[1].length] };
const KEY_FRAMES = [...PARAMS.map((c) => c.t), SLASH.t];

/** Slot opening of a typed cell (0..1). Shifted one frame so the new glyph never sits on its neighbour. */
const open = (t: number, f: number) => (f < t ? 0 : E.SITE(Math.min(1, (f - t + 1) / 3)));
const glyphOpacity = (t: number, f: number) => Math.min(1, Math.max(0, (f - t + 1) / TYPE.fadeInFrames));
const ramp = (t: number, f: number, to: string) => interpolateColors(Math.min(1, Math.max(0, (f - t) / URL_RAMP)), [0, 1], [C.typeGrey, to]);

// Chip (wall label) proportions in world px (Geist Mono 500), expressed at the pill's 52 px text size.
// 44 (not 48) world px: at 48 the `c_pad,b_white` chip overlaps its B1 neighbour's chip across the 120 px gap.
export const CHIP = { font: 44, h: 72, padX: 20, radius: 18, gapBelowTile: 28 } as const;
const K52 = P.font / CHIP.font;

type Seg = { key: string; x: number; w: number; chars: { ch: string; x: number; color: string; opacity: number; dy?: number }[]; opacity?: number };

/** Pill layout in HUD units at frame f: text segments (x from the text origin), text width, caret, labels. */
const layout = (f: number) => {
  const segs: Seg[] = [];
  // The host fades out (4 f) before its width collapses, so no glyph is ever sliced by the shrinking slot. INOUT, not
  // SITE: over 5 f SITE would drop 60% of the 562 px on the first frame.
  const hostW = HOST_N * ADV * (1 - prog(f, T.S7.hostCollapse, E.INOUT));
  const hostOp = 1 - prog(f, [T.S7.labelsOut[0], T.S7.labelsOut[0] + 4], E.SITE);
  // Same at the DROP: "…/t/", the icon and "/hills.jpg" are gone (f481) before the widths collapse (from f482).
  const c8 = dropProg(f, T.S8.pillCollapse, E.SITE);
  const edgeOp = 1 - dropProg(f, [T.S8.drop, T.S8.drop + 2]);
  if (hostW > 0.01)
    segs.push({ key: "host", x: 0, w: hostW, opacity: hostOp, chars: [...HOST].map((ch, i) => ({ ch, x: i * ADV, color: C.host, opacity: 1 })) });
  const restW = REST.length * ADV * (1 - c8);
  segs.push({ key: "rest", x: hostW, w: restW, opacity: edgeOp, chars: [...REST].map((ch, i) => ({ ch, x: i * ADV, color: C.host, opacity: 1 })) });
  const p0 = hostW + restW;

  let paramsW: number;
  const groups: { x0: number; x1: number }[] = [];
  if (f < T.S7.swaps[0]) {
    // typed text with carriage insertion
    const chars: Seg["chars"] = [];
    let x = 0;
    PARAMS.forEach((c, i) => {
      if (f < c.t) return;
      chars.push({ ch: c.ch, x, color: ramp(c.t, f, C.ink), opacity: glyphOpacity(c.t, f) });
      if (i === 0 || i === 6 || i === 12) groups.push({ x0: x, x1: x });
      if (c.ch !== ",") groups[groups.length - 1].x1 = x + ADV;
      x += open(c.t, f) * ADV;
    });
    paramsW = x;
    segs.push({ key: "params", x: p0, w: paramsW + ADV, chars }); // not clipped (w only informative)
  } else {
    // S7 reel: a slot-machine window. Old rolls up and out, new rolls in from below, both full weight (the
    // window's mask does the fade).
    const s = s7(f);
    const a = S7_STATES[s.from].params;
    const b = S7_STATES[s.to].params;
    const r = s.roll;
    // The slot width rides the same roll, steepened (INOUT of r): it holds the outgoing string's width while that one
    // is legible and reaches the incoming one's by the time it is (no gap before "/hills.jpg", nothing tucked under
    // it at rest); it swaps mid-roll, where the window's mask has both strings half out. "/hills.jpg" x and the pill
    // W both follow it on the same frame.
    paramsW = lerp(a.length, b.length, E.INOUT(r)) * ADV;
    const row = (txt: string, dy: number) => [...txt].map((ch, i) => ({ ch, x: i * ADV, color: C.ink, opacity: 1, dy }));
    const chars = r >= 1 ? row(b, 0) : [...row(a, -REEL.h * r), ...row(b, REEL.h * (1 - r))];
    segs.push({ key: "reel", x: p0, w: paramsW, chars });
  }

  // "/" + "hills.jpg"
  const slashOpen = f < T.S7.swaps[0] ? open(SLASH.t, f) : 1;
  const slashOn = f >= SLASH.t;
  const sufX = p0 + paramsW;
  const sufW = (slashOpen + FILE.length) * ADV * (1 - c8);
  const suf: Seg["chars"] = [];
  if (slashOn) suf.push({ ch: "/", x: 0, color: ramp(SLASH.t, f, C.host), opacity: glyphOpacity(SLASH.t, f) });
  [...FILE].forEach((ch, i) => suf.push({ ch, x: (slashOpen + i) * ADV, color: C.host, opacity: 1 }));
  segs.push({ key: "file", x: sufX, w: sufW, opacity: edgeOp, chars: suf });

  // caret: at the insertion point (before the "/" from f238), gone at the host collapse
  let caret: { x: number; on: boolean } | null = null;
  if (f >= T.S5.caret && f < T.S7.labelsOut[0]) {
    const x = p0 + paramsW + (f >= SLASH.t && f < T.S6.snap[0] ? slashOpen * ADV : 0);
    const typing = f < T.S5.keys[0] || KEY_FRAMES.some((k) => f >= k && f - k <= 12);
    caret = { x, on: typing || Math.floor(f / 15) % 2 === 0 }; // idle: blinks on 8ths, on for the first 8th of each beat
  }
  const labelAt = [T.S6.labelWidth, T.S6.labelHeight, T.S6.labelRound];
  const labels = groups.map((g, i) => ({ text: ["width", "height", "round"][i], cx: p0 + (g.x0 + g.x1) / 2, at: labelAt[i] }));
  return { segs, textW: sufX + sufW, caret, labels, c8, edgeOp };
};

/** Pill (and later chip) at frame f. Rendered in screen space. */
export const Pill = ({ f }: { f: number }) => {
  if (f < T.S5.pillIn[0]) return null;
  const L = layout(f);
  // HUD geometry, in HUD units (52 px text)
  const c8 = L.c8;
  const padL = lerp(P.padL, CHIP.padX * K52, c8);
  const iconW = (P.icon + P.gap) * (1 - c8);
  const padR = lerp(P.padR, CHIP.padX * K52, c8);
  const h = lerp(P.h, CHIP.h * K52, c8);
  const radius = lerp(P.radius, CHIP.radius * K52, c8);
  const W = padL + iconW + L.textW + padR;

  // FLIP into the world chip under the circle (B1 row camera): centre + uniform scale
  const q = dropProg(f, T.S8.paramsFlip, E.RELEASE);
  let cx: number = P.cx;
  let cy: number = P.cy + tween(f, T.S5.pillIn, [140, 0], E.SITE);
  let s = 1;
  if (f >= T.S8.drop) {
    const cam = rowCam(f, 1);
    const g = T.S6.frameCentre;
    const chipY = g.y + 300 + CHIP.gapBelowTile + CHIP.h / 2; // circle 600 tall, bottom-aligned at row centre + 300
    const tx = cam.zoom * g.x + cam.tx;
    const ty = cam.zoom * chipY + cam.ty;
    cx = lerp(cx, tx, q);
    cy = lerp(cy, ty, q);
    s = lerp(1, (cam.zoom * CHIP.font) / P.font, q);
  }
  const opacity = prog(f, T.S5.pillOpacity);
  const border = lerp(1.5, 1 / Math.max(s, 0.01), q);
  const shadowOn = 1 - q;
  const baseline = h / 2 + P.font * 0.355; // Geist Mono cap-height centre on the pill centre
  const textX = padL + iconW;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx - W / 2,
          top: cy - h / 2,
          width: W,
          height: h,
          transformOrigin: "50% 50%",
          transform: s !== 1 ? `scale(${s})` : undefined,
          opacity,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius,
            background: C.surface,
            boxShadow: `inset 0 0 0 ${border}px ${C.border}, 0 1px 2px rgba(0,0,0,${(0.05 * shadowOn).toFixed(4)}), 0 16px 40px -16px rgba(0,0,0,${(0.12 * shadowOn).toFixed(4)})`, // SHADOW.pill, fading
          }}
        />
        {/* content clipped to the pill (safety: nothing ever prints outside it) */}
        <div style={{ position: "absolute", inset: 0, borderRadius: radius, overflow: "hidden" }}>
          {iconW > 0.5 ? (
            <div
              style={{
                position: "absolute",
                left: P.padL,
                top: h / 2 - P.icon / 2,
                opacity: (1 - c8) * L.edgeOp,
                transform: `scale(${1 - c8})`,
                transformOrigin: "0 50%",
              }}
            >
              <Link2 size={P.icon} color={C.host} strokeWidth={2} />
            </div>
          ) : null}
          {L.segs.map((seg) => {
            const reel = seg.key === "reel";
            const free = seg.key === "params" || reel; // typed text and the reel are never clipped sideways
            const top = reel ? REEL.top : 0;
            return (
              <div
                key={seg.key}
                style={{
                  position: "absolute",
                  left: textX + seg.x,
                  top,
                  width: free ? undefined : seg.w,
                  height: reel ? REEL.h : h,
                  overflow: seg.key === "params" ? "visible" : "hidden",
                  opacity: seg.opacity,
                  ...(reel ? { width: W, maskImage: REEL.mask, WebkitMaskImage: REEL.mask } : null),
                }}
              >
                {seg.key === "file" ? <div style={{ position: "absolute", left: 0, top: REEL.top, width: seg.w, height: REEL.h, background: fileBg() }} /> : null}
                <svg
                  width={seg.key === "params" ? 1 : reel ? W : Math.max(seg.w, 0.01)}
                  height={h}
                  style={{ position: "absolute", left: 0, top: -top, overflow: seg.key === "params" ? "visible" : "hidden" }}
                >
                  <text style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: P.font }} xmlSpace="preserve">
                    {seg.chars.map((c, i) => (
                      <tspan key={i} x={c.x} y={baseline + (c.dy ?? 0)} fill={c.color} fillOpacity={c.opacity}>
                        {c.ch}
                      </tspan>
                    ))}
                  </text>
                </svg>
              </div>
            );
          })}
          {L.caret?.on ? (
            <div style={{ position: "absolute", left: textX + L.caret.x - 1.5, top: h / 2 - 30, width: 3, height: 60, borderRadius: 1.5, background: C.ink }} />
          ) : null}
        </div>
      </div>
      {f < T.S7.labelsOut[1] + 1 ? <Labels f={f} labels={L.labels} left={cx - W / 2 + textX} top={cy + h / 2} /> : null}
    </>
  );
};

/** Plain-English labels under each committed param group: the site's blur-slide in, fade out in S7. */
const Labels = ({ f, labels, left, top }: { f: number; labels: { text: string; cx: number; at: number }[]; left: number; top: number }) => {
  const out = 1 - prog(f, T.S7.labelsOut);
  const { frames, dy, blur } = T.S5.labelIn;
  return (
    <>
      {labels.map((l) => {
        if (f < l.at) return null;
        const p = prog(f, [l.at, l.at + frames], E.SITE);
        const x = left + l.cx;
        return (
          <div key={l.text} style={{ position: "absolute", left: 0, top: 0, opacity: p * out }}>
            <div style={{ position: "absolute", left: x - 0.5, top: top + 2, width: 1, height: 10, background: C.dashed }} />
            <div
              style={{
                position: "absolute",
                left: x - 100,
                width: 200,
                top: top + T.S5.labelGap + dy * (1 - p),
                textAlign: "center",
                fontFamily: FONT.sans,
                fontWeight: 500,
                fontSize: 30,
                lineHeight: "36px",
                color: C.muted,
                filter: p < 1 ? `blur(${(blur * (1 - p)).toFixed(2)}px)` : undefined,
              }}
            >
              {l.text}
            </div>
          </div>
        );
      })}
    </>
  );
};
