// Scene D geometry: pure functions of the absolute frame (no React). S12 flights and morph, S13/S14 mark placement,
// group zoom, cursor, selection. SceneD.tsx and the renderers in this folder read everything from here.
import { Easing } from "remotion";
import { parsePath, reduceInstructions } from "@remotion/paths";
import type { Camera, Rect } from "../../lib/camera";
import { cameraFromAnchor } from "../../lib/camera";
import { E, lerp, prog, quad, type Pt } from "../../lib/ease";
import { MEDIA, type Media } from "../../lib/media";
import { PLACEMENTS, R, SHARDS, SHARD_IDS, markBox, rScreen, shardScreenBBox, type Placement, type ShardId } from "../../lib/shards";
import { MAX_R_DIST } from "../../components/Mark";
import { coverRect, containRect } from "../../components/Photo";
import { CTA, outputOf, STENCIL_SOURCES } from "../../lib/variants";
import { CURSOR_HEIGHT, press, type CursorState } from "../../components/Cursor";
import { HANDOFF, T } from "../../timeline";
import { CARDS, cardRect, railCamera } from "../C/railLayout";

const S12 = T.S12;
const S13 = T.S13;
const S14 = T.S14;

// ---------------------------------------------------------------------------------------------------------
// S12 stencil
// ---------------------------------------------------------------------------------------------------------
export const STENCIL = PLACEMENTS.stencil;
export const STENCIL_R = rScreen(STENCIL);
export const STENCIL_MEDIA = MEDIA.hills2400;
/** The one photo covering the mark box (concept A S12: (410.67, 388, 1098.67 x 824)). Screen px. */
export const STENCIL_RECT: Rect = (() => {
  const b = markBox(STENCIL);
  const r = coverRect(STENCIL_MEDIA, { w: b.w, h: b.h });
  return { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
})();

/** Flood end radius: the spec's 520 leaves G's top corners uncovered at k 8, so the disc ends where it covers every
 *  outline point of the mark with the whole 48 px feather inside (MAX_R_DIST * 8 + 48 = 572.6, + 2 px margin). */
export const FLOOD_R_END = Math.ceil(MAX_R_DIST * STENCIL.k + S12.floodFeather) + 2;

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
/** Radius (mark units) of the empty hub around R: the nearest shard outline point (G's two central ray tips). */
const HUB_UNITS = Math.min(
  ...SHARD_IDS.flatMap((id) => {
    let cur: Pt = { x: 0, y: 0 };
    return reduceInstructions(parsePath(SHARDS[id].d)).flatMap((i) => {
      if (i.type === "Z") return [];
      const a = cur;
      cur = { x: i.x, y: i.y };
      if (i.type === "M") return [];
      if (i.type === "L") return [segDist(R, a, cur)];
      return Array.from({ length: 24 }, (_, s) => {
        const t = (s + 1) / 24,
          u = 1 - t;
        return Math.hypot(u * u * u * a.x + 3 * u * u * t * i.cp1x + 3 * u * t * t * i.cp2x + t * t * t * i.x - R.x, u * u * u * a.y + 3 * u * u * t * i.cp1y + 3 * u * t * t * i.cp2y + t * t * t * i.y - R.y);
      });
    });
  }),
);
/** The hub's radius in screen px at the stencil placement (about 107). */
export const HUB_R = HUB_UNITS * STENCIL.k;
/** Flood disc outer edge: starts at the hub's rim, so the red touches the shards from its second frame. */
export const floodR = (f: number) => HUB_R + (FLOOD_R_END - HUB_R) * prog(f, S12.flood, E.FLOOD);

/** Stencil group drift (after the top shard): zoom 1 -> 0.985 about R, linear, so the hold before the CARD move breathes. */
export const stencilZ = (f: number) => lerp(S12.driftZ[0], S12.driftZ[1], prog(f, S12.drift));

export type FlyId = Exclude<ShardId, "G">;
export const FLY_IDS: readonly FlyId[] = ["E", "C", "B", "A", "D", "F"]; // landing order (clockwise from 3 o'clock)

export const landingOf = (id: FlyId) => S12.flights[id][1];

const scaleRect = (r: Rect, s: number, c: Pt): Rect => ({ x: c.x + (r.x - c.x) * s, y: c.y + (r.y - c.y) * s, w: r.w * s, h: r.h * s });
const bboxRect = (id: ShardId): Rect => {
  const b = shardScreenBBox(id, STENCIL);
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
};
/** Shard centroid on screen at the stencil placement. */
export const centroidOf = (id: ShardId): Pt => ({ x: STENCIL.origin.x + STENCIL.k * SHARDS[id].centroid.x, y: STENCIL.origin.y + STENCIL.k * SHARDS[id].centroid.y });
/** Shard bbox scaled by s about its centroid (s = the seat scale). */
export const shardRect = (id: ShardId, s = 1) => scaleRect(bboxRect(id), s, centroidOf(id));

/** Seat: every wedge lands 2% large and settles to 1 over T.S12.seat frames (linear). */
export const SEAT_S = 1.02;
export const seatScale = (id: FlyId, f: number) => lerp(SEAT_S, 1, prog(f, [landingOf(id), landingOf(id) + S12.seat]));

/** Overflow ghost after a landing (bbox minus the polygon, drawn under the opaque shard): 35% -> 0 (SITE). No drift:
 *  a drifting copy peeks out past the edges a wedge shares with its bbox and reads as a double edge. */
export const GHOST_OPACITY = 0.15;
export const ghostAt = (landing: number, f: number) =>
  f < landing || f >= landing + S12.cropAfterLanding ? null : GHOST_OPACITY * (1 - prog(f, [landing, landing + S12.cropAfterLanding], E.SITE));

/** rail: the source is a rail card (E from V3, F from V1), taller than the shard row and level with G. */
export type FlightSource = { rect: Rect; media: Media; radius: "max" | 0; pad: boolean; rail: boolean };

/** Display scale of the cards that enter from off-screen (C B A D): 0.8 of their output px. */
const OFFSCREEN_CARD_SCALE = 0.8;
const OFFSCREEN_DIST = 1400;

const sourceOf = (id: FlyId): FlightSource => {
  const [f0] = S12.flights[id];
  if (id === "E") return { rect: cardRect("V3", f0), media: CARDS.V3.media, radius: 0, pad: false, rail: true };
  if (id === "F") return { rect: cardRect("V1", f0), media: CARDS.V1.media, radius: 0, pad: false, rail: true };
  const o = outputOf(STENCIL_SOURCES[id]);
  const w = o.w * OFFSCREEN_CARD_SCALE,
    h = o.h * OFFSCREEN_CARD_SCALE;
  const u = SHARDS[id].u;
  const c = { x: STENCIL_R.x + OFFSCREEN_DIST * u.x, y: STENCIL_R.y + OFFSCREEN_DIST * u.y };
  return { rect: { x: c.x - w / 2, y: c.y - h / 2, w, h }, media: STENCIL_MEDIA, radius: o.radius === "max" ? "max" : 0, pad: o.pad, rail: false };
};
export const FLIGHT_SOURCES = Object.fromEntries(FLY_IDS.map((id) => [id, sourceOf(id)])) as Record<FlyId, FlightSource>;

export type FlightFrame = {
  /** Card rect (screen). */
  rect: Rect;
  /** Image rect (screen): own cover / contain crop -> the global stencil alignment. */
  img: Rect;
  radius: number;
  /** 0 = flat (shard), 1 = full card chrome (white pad fill, hairline, card shadow). */
  chrome: number;
  media: Media;
  pad: boolean;
};

const mixRect = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const offset = (r: Rect, box: Rect): Rect => ({ x: box.x + r.x, y: box.y + r.y, w: r.w, h: r.h });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Grow `img` about its centre (aspect kept) until it covers `box`, then slide it inside so no edge of the box shows
 *  through. A no-op when it already covers (both flight endpoints do), so mid-flight cards never show an empty box. */
const coverFix = (img: Rect, box: Rect): Rect => {
  const s = Math.max(1, box.w / img.w, box.h / img.h);
  const w = img.w * s,
    h = img.h * s;
  const cx = img.x + img.w / 2,
    cy = img.y + img.h / 2;
  return { x: clamp(cx - w / 2, box.x + box.w - w, box.x), y: clamp(cy - h / 2, box.y + box.h - h, box.y), w, h };
};

/** A card in flight (frames [f0, landing - 1]); null outside. Lands on the seat rect (bbox x 1.02 about the centroid). */
export const flightAt = (id: FlyId, f: number): FlightFrame | null => {
  const [f0, f1] = S12.flights[id];
  if (f < f0 || f >= f1) return null;
  const src = FLIGHT_SOURCES[id];
  const p = prog(f, [f0, f1], E.FLY);
  // a rail card's top edge drops to the shard row ahead of its sideways travel (and its height with it), so it never
  // crosses the G photo rectangle waiting above the row (F from V1 would clip its bottom-left corner on f878..f880)
  const py = src.rail ? 1 - (1 - p) ** 3 : p;
  const seat = shardRect(id, SEAT_S);
  const r = mixRect(src.rect, seat, p);
  const rect = { x: r.x, w: r.w, y: lerp(src.rect.y, seat.y, py), h: lerp(src.rect.h, seat.h, py) };
  const own = offset((src.pad ? containRect : coverRect)(src.media, { w: rect.w, h: rect.h }), rect);
  const img = mixRect(own, STENCIL_RECT, p);
  return {
    rect,
    // c_pad starts contained on white (the pad fades with the chrome), so it only grows into cover as it lands
    img: src.pad ? mixRect(img, coverFix(img, rect), p) : coverFix(img, rect),
    radius: src.radius === "max" ? (1 - p) * Math.min(rect.w, rect.h) / 2 : 0,
    chrome: 1 - p,
    media: src.media,
    pad: src.pad,
  };
};

/** G: the centre video card morphs into G's bbox (FLY, so it clears the lower shards before E lands), waits there as
 *  a clean photo rectangle, then rounds into G (gCrop); null before the morph and after the landing. */
export const G_RECT = shardRect("G");
const MORPH_EASE = E.FLY;
export const morphAt = (f: number) => {
  if (f < S12.morph[0] || f >= S12.topShard) return null;
  const p = prog(f, S12.morph, MORPH_EASE);
  return { rect: mixRect(cardRect("V2", S12.morph[0]), G_RECT, p), p, stencil: prog(f, S12.videoToStencil) };
};

// G crop (gCrop): the photo rectangle on G's bbox becomes the G shard. The dome's two corner curves grow from the bbox
// corners (every corner point scaled by p toward its corner), and the ray notches fade out of the photo, so p = 1 is
// exactly G's outline and hands over to MarkShards with the same pixels.
const G_INSTR = reduceInstructions(parsePath(SHARDS.G.d));
const G_W = SHARDS.G.bbox.x1;
const G_H = SHARDS.G.bbox.y1;
/** A dome point: a corner curve point or a straight top / side edge end that meets one (never a notch or bottom vertex). */
const isDome = (q: Pt, curve: boolean) => curve || q.y === 0 || ((q.x === 0 || q.x === G_W) && q.y < G_H);
const toScreen = (q: Pt) => `${(STENCIL.origin.x + STENCIL.k * q.x).toFixed(3)} ${(STENCIL.origin.y + STENCIL.k * q.y).toFixed(3)}`;
/** G outline (screen px) with the dome corners at p (0 = square bbox corners, 1 = the real dome). */
export const gCropPath = (p: number) => {
  const m = (x: number, y: number, curve: boolean) => {
    if (!isDome({ x, y }, curve)) return toScreen({ x, y });
    const cx = x > G_W / 2 ? G_W : 0; // corner (cx, 0)
    return toScreen({ x: cx + p * (x - cx), y: p * y });
  };
  return G_INSTR.map((i) =>
    i.type === "Z" ? "Z" : i.type === "C" ? `C${m(i.cp1x, i.cp1y, true)} ${m(i.cp2x, i.cp2y, true)} ${m(i.x, i.y, true)}` : `${i.type}${m(i.x, i.y, false)}`,
  ).join("");
};
/** The five ray notches cut into G's bottom edge, closed along the bbox bottom (screen px). */
export const G_NOTCH_PATH = (() => {
  const pts = G_INSTR.flatMap((i) => (i.type === "L" && i.x > 0 && i.x < G_W && i.y > 0 ? [{ x: i.x, y: i.y }] : []));
  return `M${pts.map(toScreen).join("L")}Z`;
})();
/** G crop progress (SITE) over gCrop. */
export const gCropAt = (f: number) => prog(f, S12.gCrop, E.SITE);

// ---------------------------------------------------------------------------------------------------------
// S13 / S14 mark placement, group zoom, camera
// ---------------------------------------------------------------------------------------------------------
/** Scale a placement about screen point A. */
export const zoomPlacement = (p: Placement, z: number, A: Pt): Placement => ({ k: p.k * z, origin: { x: A.x + z * (p.origin.x - A.x), y: A.y + z * (p.origin.y - A.y) } });

/**
 * a -> b as one camera move: log-interpolated scale about the similarity's fixed point, so every point of the mark
 * travels on a straight line toward that point at a constant perceived zoom speed.
 */
export const zoomBetween = (a: Placement, b: Placement, t: number): Placement => {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const r = b.k / a.k;
  const X = { x: (b.origin.x - r * a.origin.x) / (1 - r), y: (b.origin.y - r * a.origin.y) / (1 - r) };
  return zoomPlacement(a, Math.pow(r, t), X);
};

/** Lockup + CTA group zoom (FINAL 2.3): 1 -> 1.02 about (960, 742), linear, held after. */
export const groupZ = (f: number) => lerp(S13.zoomZ[0], S13.zoomZ[1], prog(f, S13.zoom));
export const lockupAt = (f: number) => zoomPlacement(PLACEMENTS.lockup, groupZ(f), S13.zoomAnchor);

/** Stencil placement with the group drift applied (R is the fixed point). */
export const stencilPlacementAt = (f: number) => zoomPlacement(STENCIL, stencilZ(f), STENCIL_R);
/** The stencil photo rect under the drift (scaled about R with the shards it fills). */
export const stencilRectAt = (f: number): Rect => scaleRect(STENCIL_RECT, stencilZ(f), STENCIL_R);

/** toLockup ease: E.CARD with a 4x gentler start (y1 0.4 -> 0.1), so the move leaves the drift at about 7 px/f. */
const TO_LOCKUP = Easing.bezier(0.65, 0.1, 0.1, 0.96);

/** Screen placement of the red mark from the flood to the burst (null outside [toLockup, burst)). */
export const markPlacementAt = (f: number): Placement => {
  if (f < S13.toLockup[1]) return zoomBetween(stencilPlacementAt(S13.toLockup[0]), PLACEMENTS.lockup, prog(f, S13.toLockup, TO_LOCKUP));
  if (f < S14.recentre[0]) return lockupAt(f);
  return zoomBetween(lockupAt(S14.recentre[0]), PLACEMENTS.preburst, prog(f, S14.recentre, E.INOUT));
};

/**
 * Scene camera for the ruler parallax. S12: scene C's rail camera (a pan, tx about -925 at f837) continues until the
 * video card starts its morph, then settles to identity (MORPH ease, zero start velocity) from the morph start to the
 * top shard (the frame re-centres on the mark): the rulers ease out instead of jumping with the card's fast FLY start. S13: the group zoom; S14: back to identity with the recentre (INOUT).
 */
export const cameraAtD = (f: number): Camera | null => {
  if (f < HANDOFF.CD) return null;
  if (f < S12.morph[0]) return railCamera(f);
  if (f <= S12.topShard) {
    const c = railCamera(S12.morph[0])!;
    const k = 1 - prog(f, [S12.morph[0], S12.topShard], E.MORPH);
    return { zoom: 1 + (c.zoom - 1) * k, tx: c.tx * k, ty: c.ty * k };
  }
  if (f < S13.zoom[0] || f > S14.recentre[1]) return null;
  const z = f < S14.recentre[0] ? groupZ(f) : lerp(S13.zoomZ[1], 1, prog(f, S14.recentre, E.INOUT));
  return cameraFromAnchor(S13.zoomAnchor, S13.zoomAnchor, z);
};

// ---------------------------------------------------------------------------------------------------------
// S13 CTA pill + cursor
// ---------------------------------------------------------------------------------------------------------
/** Geist Mono advance is exactly 0.6 em (600/1000 units, every weight): the CTA text width needs no measuring. */
export const CTA_TEXT_W = CTA.url.length * 0.6 * S13.cta.font;
export const CTA_BOX = (textW = CTA_TEXT_W) => {
  const c = S13.cta;
  const w = c.padX + textW + c.gap + c.icon + c.padX;
  return { x: c.cx - w / 2, y: c.cy - c.h / 2, w, h: c.h };
};

export const cursorPos = (f: number): Pt =>
  f < S14.cursorOut[0]
    ? quad(prog(f, S13.cursorIn, E.CURSOR), S13.cursorFrom, S13.cursorCtrl, S13.cursorTo)
    : { x: lerp(S13.cursorTo.x, S14.cursorOutTo.x, prog(f, S14.cursorOut, E.EXITIN)), y: lerp(S13.cursorTo.y, S14.cursorOutTo.y, prog(f, S14.cursorOut, E.EXITIN)) };

export const ctaPress = (f: number) => press(f, S13.press, { release: S13.release, targetMin: 0.97 });

export const cursorAtD = (f: number): CursorState | null => {
  if (f < S13.cursorIn[0] || f > S14.cursorOut[1]) return null;
  const p = cursorPos(f);
  // fully off frame (the arrow hangs down-right of its tip): nothing to draw
  if (p.x > 1920 || p.y > 1484 + CURSOR_HEIGHT) return null;
  return { x: p.x, y: p.y, scale: ctaPress(f).cursor };
};

// ---------------------------------------------------------------------------------------------------------
// S14 selection
// ---------------------------------------------------------------------------------------------------------
/** Selection rect (screen) around the mark, or null. Drawn on over three frames, gone on the blink and after. */
export const selectionRectAt = (f: number): Rect | null =>
  f >= S14.selLeft && f < S14.blink ? markBox(markPlacementAt(Math.min(f, S14.recentre[1])), S14.selectionPad) : null;

export const selectionEdgesAt = (f: number) => ({
  left: f >= S14.selLeft,
  top: f >= S14.selTop,
  rightBottom: f >= S14.selRightBottom,
});

