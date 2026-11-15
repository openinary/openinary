// Scene C UI atoms: baseline-exact SVG text, the mechanical odometer, rolling text, chips, plain labels.
// Everything is positioned in the rail's world px (the rail layer translates them) and is a pure function of props.
import type { CSSProperties, ReactNode } from "react";
import { E } from "../../lib/ease";
import { measureText } from "../../lib/fonts";
import { C, FONT } from "../../lib/tokens";

/** Geist Mono advance (em). */
export const MONO_ADV = 0.6;

type TextStyle = { size: number; weight?: number; mono?: boolean; fill?: string };

const textCss = ({ size, weight = 500, mono = true }: TextStyle): CSSProperties => ({
  fontFamily: mono ? FONT.mono : FONT.sans,
  fontWeight: weight,
  fontSize: size,
  fontFeatureSettings: '"tnum"',
  fontKerning: "normal",
  whiteSpace: "pre",
});

/** Width of a text run in px. Mono is exact (0.6 em per char); sans is measured. */
export const textWidth = (text: string, s: TextStyle) =>
  s.mono === false ? measureText(text, { size: s.size, weight: s.weight ?? 500, family: FONT.sans }) : text.length * MONO_ADV * s.size;

/**
 * A tight SVG box around one line of text: `x` is the left edge, `baseline` the baseline, both in parent px.
 * Tight so a CSS filter (blur-slide) on it stays cheap.
 */
export const Line = ({
  x,
  baseline,
  width,
  style,
  children,
  ...s
}: TextStyle & { x: number; baseline: number; width: number; style?: CSSProperties; children: ReactNode }) => {
  const pad = 8;
  const top = baseline - s.size * 1.1;
  return (
    <svg
      width={width + 2 * pad}
      height={s.size * 1.5}
      style={{ position: "absolute", left: x - pad, top, overflow: "visible", ...style }}
    >
      <text x={pad} y={s.size * 1.1} fill={s.fill ?? C.ink} style={textCss(s)} xmlSpace="preserve">
        {children}
      </text>
    </svg>
  );
};

// --- mechanical odometer ------------------------------------------------------------------------------------
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Continuous digit positions of `v` printed with `dec` decimals (rounded half up, like toFixed), most significant
 * first. A digit rolls to its next value while the part below it crosses its rounding boundary (window w of one
 * unit of the last digit), so carries roll together and fast digits read as plain numbers.
 * `alpha` fades a leading digit as it rolls to 0; at least `minInt` integer digits always show.
 */
export const odometer = (v: number, dec: number, minInt = 1, w = 0.2) => {
  const x = Math.max(0, v) * 10 ** dec;
  const n = Math.max(dec + minInt, Math.floor(Math.log10(x + 0.5 + 1e-9)) + 2); // one spare column for a roll-out
  const cols: { pos: number; alpha: number }[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const unit = 10 ** k;
    const base = Math.floor(x / unit);
    const lower = x - base * unit;
    const carry = smooth(Math.min(1, Math.max(0, (lower - (unit - 0.5 - w / 2)) / w)));
    const hi = base + carry;
    cols.push({ pos: (base % 10) + carry, alpha: k < dec + minInt ? 1 : Math.min(1, hi) });
  }
  while (cols.length > dec + minInt && cols[0].alpha <= 0) cols.shift();
  return cols;
};

/** One rolling glyph column clipped to its line (nested svg = clip viewport). pos: continuous digit 0..10. */
const DigitColumn = ({ x, baseline, pos, alpha, size, fill }: { x: number; baseline: number; pos: number; alpha: number; size: number; fill: string }) => {
  const d = Math.floor(pos);
  const f = pos - d;
  const { top, h, step, y0 } = rollBox(size);
  const adv = MONO_ADV * size;
  return (
    <svg x={x} y={baseline - top} width={adv} height={h} overflow="hidden" opacity={alpha}>
      <text x={0} y={y0 - f * step} fill={fill} fillOpacity={1 - 0.7 * f}>
        {String(d % 10)}
      </text>
      {f > 0.001 ? (
        <text x={0} y={y0 + (1 - f) * step} fill={fill} fillOpacity={0.3 + 0.7 * f}>
          {String((d + 1) % 10)}
        </text>
      ) : null}
    </svg>
  );
};

/** Clip box of a rolling glyph column: from 0.85 em above the baseline to 0.28 em below; glyphs one step apart. */
const rollBox = (size: number) => ({ top: size * 0.85, h: size * 1.13, step: size * 1.2, y0: size * 0.85 });

/** Odometer parts for a number with `dec` decimals: integer columns, ".", decimal columns. */
export const numParts = (v: number, dec: number, minInt = 1): OdoPart[] => {
  const cols = odometer(v, dec, minInt);
  return dec > 0 ? [{ roll: cols.slice(0, cols.length - dec) }, { text: "." }, { roll: cols.slice(cols.length - dec) }] : [{ roll: cols }];
};

export type OdoPart = { roll: { pos: number; alpha: number }[] } | { text: string; fill?: string };

/**
 * A line made of rolling digit columns and static text, right-aligned on `right` (or left-aligned on `left`).
 * Mono only (every column is one advance wide).
 */
export const Odo = ({
  parts,
  right,
  left,
  baseline,
  size,
  weight = 500,
  fill = C.ink,
  style,
}: {
  parts: OdoPart[];
  right?: number;
  left?: number;
  baseline: number;
  size: number;
  weight?: number;
  fill?: string;
  style?: CSSProperties;
}) => {
  const adv = MONO_ADV * size;
  const n = parts.reduce((s, p) => s + ("roll" in p ? p.roll.length : p.text.length), 0);
  const x0 = left ?? (right ?? 0) - n * adv;
  const pad = 8;
  const top = baseline - size * 1.1;
  let i = 0;
  const kids: ReactNode[] = [];
  for (const [pi, p] of parts.entries()) {
    if ("roll" in p) {
      for (const [ci, c] of p.roll.entries())
        kids.push(<DigitColumn key={`${pi}.${ci}`} x={pad + (i + ci) * adv} baseline={size * 1.1} pos={c.pos} alpha={c.alpha} size={size} fill={fill} />);
      i += p.roll.length;
    } else {
      kids.push(
        <text key={pi} x={pad + i * adv} y={size * 1.1} fill={p.fill ?? fill} xmlSpace="preserve">
          {p.text}
        </text>,
      );
      i += p.text.length;
    }
  }
  return (
    <svg width={n * adv + 2 * pad} height={size * 1.5} style={{ position: "absolute", left: x0 - pad, top, overflow: "visible", ...style }}>
      <g style={textCss({ size, weight })}>{kids}</g>
    </svg>
  );
};

/**
 * Split-flap style text change: char j of `from` rolls up and out while char j of `to` rolls in from below, over
 * `dur` frames starting at `start + j * stagger` (SITE). Unchanged chars stay put. Returns SVG children for a <text>
 * free layout: one clipped column per char, placed from `x` (mono).
 */
export const RollChars = ({
  from,
  to,
  frame,
  start,
  dur,
  stagger,
  x,
  baseline,
  size,
  fill,
}: {
  from: string;
  to: string;
  frame: number;
  start: number;
  dur: number;
  stagger: number;
  x: number;
  baseline: number;
  size: number;
  fill: string;
}) => {
  const adv = MONO_ADV * size;
  const { top: t, h, step, y0 } = rollBox(size);
  const top = baseline - t;
  let changed = 0;
  return (
    <>
      {[...to].map((ch, j) => {
        const old = from[j];
        if (old === ch) {
          return (
            <text key={j} x={x + j * adv} y={baseline} fill={fill}>
              {ch}
            </text>
          );
        }
        const s = start + changed++ * stagger;
        const p = E.SITE(Math.min(1, Math.max(0, (frame - s) / dur)));
        if (p <= 0 || p >= 1)
          return (
            <text key={j} x={x + j * adv} y={baseline} fill={fill}>
              {p >= 1 ? ch : old}
            </text>
          );
        return (
          <svg key={j} x={x + j * adv} y={top} width={adv} height={h} overflow="hidden">
            <text x={0} y={y0 - p * step} fill={fill} fillOpacity={1 - p}>
              {old}
            </text>
            <text x={0} y={y0 + (1 - p) * step} fill={fill} fillOpacity={p}>
              {ch}
            </text>
          </svg>
        );
      })}
    </>
  );
};

// --- chips and labels -----------------------------------------------------------------------------------------
export const CHIP = { h: 64, padX: 22, radius: 14, font: 36, border: 1.5 } as const;
/** Baseline of the chip text below the chip top (Geist Mono 36 optically centred in 64). */
export const CHIP_BASELINE = 44;

export type ChipSeg = { text: string; fill: string };

/** Label chip (white, 1.5 px #E5E5E5, r 14, Geist Mono 500 36). `children` overrides the text (odometer). */
export const Chip = ({ left, top, segs, opacity = 1, children }: { left: number; top: number; segs: ChipSeg[]; opacity?: number; children?: ReactNode }) => {
  const n = segs.reduce((s, g) => s + g.text.length, 0);
  const w = n * MONO_ADV * CHIP.font + 2 * CHIP.padX;
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: CHIP.h,
        borderRadius: CHIP.radius,
        background: C.surface,
        boxShadow: `inset 0 0 0 ${CHIP.border}px ${C.border}`,
        opacity,
        overflow: "hidden",
      }}
    >
      <svg width={w} height={CHIP.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <g style={textCss({ size: CHIP.font, weight: 500 })}>
          {children ?? (
            <text x={CHIP.padX} y={CHIP_BASELINE} xmlSpace="preserve">
              {segs.map((g, i) => (
                <tspan key={i} fill={g.fill}>
                  {g.text}
                </tspan>
              ))}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
};

/** Centre x (chip-local) of chars [a, b) of the chip text. */
export const chipCharCentre = (a: number, b: number) => CHIP.padX + ((a + b) / 2) * MONO_ADV * CHIP.font;

export const LABEL = { size: 30, weight: 500, gap: 14, tick: 10 } as const;

/**
 * Plain-English label under a chip param (FINAL S5): 1 px #D4D4D4 10 px tick from the chip bottom, Geist 500 30
 * #737373 whose cap top sits 14 px below the chip. Enters with the site's blur-slide (y 12 -> 0, blur 4 -> 0,
 * opacity 0 -> 1, 13 f, SITE) from `start`. `cx` is the label centre; `tickX` where the tick meets the param.
 */
export const PlainLabel = ({
  text,
  cx,
  tickX,
  chipBottom,
  frame,
  start,
  opacity = 1,
}: {
  text: string;
  cx: number;
  tickX: number;
  chipBottom: number;
  frame: number;
  start: number;
  opacity?: number;
}) => {
  const p = E.SITE(Math.min(1, Math.max(0, (frame - start) / 13)));
  const o = p * opacity;
  if (o <= 0) return null;
  const w = textWidth(text, { size: LABEL.size, weight: LABEL.weight, mono: false });
  const capTop = chipBottom + LABEL.gap;
  const baseline = capTop + Math.round(LABEL.size * 0.7);
  const dy = 12 * (1 - p);
  const blur = 4 * (1 - p);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: Math.round(tickX) - 0.5,
          top: chipBottom + 2,
          width: 1,
          height: LABEL.tick,
          background: C.dashed,
          opacity: o,
        }}
      />
      <Line
        x={Math.round(cx - w / 2)}
        baseline={baseline}
        width={w}
        size={LABEL.size}
        weight={LABEL.weight}
        mono={false}
        fill={C.muted}
        style={{ opacity: o, transform: dy ? `translateY(${dy}px)` : undefined, filter: blur > 0.01 ? `blur(${blur}px)` : undefined }}
      >
        {text}
      </Line>
    </>
  );
};

/** Lay out labels under their params without overlapping: each wants to centre on its param; push apart if needed. */
export const spreadLabels = (items: { text: string; want: number }[], minGap = 28) => {
  const ws = items.map((it) => textWidth(it.text, { size: LABEL.size, weight: LABEL.weight, mono: false }));
  const cx = items.map((it) => it.want);
  for (let i = 1; i < cx.length; i++) {
    const overlap = cx[i - 1] + ws[i - 1] / 2 + minGap - (cx[i] - ws[i] / 2);
    if (overlap > 0) {
      cx[i - 1] -= overlap / 2;
      cx[i] += overlap / 2;
    }
  }
  return cx;
};
