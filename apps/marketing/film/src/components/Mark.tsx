// <MarkShards>: the 7 shards under a placement with per-shard transforms, an optional photo stencil (each shard
// clipped out of an image whose screen rect you supply) and an optional red flood (red layer masked by a
// feathered circle at R). <Wordmark> and <Lockup> render the logo.tsx lockup letter by letter.
// All geometry is in SCREEN px (full-frame 1920x1484 layers); nothing here reads the frame.
import { useId, type CSSProperties } from "react";
import { reduceInstructions, parsePath } from "@remotion/paths";
import { Img } from "remotion";
import type { Rect } from "../lib/camera";
import type { Pt } from "../lib/ease";
import {
  R,
  SHARDS,
  SHARD_IDS,
  rScreen,
  type Placement,
  type ShardId,
  type ShardState,
  shardTransform,
} from "../lib/shards";
import { LETTERS, WORDMARK } from "../lib/wordmark";
import { C, FONT } from "../lib/tokens";
import { H, W } from "../timeline";

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

// Pre-reduced absolute instructions per shard, for exact screen-space clip paths.
const REDUCED = Object.fromEntries(SHARD_IDS.map((id) => [id, reduceInstructions(parsePath(SHARDS[id].d))])) as Record<
  ShardId,
  ReturnType<typeof reduceInstructions>
>;

/** Shard outline as an SVG path string in screen px (same maths as shardTransform). */
export const shardScreenPath = (id: ShardId, placement: Placement, st: ShardState = {}) => {
  const p = st.p ?? placement;
  const g = SHARDS[id];
  const s = st.s ?? 1,
    d = st.d ?? 0;
  const ks = p.k * s;
  const tx = p.origin.x + p.k * (1 - s) * g.centroid.x + g.u.x * d + (st.dx ?? 0);
  const ty = p.origin.y + p.k * (1 - s) * g.centroid.y + g.u.y * d + (st.dy ?? 0);
  const X = (x: number) => (ks * x + tx).toFixed(3);
  const Y = (y: number) => (ks * y + ty).toFixed(3);
  return REDUCED[id]
    .map((i) =>
      i.type === "Z" ? "Z" : i.type === "C" ? `C${X(i.cp1x)} ${Y(i.cp1y)} ${X(i.cp2x)} ${Y(i.cp2y)} ${X(i.x)} ${Y(i.y)}` : `${i.type}${X(i.x)} ${Y(i.y)}`,
    )
    .join("");
};

export type Stencil = {
  src: string;
  /** Screen rect of the FULL image (use coverRect maths), one for all shards or per shard. */
  rect: Rect | Partial<Record<ShardId, Rect>>;
  /** Per-shard (or global) opacity of the photo, default 1. */
  opacity?: number | Partial<Record<ShardId, number>>;
};

export type Flood = {
  /** Radius in screen px of the fully red disc's outer edge (the feather sits inside it). */
  r: number;
  feather?: number;
  /** Default: R under the placement. */
  center?: Pt;
};

export type MarkShardsProps = {
  placement: Placement;
  shards?: Partial<Record<ShardId, ShardState>>;
  /** Render only these shards (default all 7). */
  only?: readonly ShardId[];
  /** Red layer opacity multiplier (default 1 without a stencil, 0 with one unless a flood is given). */
  red?: number;
  color?: string;
  stencil?: Stencil;
  flood?: Flood;
  style?: CSSProperties;
};

const isRect = (r: Stencil["rect"]): r is Rect => typeof (r as Rect).w === "number";

export const MarkShards = ({ placement, shards = {}, only = SHARD_IDS, red, color = C.ink, stencil, flood, style }: MarkShardsProps) => {
  const uid = safeId(useId());
  const redOpacity = red ?? (stencil && !flood ? 0 : 1);
  const center = flood?.center ?? rScreen(placement);
  const feather = flood?.feather ?? 48;
  const floodOn = flood !== undefined;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, pointerEvents: "none", ...style }}>
      {stencil
        ? only.map((id) => {
            const st = shards[id] ?? {};
            const op = (typeof stencil.opacity === "number" ? stencil.opacity : (stencil.opacity?.[id] ?? 1)) * (st.opacity ?? 1);
            const rect = isRect(stencil.rect) ? stencil.rect : stencil.rect[id];
            if (op <= 0 || !rect) return null;
            return (
              <div
                key={id}
                style={{ position: "absolute", left: 0, top: 0, width: W, height: H, clipPath: `path('${shardScreenPath(id, placement, st)}')`, opacity: op }}
              >
                <Img src={stencil.src} style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, maxWidth: "none" }} />
              </div>
            );
          })
        : null}
      {redOpacity > 0 && (!floodOn || flood.r > 0) ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: redOpacity }}>
          {floodOn ? (
            <defs>
              <radialGradient id={`g${uid}`} gradientUnits="userSpaceOnUse" cx={center.x} cy={center.y} r={flood.r}>
                <stop offset={Math.max(0, (flood.r - feather) / flood.r)} stopColor="#fff" />
                <stop offset={1} stopColor="#000" />
              </radialGradient>
              <mask id={`m${uid}`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <rect x={0} y={0} width={W} height={H} fill={`url(#g${uid})`} />
              </mask>
            </defs>
          ) : null}
          <g mask={floodOn ? `url(#m${uid})` : undefined} fill={color}>
            {only.map((id) => {
              const st = shards[id] ?? {};
              if ((st.opacity ?? 1) <= 0) return null;
              return <path key={id} d={SHARDS[id].d} transform={shardTransform(id, placement, st)} opacity={st.opacity} />;
            })}
          </g>
        </svg>
      ) : null}
    </div>
  );
};

/** Farthest outline point of any shard from R, in mark units (a flood reaching r = maxRDist * k + feather covers all). */
export const MAX_R_DIST = Math.max(
  ...SHARD_IDS.flatMap((id) =>
    REDUCED[id].flatMap((i) => (i.type === "Z" ? [] : i.type === "C" ? [i, { x: i.cp1x, y: i.cp1y }, { x: i.cp2x, y: i.cp2y }] : [i])).map((q) =>
      Math.hypot(q.x - R.x, q.y - R.y),
    ),
  ),
);

export type LetterState = { opacity?: number; dx?: number; dy?: number };

/** The 9 wordmark letters (ink) under the same placement as the mark. letters[j] = state of letter j (O p e n i n a r y). */
export const Wordmark = ({ placement, letters = [], color = C.ink, style }: { placement: Placement; letters?: readonly LetterState[]; color?: string; style?: CSSProperties }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", ...style }}>
    <g fill={color} style={{ fontFamily: FONT.sans, fontWeight: WORDMARK.weight, fontSize: WORDMARK.size }}>
      {LETTERS.map((L, j) => {
        const st = letters[j] ?? {};
        if ((st.opacity ?? 1) <= 0) return null;
        return (
          <text
            key={j}
            x={L.x}
            y={WORDMARK.baseline}
            opacity={st.opacity}
            transform={`translate(${placement.origin.x + (st.dx ?? 0)} ${placement.origin.y + (st.dy ?? 0)}) scale(${placement.k})`}
          >
            {L.char}
          </text>
        );
      })}
    </g>
  </svg>
);

/** Mark + wordmark, the full logo.tsx lockup at a placement (the lockup's viewBox origin = placement.origin). */
export const Lockup = ({ placement, letters, shards }: { placement: Placement; letters?: readonly LetterState[]; shards?: Partial<Record<ShardId, ShardState>> }) => (
  <>
    <MarkShards placement={placement} shards={shards} />
    <Wordmark placement={placement} letters={letters} />
  </>
);
