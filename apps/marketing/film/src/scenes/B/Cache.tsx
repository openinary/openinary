// The cache beat (v5, bar 8): a timing chip under the URL pill. First request: a progress line and a climbing
// counter (412 ms). The page reloads (the photo blinks). Second request: straight from the edge (9 ms, green dot).
import { E, prog, tween } from "../../lib/ease";
import { measureText } from "../../lib/fonts";
import { C, FONT, SHADOW, TNUM } from "../../lib/tokens";
import { CACHE } from "../../timeline";
import { frameScreen } from "./model";

const H = 76;
const FONT_PX = 40;
const PAD = 30;
const GAP = 18;
const DOT = 14;

const label = (f: number) => (f < CACHE.second[0] + 3 ? "first request" : "cached at the edge");
const msAt = (f: number) =>
  f < CACHE.second[0]
    ? Math.round(CACHE.firstMs * prog(f, CACHE.first, E.INOUT))
    : Math.round(tween(f, CACHE.second, [CACHE.firstMs, CACHE.secondMs], E.SITE));

/** The photo blinks while the page reloads (drawn over the frame, in the ground's colour). */
export const ReloadBlink = ({ f }: { f: number }) => {
  if (f < CACHE.reload[0] || f > CACHE.reload[1]) return null;
  const p = prog(f, CACHE.reload);
  const a = 0.55 * Math.sin(Math.PI * p);
  const r = frameScreen(f);
  return <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: "50%", background: `rgba(${C.wash},${a.toFixed(4)})` }} />; // the cache beat always shows the r_max circle
};

export const CacheChip = ({ f }: { f: number }) => {
  if (f < CACHE.chipIn[0] || f > CACHE.out[1]) return null;
  const pin = prog(f, CACHE.chipIn, E.SITE);
  const pout = prog(f, CACHE.out, E.SITE);
  const opacity = pin * (1 - pout);
  const ms = `${msAt(f)} ms`;
  const lab = label(f);
  // width follows the content, the swap eases between the two
  const wOf = (l: string, m: string) => PAD + DOT + GAP + measureText(m, { size: FONT_PX, weight: 500, family: FONT.mono }) + GAP + measureText(l, { size: FONT_PX }) + PAD;
  const w1 = wOf("first request", `${CACHE.firstMs} ms`);
  const w2 = wOf("cached at the edge", `${CACHE.secondMs} ms`);
  const w = w1 + (w2 - w1) * prog(f, CACHE.second, E.SITE);
  const cached = f >= CACHE.second[0] + 3;
  const loading = f >= CACHE.first[0] && f < CACHE.first[1];
  const line = loading ? prog(f, CACHE.first, E.INOUT) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - w / 2,
        top: CACHE.cy - H / 2,
        width: w,
        height: H,
        boxSizing: "border-box",
        borderRadius: H / 2,
        background: C.surface,
        boxShadow: `inset 0 0 0 1.5px ${C.border}, ${SHADOW.pill}`,
        opacity,
        transform: `translateY(${16 * (1 - pin) + 8 * pout}px)`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        paddingLeft: PAD,
        whiteSpace: "nowrap",
      }}
    >
      {line > 0 ? <div style={{ position: "absolute", left: 0, bottom: 0, height: 4, width: `${line * 100}%`, background: C.ink, opacity: 0.25 }} /> : null}
      <span style={{ width: DOT, height: DOT, borderRadius: DOT / 2, flex: "none", background: cached ? C.success : C.faint }} />
      <span style={{ marginLeft: GAP, fontFamily: FONT.mono, fontWeight: 500, fontSize: FONT_PX, color: C.ink, ...TNUM }}>{ms}</span>
      <span style={{ marginLeft: GAP, fontFamily: FONT.sans, fontSize: FONT_PX, color: C.muted, opacity: f >= CACHE.second[0] && f < CACHE.second[0] + 6 ? Math.abs(f - CACHE.second[0] - 3) / 3 : 1 }}>{lab}</span>
    </div>
  );
};
