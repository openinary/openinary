// The 7 red shards of the Openinary mark (apps/marketing/components/logo.tsx, 103.049 mark box), their ray origin R
// recomputed from the geometry, centroids, radial unit vectors u, F0 offsets and the named placements.
// A mark point p lands on screen at  origin + k * p  (+ the shard's own offset along u).
import { parsePath, reduceInstructions } from "@remotion/paths";
import type { Pt } from "./ease";

/** End card: the lockup's vertical centre (design px). */

export type ShardId = "G" | "E" | "C" | "B" | "A" | "D" | "F";
export const SHARD_IDS: readonly ShardId[] = ["G", "E", "C", "B", "A", "D", "F"];
/** Clockwise from 3 o'clock, G last (fling and landing order). */
export const CLOCKWISE: readonly ShardId[] = ["E", "C", "B", "A", "D", "F", "G"];

export const SHARD_D: Record<ShardId, string> = {
  A: "M42.9136 103.049H39.6245C31.0807 103.049 25.9403 103.047 22.0137 102.317L44.7386 72.2227L42.9136 103.049Z",
  B: "M80.5019 102.409C76.6427 103.046 71.5864 103.049 63.4218 103.049H59.5335L57.6992 72.2139L80.5019 102.409Z",
  C: "M102.201 81.5916C102.035 82.3812 101.839 83.1237 101.601 83.8376C100.042 88.5111 97.3051 92.6215 93.7383 95.8315L68.1133 67.0957L102.201 81.5916Z",
  D: "M8.97896 95.5252C5.57455 92.3613 2.95561 88.3653 1.44514 83.8378C1.18358 83.0536 0.966405 82.2365 0.791016 81.3587L34.3251 67.1006L8.97896 95.5252Z",
  E: "M103.051 63.4222C103.051 66.3192 103.043 68.8248 103.015 71.0244L72.582 59.2686H103.051V63.4222Z",
  F: "M29.8745 59.2686L0.0274456 70.7959C0.00181909 68.6514 0 66.2192 0 63.4222L0 59.2686H29.8745Z",
  G: "M63.4224 0C74.1457 0 79.5076 0.00142637 83.8372 1.44547C92.2236 4.24338 98.8059 10.8255 101.604 19.2119C103.048 23.5415 103.049 28.9035 103.049 39.6268V51.5658H70.8692L94.079 41.6991L87.1948 37.1294L64.6757 45.8249L75.2468 31.837L67.6443 29.7557L55.9709 42.8381L55.1017 28.1043H47.3575L46.4747 42.8381L34.8103 29.7557L27.2125 31.837L37.7698 45.8206L15.2643 37.1294L8.38006 41.6991L31.5853 51.5658H0L0 39.6268C0 28.9035 0.00142637 23.5415 1.44547 19.2119C4.24338 10.8255 10.8255 4.24338 19.2119 1.44547C23.5415 0.00142637 28.9035 0 39.6268 0L63.4224 0Z",
};

export const MARK_SIZE = 103.049;

// --- geometry -------------------------------------------------------------------------------------------
const instr = Object.fromEntries(SHARD_IDS.map((id) => [id, reduceInstructions(parsePath(SHARD_D[id]))])) as Record<
  ShardId,
  ReturnType<typeof reduceInstructions>
>;

/** Vertex i of shard id = end point of its i-th reduced instruction (M/L/C). */
const V = (id: ShardId, i: number): Pt => {
  const ins = instr[id][i];
  if (ins.type === "Z") throw new Error(`vertex ${id}${i} is Z`);
  return { x: ins.x, y: ins.y };
};

/** Flattened outline (curves sampled) for centroid / bbox maths. */
const outline = (id: ShardId): Pt[] => {
  const pts: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  for (const ins of instr[id]) {
    if (ins.type === "M" || ins.type === "L") {
      cur = { x: ins.x, y: ins.y };
      pts.push(cur);
    } else if (ins.type === "C") {
      const p0 = cur;
      for (let s = 1; s <= 24; s++) {
        const t = s / 24;
        const u = 1 - t;
        pts.push({
          x: u * u * u * p0.x + 3 * u * u * t * ins.cp1x + 3 * u * t * t * ins.cp2x + t * t * t * ins.x,
          y: u * u * u * p0.y + 3 * u * u * t * ins.cp1y + 3 * u * t * t * ins.cp2y + t * t * t * ins.y,
        });
      }
      cur = { x: ins.x, y: ins.y };
    }
  }
  return pts;
};

const polyCentroid = (pts: Pt[]) => {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  return { area: Math.abs(a / 2), c: { x: cx / (3 * a), y: cy / (3 * a) } };
};

export type BBox = { x0: number; y0: number; x1: number; y1: number };
const bboxOf = (pts: Pt[]): BBox => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y)),
});

// --- ray origin R: least squares on the midlines of the 12 white gaps ----------------------------------------
// Each gap is bounded by two straight edges [inner, outer]; its midline runs through the midpoint of the two
// inner ends and the midpoint of the two outer ends. All midlines meet in one point (residual ~0).
type Edge = readonly [Pt, Pt]; // [inner end, outer end]
const e = (id: ShardId, inner: number, outer: number): Edge => [V(id, inner), V(id, outer)];
export const GAPS: readonly (readonly [Edge, Edge])[] = [
  // 5 rays notched into G (P0..P15 are G vertices 5..20)
  [e("G", 5, 6), e("G", 8, 7)],
  [e("G", 8, 9), e("G", 11, 10)],
  [e("G", 11, 12), e("G", 14, 13)],
  [e("G", 14, 15), e("G", 17, 16)],
  [e("G", 17, 18), e("G", 20, 19)],
  // horizontal bands between G and E / F
  [e("G", 5, 4), e("E", 2, 3)],
  [e("G", 20, 21), e("F", 0, 3)],
  // gaps between the lower shards
  [e("E", 2, 1), e("C", 3, 4)],
  [e("F", 0, 1), e("D", 3, 2)],
  [e("C", 3, 2), e("B", 3, 4)],
  [e("D", 3, 4), e("A", 3, 2)],
  [e("A", 3, 4), e("B", 3, 2)],
];

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const MIDLINES: readonly Edge[] = GAPS.map(([a, b]) => [mid(a[0], b[0]), mid(a[1], b[1])] as const);

/** Least-squares intersection of lines (p, q): minimises the sum of squared perpendicular distances. */
export const lsIntersect = (lines: readonly Edge[]) => {
  let a = 0,
    b = 0,
    c = 0,
    r0 = 0,
    r1 = 0;
  for (const [p, q] of lines) {
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    const nx = -(q.y - p.y) / L,
      ny = (q.x - p.x) / L;
    const d = nx * p.x + ny * p.y;
    a += nx * nx;
    b += nx * ny;
    c += ny * ny;
    r0 += nx * d;
    r1 += ny * d;
  }
  const det = a * c - b * b;
  const x = (c * r0 - b * r1) / det,
    y = (a * r1 - b * r0) / det;
  const residuals = lines.map(([p, q]) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    return Math.abs((-(q.y - p.y) / L) * (x - p.x) + ((q.x - p.x) / L) * (y - p.y));
  });
  return { x, y, residuals };
};

const solved = lsIntersect(MIDLINES);
/** Ray origin in mark units. Expected (51.22, 55.41) (FINAL.md item 12). */
export const R: Pt = { x: solved.x, y: solved.y };
export const R_RESIDUALS = solved.residuals;

export type ShardGeom = { id: ShardId; d: string; centroid: Pt; area: number; bbox: BBox; u: Pt; dist: number };

export const SHARDS: Record<ShardId, ShardGeom> = Object.fromEntries(
  SHARD_IDS.map((id) => {
    const pts = outline(id);
    const { area, c } = polyCentroid(pts);
    const dx = c.x - R.x,
      dy = c.y - R.y;
    const dist = Math.hypot(dx, dy);
    return [id, { id, d: SHARD_D[id], centroid: c, area, bbox: bboxOf(pts), u: { x: dx / dist, y: dy / dist }, dist }];
  }),
) as Record<ShardId, ShardGeom>;

// --- placements ------------------------------------------------------------------------------------------
export type Placement = { k: number; origin: Pt };

/** Placement with scale k that puts R on screen point S. */
export const placeR = (k: number, S: Pt): Placement => ({ k, origin: { x: S.x - k * R.x, y: S.y - k * R.y } });

/** Screen position of R (the "sun") for a placement. */
export const rScreen = (p: Placement): Pt => ({ x: p.origin.x + p.k * R.x, y: p.origin.y + p.k * R.y });

/** Linear blend of two placements (interpolate k and the screen position of R, so R travels straight). */
export const mixPlacement = (a: Placement, b: Placement, t: number): Placement => {
  const k = a.k + (b.k - a.k) * t;
  const ra = rScreen(a),
    rb = rScreen(b);
  return placeR(k, { x: ra.x + (rb.x - ra.x) * t, y: ra.y + (rb.y - ra.y) * t });
};

export const F0_R: Pt = { x: 960, y: 720 };

export const PLACEMENTS = {
  /** Frame 0: k 7, R at (960, 720). */
  F0: placeR(7, F0_R),
  /** S12 stencil: k 8, mark box (548, 388)-(1372, 1212) (box centre (960, 800), the rail's row). */
  stencil: { k: 8, origin: { x: 548, y: 388 } } as Placement,
  /** S13: the mark inline in the end line "Try [mark] openinary cloud" (Mona Sans 400, 150 px): 90% of the cap height, sitting
   * on the baseline (a full-cap mark reads raised next to the lowercase), equal ink gaps either side (measured on the render). */
  lockup: { k: 0.9463, origin: { x: 502.2, y: 449.6 } } as Placement,
  /** S14 pre-burst: k 4, R at (960, 720). */
  preburst: placeR(4, F0_R),
} as const;

/**
 * F0 offsets (px along each shard's u, at k 7). One uniform push (240 px) reads as a single physical burst and keeps
 * the lower fan a coherent arc under the card; G is held 12 px lower so it keeps ~30 px of air under the frame line
 * (every shard clears x 72..1848, y 72..1412; asserted in scripts/check.ts).
 */
export const F0_OFFSET: Record<ShardId, number> = { G: 228, E: 240, F: 240, C: 240, D: 240, A: 240, B: 240 };

/** Per-shard state on top of a placement. */
export type ShardState = {
  /** Per-shard placement override (k + origin); defaults to the component's placement. */
  p?: Placement;
  /** Extra offset along u in screen px. */
  d?: number;
  /** Extra free offset in screen px. */
  dx?: number;
  dy?: number;
  /** Scale about the shard's own centroid. */
  s?: number;
  opacity?: number;
};

/** SVG transform (user space = screen px) for one shard: placement, then offset, then scale about its centroid. */
export const shardTransform = (id: ShardId, placement: Placement, st: ShardState = {}) => {
  const p = st.p ?? placement;
  const g = SHARDS[id];
  const d = st.d ?? 0,
    s = st.s ?? 1;
  const ox = p.origin.x + g.u.x * d + (st.dx ?? 0);
  const oy = p.origin.y + g.u.y * d + (st.dy ?? 0);
  return s === 1
    ? `translate(${ox} ${oy}) scale(${p.k})`
    : `translate(${ox} ${oy}) scale(${p.k}) translate(${g.centroid.x} ${g.centroid.y}) scale(${s}) translate(${-g.centroid.x} ${-g.centroid.y})`;
};

/** Screen bbox of a shard under a placement + state (exact on the flattened outline). */
export const shardScreenBBox = (id: ShardId, placement: Placement, st: ShardState = {}): BBox => {
  const p = st.p ?? placement;
  const g = SHARDS[id];
  const d = st.d ?? 0,
    s = st.s ?? 1;
  const map = (q: Pt): Pt => {
    const lx = g.centroid.x + (q.x - g.centroid.x) * s,
      ly = g.centroid.y + (q.y - g.centroid.y) * s;
    return { x: p.origin.x + p.k * lx + g.u.x * d + (st.dx ?? 0), y: p.origin.y + p.k * ly + g.u.y * d + (st.dy ?? 0) };
  };
  return bboxOf(outline(id).map(map));
};

/** Screen centroid of a shard. */
export const shardScreenCentroid = (id: ShardId, placement: Placement, st: ShardState = {}): Pt => {
  const p = st.p ?? placement;
  const g = SHARDS[id];
  const d = st.d ?? 0;
  return { x: p.origin.x + p.k * g.centroid.x + g.u.x * d + (st.dx ?? 0), y: p.origin.y + p.k * g.centroid.y + g.u.y * d + (st.dy ?? 0) };
};

/** Screen box of the whole (unexploded) mark for a placement, optionally padded (S14 selection uses pad 16). */
export const markBox = (p: Placement, pad = 0) => ({
  x: p.origin.x - pad,
  y: p.origin.y - pad,
  w: p.k * MARK_SIZE + 2 * pad,
  h: p.k * MARK_SIZE + 2 * pad,
});

/** The F0 state of every shard (offset only). */
export const F0_STATE: Record<ShardId, ShardState> = Object.fromEntries(SHARD_IDS.map((id) => [id, { d: F0_OFFSET[id] }])) as Record<
  ShardId,
  ShardState
>;
