// P1 HUD: rulers top + left (36 px), ticks (minor 20 / major 100 / numbers 200 ruler units), 20% camera parallax,
// red selection extent bands. Content passes under the 92% bands. The frame line lives in Ground.tsx (under the world).
// OUTPUT space (the composition size): Film passes the camera and selection already mapped through any framing.
import { useVideoConfig } from "remotion";
import { IDENTITY, parallax, type Camera, type Rect } from "../lib/camera";
import { C, FONT } from "../lib/tokens";

export const RULER = 36;

const ticks = (len: number, z: number, t: number) => {
  // ruler units u -> screen z*u + t; visible screen [RULER, len]
  const u0 = Math.floor((RULER - t) / z / 20) * 20;
  const u1 = Math.ceil((len - t) / z / 20) * 20;
  const out: { s: number; u: number; major: boolean; label: boolean }[] = [];
  for (let u = u0; u <= u1; u += 20) {
    const s = Math.round(z * u + t) + 0.5; // crisp 1 px lines
    if (s < RULER || s > len) continue;
    out.push({ s, u, major: u % 100 === 0, label: u % 200 === 0 });
  }
  return out;
};

export const Rulers = ({ camera = IDENTITY, selection = null }: { camera?: Camera; selection?: Rect | null }) => {
  const { width: W, height: H } = useVideoConfig();
  const r = parallax(camera);
  const top = ticks(W, r.zoom, r.tx);
  const left = ticks(H, r.zoom, r.ty);
  const num = { fontFamily: FONT.mono, fontSize: 10, fill: C.rulerNumber, fontWeight: 400 } as const;
  const sx0 = selection ? Math.max(RULER, selection.x) : 0;
  const sx1 = selection ? Math.min(W, selection.x + selection.w) : 0;
  const sy0 = selection ? Math.max(RULER, selection.y) : 0;
  const sy1 = selection ? Math.min(H, selection.y + selection.h) : 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      {/* bands */}
      <rect x={RULER} y={0} width={W - RULER} height={RULER} fill={C.rulerBand} />
      <rect x={0} y={RULER} width={RULER} height={H - RULER} fill={C.rulerBand} />
      {/* selection extents */}
      {selection && sx1 > sx0 ? (
        <g shapeRendering="crispEdges">
          <rect x={sx0} y={0} width={sx1 - sx0} height={RULER} fill={C.redBand} />
          <rect x={Math.round(selection.x)} y={0} width={1} height={RULER} fill={C.red} />
          <rect x={Math.round(selection.x + selection.w) - 1} y={0} width={1} height={RULER} fill={C.red} />
        </g>
      ) : null}
      {selection && sy1 > sy0 ? (
        <g shapeRendering="crispEdges">
          <rect x={0} y={sy0} width={RULER} height={sy1 - sy0} fill={C.redBand} />
          <rect x={0} y={Math.round(selection.y)} width={RULER} height={1} fill={C.red} />
          <rect x={0} y={Math.round(selection.y + selection.h) - 1} width={RULER} height={1} fill={C.red} />
        </g>
      ) : null}
      {/* ticks */}
      <g stroke={C.rulerTick} strokeWidth={1} shapeRendering="crispEdges">
        {top.map((t) => (
          <line key={`t${t.u}`} x1={t.s} x2={t.s} y1={RULER - (t.major ? 14 : 7)} y2={RULER} />
        ))}
        {left.map((t) => (
          <line key={`l${t.u}`} y1={t.s} y2={t.s} x1={RULER - (t.major ? 14 : 7)} x2={RULER} />
        ))}
      </g>
      <g style={num}>
        {top
          .filter((t) => t.label)
          .map((t) => (
            <text key={`tn${t.u}`} x={t.s + 3.5} y={14}>
              {t.u}
            </text>
          ))}
        {left
          .filter((t) => t.label)
          .map((t) => (
            <text key={`ln${t.u}`} transform={`translate(14 ${t.s - 3.5}) rotate(-90)`}>
              {t.u}
            </text>
          ))}
      </g>
      {/* inner edges + corner */}
      <g fill={C.rulerEdge} shapeRendering="crispEdges">
        <rect x={RULER} y={RULER - 1} width={W - RULER} height={1} />
        <rect x={RULER - 1} y={RULER} width={1} height={H - RULER} />
      </g>
      <rect x={0} y={0} width={RULER} height={RULER} fill={C.rulerCorner} />
      <rect x={RULER - 1} y={0} width={1} height={RULER} fill={C.rulerEdge} shapeRendering="crispEdges" />
      <rect x={0} y={RULER - 1} width={RULER} height={1} fill={C.rulerEdge} shapeRendering="crispEdges" />
    </svg>
  );
};
