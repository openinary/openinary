// A typewriter word on an exact baseline, centred on x by its measured advance width (Geist, canvas measureText).
// Pre-reserved layout: the final word's width is centred from the first glyph, nothing re-centres while typing.
// A rewrite (a `del` step) re-centres smoothly (SITE, 8 f) from the old final width to the new one.
// SVG text: y is the baseline, so no font-metric guessing. Reads the frame itself.
import { useCurrentFrame } from "remotion";
import { E } from "../lib/ease";
import { measureText } from "../lib/fonts";
import { FONT } from "../lib/tokens";
import { blockAt, compile, defaultColors, glyphsAt, type TypeColors } from "../lib/type";
import { TYPE, type WordScript } from "../timeline";

export type TypewriterProps = {
  script: WordScript;
  /** Centre x and baseline y (screen px of the layer this sits in). */
  x: number;
  baseline: number;
  size: number;
  weight?: number;
  trackingEm?: number;
  family?: string;
  /** Auto-fit: shrink the font so the widest block is <= maxWidth. */
  maxWidth?: number;
  colors?: TypeColors;
  rampFrames?: number;
  /** Override the frame (defaults to useCurrentFrame()). */
  frame?: number;
};

/** Font size after auto-fit, and the reserved width of each block at that size. */
export const typewriterLayout = (script: WordScript, { size, weight = 600, trackingEm = 0, family = FONT.sans, maxWidth }: Omit<TypewriterProps, "script" | "x" | "baseline">) => {
  const { blocks } = compile(script);
  const widths = blocks.map((b) => measureText(b.text, { size, weight, family, trackingEm }));
  const widest = Math.max(...widths);
  const fit = maxWidth && widest > maxWidth ? maxWidth / widest : 1;
  return { size: size * fit, widths: widths.map((w) => w * fit) };
};

export const Typewriter = (props: TypewriterProps) => {
  const current = useCurrentFrame();
  const { script, x, baseline, weight = 600, trackingEm = 0, family = FONT.sans, colors = defaultColors(), rampFrames = TYPE.rampFrames } = props;
  const frame = props.frame ?? current;
  const glyphs = glyphsAt(script, frame, colors, rampFrames);
  if (!glyphs) return null;
  const { size, widths } = typewriterLayout(script, props);
  const { i, p } = blockAt(script, frame);
  const w = i === 0 ? widths[0] : widths[i - 1] + (widths[i] - widths[i - 1]) * E.SITE(p);
  const left = Math.round(x - w / 2);
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      <text
        x={left}
        y={baseline}
        xmlSpace="preserve"
        style={{ fontFamily: family, fontWeight: weight, fontSize: size, letterSpacing: `${trackingEm}em`, whiteSpace: "pre", fontKerning: "normal" }}
      >
        {glyphs.map((g, j) => (
          <tspan key={j} fill={g.color} fillOpacity={g.opacity}>
            {g.ch}
          </tspan>
        ))}
      </text>
    </svg>
  );
};
