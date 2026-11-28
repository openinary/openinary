// S13 + S14 (f926 to f1055): the red mark shrinks into the lockup, the wordmark letters type in, the CTA pill and
// sub-line rise (v5: no URL pill, no click), the slow group zoom; then the exit, the recentre and the selection draw-on.
// From S14.recentre[1] SceneD hands over to <F0Tableau {...burstState(frame)} /> (the loop seam).
import { MarkShards } from "../../components/Mark";
import { E, prog } from "../../lib/ease";
import { C, FONT } from "../../lib/tokens";
import { CTA } from "../../lib/variants";
import { T } from "../../timeline";
import { groupZ, markPlacementAt, selectionEdgesAt, selectionRectAt } from "./geometry";

const S13 = T.S13;
const S14 = T.S14;

/** Pill + sub-line exit: fade (linear) and sink 12 px (SITE). */
const exitAt = (f: number) => ({ opacity: 1 - prog(f, S14.exit), dy: 12 * prog(f, S14.exit, E.SITE) });


const SubLine = ({ frame }: { frame: number }) => {
  const p = prog(frame, S13.subIn, E.SITE);
  const ex = exitAt(frame);
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <text
        x={S13.cta.cx}
        y={S13.subBaseline + 12 * (1 - p) + ex.dy}
        textAnchor="middle"
        opacity={p * ex.opacity}
        style={{ fontFamily: FONT.sans, fontWeight: 400, fontSize: 48, letterSpacing: "-0.01em", fill: C.muted }}
      >
        {CTA.sub}
      </text>
    </svg>
  );
};

const Selection = ({ frame }: { frame: number }) => {
  const r = selectionRectAt(frame);
  if (!r) return null;
  const e = selectionEdgesAt(frame);
  const x0 = Math.round(r.x),
    y0 = Math.round(r.y),
    x1 = Math.round(r.x + r.w),
    y1 = Math.round(r.y + r.h);
  const sw = 3; // stroke centred on the box edge: 1 px out, 2 px in
  const handle = (x: number, y: number) => <rect key={`${x},${y}`} x={x - 6} y={y - 6} width={12} height={12} fill={C.white} stroke={C.accent} strokeWidth={2} />;
  return (
    <svg width={1920} height={1484} style={{ position: "absolute", left: 0, top: 0 }} shapeRendering="crispEdges">
      <g fill={C.accent}>
        {e.left ? <rect x={x0 - 1} y={y0 - 1} width={sw} height={y1 - y0 + 2} /> : null}
        {e.top ? <rect x={x0 - 1} y={y0 - 1} width={x1 - x0 + 2} height={sw} /> : null}
        {e.rightBottom ? <rect x={x1 - 2} y={y0 - 1} width={sw} height={y1 - y0 + 2} /> : null}
        {e.rightBottom ? <rect x={x0 - 1} y={y1 - 2} width={x1 - x0 + 2} height={sw} /> : null}
      </g>
      {e.left ? [handle(x0, y0), handle(x0, y1)] : null}
      {e.top ? handle(x1, y0) : null}
      {e.rightBottom ? handle(x1, y1) : null}
    </svg>
  );
};

export const EndCard = ({ frame, selectionOnly = false }: { frame: number; selectionOnly?: boolean }) => {
  if (selectionOnly) return <Selection frame={frame} />;
  const z = groupZ(frame);
  const A = S13.zoomAnchor;
  const mark = markPlacementAt(frame);
  return (
    <>
      <MarkShards placement={mark} />
      {frame >= S13.ctaIn[0] && frame <= S14.exit[1] ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1484, transformOrigin: "0 0", transform: z === 1 ? undefined : `translate(${A.x}px, ${A.y}px) scale(${z}) translate(${-A.x}px, ${-A.y}px)` }}>
          {frame >= S13.subIn[0] ? <SubLine frame={frame} /> : null}
        </div>
      ) : null}
      <Selection frame={frame} />
    </>
  );
};
