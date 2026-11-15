// Scene C rail geometry: pure functions of the ABSOLUTE film frame (no React). Scene D imports this READ-ONLY to
// take the cards over at HANDOFF.CD (f837): cardRect / railCards stay valid for every frame up to 1079.
//
// Rail = cards 900 px apart (centre pitch), vertical centre y 800. World x of card Vi centre = 960 + 900 (i - 1),
// so V1 is the centre card at offset 0. Screen x = world x + railOffset(frame).
//
// railOffset = land + drift + pan:
//  - land   (T.S10.land, LAND): V1 centre 2360 -> 960. LAND ends at 7.5 px/f; the rail then glides into its drift
//            with an exponential tail (tau 4 f) instead of stopping dead on f630. Velocity is continuous on f630.
//  - drift  (FINAL 2.3): -1 px/f, every frame, holds and pans alike (a whole px per frame: the snapped cards step on a
//            regular cadence). V1 sits on x 960 at f682 (start of the hold), V2 on x 960 at f800 (middle of the video
//            read): the pan absorbs the difference with its own easing, which starts and ends at zero velocity.
//  - pan    (T.S11.pan, RAIL with a zero-velocity start): -900, V2 to the centre.
import { Easing } from "remotion";
import type { Camera, Rect } from "../../lib/camera";
import { rulerCam } from "../B/model";
import { E, lerp, prog } from "../../lib/ease";
import { MEDIA, type Media } from "../../lib/media";
import { RAIL, VIDEO } from "../../lib/variants";
import { FPS, rt, T } from "../../timeline";

export type RailCardId = "V0" | "V1" | "V2" | "V3";

export type RailCardSpec = {
  id: RailCardId;
  /** Transformation params the card is the output of (V1 changes f_webp -> f_avif, see v1Params). */
  params: string;
  /** Display size (px) and world centre x. */
  w: number;
  h: number;
  worldX: number;
  radius: number | "max";
  /** Image source (cover, centre) or the video. */
  media: Media;
  video: boolean;
};

const PITCH = T.S10.railPitch; // 900
export const RAIL_Y = T.S10.railY; // 800
const worldX = (i: number) => 960 + PITCH * (i - 1);

export const CARDS: Record<RailCardId, RailCardSpec> = {
  // the circle from the wall (continuity), cropped by the left frame edge at rest
  V0: { id: "V0", params: RAIL.V0, w: 600, h: 600, worldX: worldX(0), radius: "max", media: MEDIA.hills1000, video: false },
  // w_1500 output (1500 x 1125) shown at 800 x 600
  V1: { id: "V1", params: RAIL.V1[0], w: 800, h: 600, worldX: worldX(1), radius: 0, media: MEDIA.hills1000, video: false },
  // blossom.mp4 (1280 x 720) shown at 800 x 450
  V2: { id: "V2", params: RAIL.V2, w: 800, h: 450, worldX: worldX(2), radius: 0, media: MEDIA.blossomPoster, video: true },
  // ar_16:9,c_fill,w_800 (800 x 450) at 1:1, the right neighbour after the pan (scene D flies it into shard E)
  V3: { id: "V3", params: RAIL.V3, w: 800, h: 450, worldX: worldX(3), radius: 0, media: MEDIA.hills1000, video: false },
};
export const CARD_IDS: readonly RailCardId[] = ["V0", "V1", "V2", "V3"];

/** V1's params and badge at `frame` (hard swap at the flip start, T.S10.flip). */
export const v1Format = (frame: number) => {
  const i = frame >= T.S10.flip[0] ? 1 : 0;
  return { params: RAIL.V1[i], badge: RAIL.V1_BADGE[i] };
};

// --- offset ------------------------------------------------------------------------------------------------
const LAND_FROM = 2360; // V1 centre x on the first land frame
const TAU = 4; // tail time constant (f)
const HOLD_REF = [rt(682), rt(800)] as const; // frames where V1 / V2 sit exactly on x 960 (drift zero)

/**
 * Eased progress over [a, b] whose end velocity (ease slope `endSlope` at t = 1) decays exponentially (tau) instead of
 * stopping dead on b: C1 everywhere, 1 - q at b, then -> 1. LAND ends at 7.5 px/f and RAIL at 3.8 px/f, both far above
 * the 1 px/f drift, so a hard stop would read as a bump.
 */
const tailed = (f: number, [a, b]: readonly [number, number], ease: (t: number) => number, endSlope: number) => {
  const k = endSlope / (b - a);
  const q = (TAU * k) / (1 + TAU * k);
  return f <= b ? (1 - q) * prog(f, [a, b], ease) : 1 - q * Math.exp(-(f - b) / TAU);
};
const LAND_END = (1 - 0.83) / (1 - 0.21); // slope of LAND (0.24, 0.9, 0.21, 0.83) at t = 1
/** E.RAIL with y1 0 (was 0.05): the pan leaves the drift with zero added velocity (no speed step on f721). */
const PAN_EASE = Easing.bezier(0.8, 0, 0.25, 0.9);
const RAIL_END = (1 - 0.9) / (1 - 0.25); // slope of PAN_EASE at t = 1

const panP = (f: number) => tailed(f, T.S11.pan, PAN_EASE, RAIL_END);
const drift = (f: number) => T.S10.railDrift * (f - lerp(HOLD_REF[0], HOLD_REF[1], panP(f)));
const LAND_A = LAND_FROM - 960 - drift(T.S10.land[0]);
const land = (f: number) => LAND_A * (1 - tailed(f, T.S10.land, E.LAND, LAND_END));

/** Screen x offset of the rail at `frame` (V1 centre x = 960 + offset). */
export const railOffset = (frame: number) => land(frame) + drift(frame) - PITCH * panP(frame);

/** Screen centre x of a card. */
export const cardX = (id: RailCardId, frame: number) => CARDS[id].worldX + railOffset(frame);

/**
 * Screen rect of a card at `frame`. x is snapped to whole px (Chrome snaps boxes anyway; snapping here keeps the
 * cards and the UI riding under them in lockstep during the drift, and text on the pixel grid).
 */
export const cardRect = (id: RailCardId, frame: number): Rect => {
  const c = CARDS[id];
  return { x: Math.round(cardX(id, frame) - c.w / 2), y: RAIL_Y - c.h / 2, w: c.w, h: c.h };
};

/** Opacity of V0 (the r_max circle): a quick SITE fade f596..f602 while the rail is still a blur, so it never reads
 *  as an empty pale disc on the moving rail. */
const V0_FADE = [T.S9.columnOut[0] - 1, T.S9.columnOut[0] + 5] as const;
export const v0Opacity = (frame: number) => prog(frame, V0_FADE, E.SITE);

/** White veil on the video card's neighbours in bar 7 (as V2 is veiled next to V1 in bar 6): V1 and V3 fade it in
 *  over the pan and drop it over the 8 f before their flight into the mark (V3 = E, V1 = F). */
export const NEIGHBOUR_VEIL = 0.45;
export const neighbourVeil = (id: RailCardId, frame: number) => {
  if (id !== "V1" && id !== "V3") return 0;
  const fly = T.S12.flights[id === "V3" ? "E" : "F"][0];
  return NEIGHBOUR_VEIL * prog(frame, T.S11.pan) * (1 - prog(frame, [fly - 8, fly]));
};

/**
 * Card UI (label chip, plain labels, meter, trim bar) belongs to the centre card: it is visible near x 960 and gone
 * away from it, so it swaps on the land and on the pan's peak-velocity frames. 1 within 150 px of centre, 0 past 450.
 */
export const centreness = (screenX: number) => {
  const d = Math.abs(screenX - 960);
  const t = Math.min(1, Math.max(0, (d - 150) / 300));
  return 1 - t * t * (3 - 2 * t);
};

export type RailCardFrame = RailCardSpec & { rect: Rect; opacity: number };

/** Every rail card with its screen rect and opacity at `frame` (scene D: take these over at HANDOFF.CD). */
export const railCards = (frame: number): RailCardFrame[] =>
  CARD_IDS.map((id) => ({
    ...CARDS[id],
    params: id === "V1" ? v1Format(frame).params : CARDS[id].params,
    rect: cardRect(id, frame),
    opacity: id === "V0" ? v0Opacity(frame) : 1,
  }));

// --- video ---------------------------------------------------------------------------------------------------
/** blossom.mp4 source time (s) shown at `frame`: frozen on so_2 (2.0 s) until the resolve, then 1x. */
export const videoTimeAt = (frame: number) => T.S11.videoFrom + Math.max(0, frame - T.S11.resolve) / FPS;
/** Kept segment of the 14.08 s source, as track fractions. */
export const TRIM = { from: VIDEO.so / VIDEO.duration, to: VIDEO.eo / VIDEO.duration } as const;

// --- camera (ruler parallax) ------------------------------------------------------------------------------------
/**
 * The rail pan is a camera pan (rulers slide at 20% of it). Scene C drives the rulers from the whip peak (before that
 * scene B does). To be seamless there it starts from B's own ruler camera on the whip peak (position AND last step, read
 * from scene B, so a retimed whip never breaks the hand-off) and then moves by exactly the rail's own screen motion; the
 * whip's surplus speed decays over ~3 f. The zoom stays B's (0.42) so the tick density never jumps.
 */
export const railCamera = (frame: number): Camera | null => {
  const f0 = T.S9.whipPeak;
  if (frame < f0) return null;
  const b = rulerCam(f0);
  const vWhip = rulerCam(f0 - 1).tx - b.tx;
  const vRail = railOffset(f0) - railOffset(f0 + 1);
  const surplus = (vWhip - vRail) * 3 * (1 - Math.exp(-(frame - f0) / 3));
  return { zoom: b.zoom, tx: b.tx + railOffset(frame) - railOffset(f0) - surplus, ty: b.ty };
};
