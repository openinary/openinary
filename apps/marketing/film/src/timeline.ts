// THE single source of truth for time. Every picture event and every sound cue reads its frame from here
// (scripts/export-cues.ts builds public/cues.json from this file). Frames are ABSOLUTE film frames 0..1079.
// Spec: analysis/FINAL.md (binding delta) over analysis/concept_A.md. Ranges are [from, to] inclusive-ish
// animation windows: a tween over [a, b] is at its start value on frame a and at its end value on frame b.

// v5 (2026-11-12): the same 60-frames-per-beat design, played at 48 fps (96 BPM), 20% slower than v4.
export const FPS = 48;
export const BPM = 96;
export const BEAT = 30;
export const BAR = 120;
export const EIGHTH = 15;
export const SIXTEENTH = 7.5;
export const W = 1920;
export const H = 1484;
/** Artboard frame line (1 px #E8E8E8, inset 72): x 72..1848, y 72..1412. */
export const FRAME_LINE = { x0: 72, y0: 72, x1: 1848, y1: 1412 } as const;
export const SAMPLE_RATE = 48000;
export const SAMPLES_PER_FRAME = 1000;

/**
 * v5 retime (2026-11-12). The choreography below is written in the v2 design frames (T0, a 1080-frame film); the
 * exported constants go through rt(), a piecewise-linear map onto a 15-bar, 1800-frame film. Inside a segment every
 * motion keeps its shape (slope = how much slower it plays); at a jump (two knots with the same old frame) new time
 * opens BETWEEN two events while anything that spans the jump (camera drifts, creeps, a playing video) simply runs
 * longer. The film never stops: a jump only goes where something is still moving. New beats (the cache beat) live in
 * the time a jump opens.
 */
const KNOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [52, 66], // the burst, a touch slower
  [105, 150], // cursor, window rise, drag: the drop lands on bar 2 beat 1
  [138, 205], // press, upload, success
  [138, 245], // jump: the success box reads, the veil still on
  [164, 275], // dialog out, the tile slides in, cursor to it
  [208, 330], // the dive
  [256.5, 400], // pill, typing, the w_600 slam (jumps sit half a frame after an event, never on one)
  [256.5, 445], // jump: width reads (the S6 drift spans it)
  [299.5, 505], // h_600 typing + crop
  [299.5, 560], // jump: height reads
  [335, 608], // r_max typing + rounding
  [335, 650], // jump: round reads, the slot word turns to "change the file"
  [360, 690],
  [479.5, 840], // the variant reel
  [479.5, 960], // jump: the cache beat (bar 8)
  [600, 1080], // every size
  [640.5, 1120], // every format lands, the first count
  [640.5, 1170], // jump: webp reads
  [672, 1202], // the avif flip, 98% smaller types
  [672, 1272], // jump: 98% reads
  [720, 1320],
  [800, 1400], // pan, processing, the video starts
  [800, 1450], // jump: the video plays (it runs in real time through the jump)
  [1000, 1650], // flights, stencil, lockup, CTA formed (slope 1: the flights are tuned to the frame)
  [1000, 1721], // jump: the end card reads (its slow zoom spans it)
  [1079, 1800],
];
export const FRAMES = 1800;
/** Old (v2 design) frame -> film frame. At a jump, a frame exactly on it maps after the jump. */
export const rt = (f: number): number => {
  if (f <= 0) return f;
  if (f >= 1079) return f - 1079 + 1800;
  let i = KNOTS.length - 2;
  while (i > 0 && KNOTS[i][0] > f) i--;
  while (i < KNOTS.length - 2 && KNOTS[i + 1][0] === KNOTS[i][0]) i++; // on a jump: take the later knot
  const [a0, a1] = KNOTS[i];
  const [b0, b1] = KNOTS[i + 1];
  return b0 === a0 ? b1 : a1 + ((f - a0) * (b1 - a1)) / (b0 - a0);
};
/** Keys that hold frames' neighbours but are not frames (px, zooms, indices, relative durations). */
const NOT_FRAMES = new Set([
  "inhalePx", "stagger", "dur", "dist", "scale", "liftScale", "liftRotate", "riseFrom", "radius", "order", "labelGap",
  "railPitch", "railDrift", "railY", "spinPeriod", "videoFrom", "seat", "cropAfterLanding", "floodR", "floodFeather",
  "letterOffsets", "letterSlide", "letterDx", "subBaseline", "retractStagger", "retractFade", "retractDx", "cardScale0",
  "selectionPad", "gridStagger", "del", "k", "size", "baseline", "x", "y", "w", "h", "cx", "cy", "h0",
  "pill", "cta", "window", "dialog", "labelIn", "cardFrom", "cardTo",
]);
const remap = <O>(o: O, key = ""): O => {
  if (NOT_FRAMES.has(key) || /Z$/.test(key)) return o;
  if (typeof o === "number") return rt(o) as O;
  if (typeof o === "function") return o;
  if (Array.isArray(o)) return o.map((x) => remap(x)) as O;
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, remap(v, k)])) as O;
  return o;
};

/** public/score.wav (audio/score.py, rendered from public/cues.json) is in sync with this timeline. */
export const AUDIO_READY = true;

/** First frame of bar n (1-based): bar(1) = 0, bar(9) = 960. */
export const bar = (n: number) => (n - 1) * BAR;
/** Beat b (1-based) of bar n: beat(3, 1) = 240. */
export const beat = (n: number, b: number) => bar(n) + (b - 1) * BEAT;
/** 16th step i (0-based, may be fractional in frames) of bar n: step16(3, 6) = 285. */
export const step16 = (n: number, i: number) => bar(n) + i * SIXTEENTH;

type R = readonly [number, number];
type P = { readonly x: number; readonly y: number };

/** Scene activity windows. Scenes return null outside their window. */
const SCENES0 = {
  A: { from: 0, to: 210 },
  B: { from: 196, to: 630 },
  C: { from: 588, to: 860 },
  D: { from: 834, to: 1079 },
} as const;

/** Frames where two scenes must be pixel-continuous. */
const HANDOFF0 = { AB: 208, BC: [590, 600] as R, CD: 837, SEAM: [1076, 1079] as R } as const;

// ---------------------------------------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------------------------------------
export type ShardId = "G" | "E" | "C" | "B" | "A" | "D" | "F";

const T0 = {
  S1: {
    hold: [0, 7] as R,
    inhale: [8, 18] as R, // each shard d_i -> d_i - 12 px along u, SITE
    inhalePx: 12,
    fling: {
      start: 18,
      order: ["E", "C", "B", "A", "D", "F", "G"] as readonly ShardId[], // 1 f stagger clockwise
      stagger: 1,
      dur: 32, // EXITIN
      dist: 1100, // extra px along u
      scale: 1.3, // about the shard centroid
    },
    flingStartOf: (id: ShardId) => rt(18 + ["E", "C", "B", "A", "D", "F", "G"].indexOf(id)),
    goneBy: 52,
  },

  S2: {
    cursorIn: [14, 40] as R, // CURSOR ease, quadratic path
    cursorFrom: { x: 1990, y: 1580 } as P,
    cursorCtrl: { x: 1400, y: 1300 } as P,
    cursorTo: { x: 1100, y: 760 } as P,
    grabPress: [41, 45] as R, // press grammar, P = 45, held to the drop
    grab: 45,
    lift: [45, 55] as R, // card scale 1 -> 1.035, rotate 0 -> -2.5 deg, shadow card -> lifted, SITE
    liftScale: 1.035,
    liftRotate: -2.5,
    rise: [50, 100] as R, // window (with dialog) translateY +1200 -> 0, RISE
    riseFrom: 1200,
    risePeak: 61,
    drag: [60, 102] as R, // card centre + size, DRAG
    dragFrom: { x: 960, y: 720 } as P,
    dragTo: { x: 960, y: 842 } as P, // dropzone centre
    cardFrom: { w: 480, h: 360 },
    cardTo: { w: 300, h: 225 },
    chipFade: [60, 72] as R,
    cursorTipOffset: { x: 140, y: 40 } as P, // scaled with the card while dragging
    hover: 88, // dropzone hover state, hard
    drop: 105,
    window: { x: 129, y: 548, w: 1663, h: 1228, radius: 24 },
    drift: [105, 160] as R, // dashboard push 1 -> 1.35 about the dialog centre (960, 900), bezier(0.4, 0.2, 0.1, 1)
    driftZ: [1, 1.35] as R,
    dialog: { w: 776.07, h: 561.26, radius: 20.79, centre: { x: 960, y: 891.66 } as P, local: { x: 831.5, y: 343.66 } as P }, // v5 UploadSection: 672 x 486 CSS px, dropzone centre on (960, 842)
  },

  S3: {
    release: [105, 111] as R, // cursor 0.86 -> 1, SITE
    hoverOff: [105, 110] as R,
    rowIn: [105, 113] as R, // file row y +10 -> 0, opacity 0 -> 1, SITE
    flip: [105, 119] as R, // card -> 56x56 row thumbnail, FLIP spring
    rowText: 115, // file row text fades in over 4 f, x +8 -> 0 (after the flying card has passed)
    uploadPress: 116, // cursor presses Upload Files (press grammar P), released at uploadRelease
    uploadRelease: 122,
    progress: [116, 128] as R, // button spinner + Uploading... from the press (the c14 data-fill window)
    uploaded: [130, 138] as R, // the selection section gives way to the green Successfully uploaded 1 file(s) box
    dialogClose: [138, 144] as R, // scale 1 -> 0.96, opacity 1 -> 0, PRESS ease
    veilOut: [138, 146] as R,
    gridInsert: [144, 160] as R, // right to left, 2 f stagger: shoot, animation, portrait FLIP one slot right, hills.jpg (drawn on top) last
    gridStagger: 2,
    sidebarInsert: [144, 154] as R, // row at y 504, rows below +42, SITE
    cursorToTile: [140, 158] as R, // SITE
    cursorTileFrom: { x: 1100, y: 862 } as P,
    tileCentre: { x: 572.3, y: 1014.4 } as P, // hills tile centre in WORLD px (v5 grid: column 0 of the file row)
  },

  S4: {
    press: 162,
    pressWindow: [158, 176] as R,
    release: 169,
    push: [164, 208] as R, // PUSH, log zoom
    pushPeak: 185, // measured: zoom rate peaks f184, tile growth f185 (scene A)
    pushA: { x: 572.3, y: 1014.4 } as P,
    pushS0: { x: 572.3, y: 1014.4 } as P,
    pushS1: { x: 960, y: 742 } as P,
    pushZ: [1, 5.19] as R,
    tileMask: [172, 202] as R, // world width 286 -> 381, radius 8 -> 0, border 1 -> 0, SITE
    uiDissolve: [178, 192] as R,
    cursorFade: [172, 182] as R,
    fullBleed: 208, // photo 1979x1484 centred (960, 742)
  },

  S5: {
    pillIn: [204, 222] as R, // +140 -> 0, opacity over the first 6 f, SITE
    pillOpacity: [204, 210] as R,
    caret: 222,
    keys: [226, 228, 230, 232, 234, 236] as readonly number[], // w _ 6 0 0 /
    pill: { cx: 960, cy: 1276, h: 108, radius: 26, padL: 36, icon: 32, gap: 18, padR: 40, font: 52, advance: 31.2 },
    labelGap: 14,
    // Plain-English labels: the site's blur-slide, 2 f after their reaction starts (FINAL S5)
    labelIn: { frames: 13, dy: 12, blur: 4 },
  },

  S6: {
    snap: [238, 256] as R, // w_600: 1979x1484 -> 600x450 at (960, 760), SNAP
    snapHit: 240,
    selectionIn: [244, 252] as R,
    badge1: [240, 252] as R, // odometer 6883 x 5162 -> 600 x 450
    labelWidth: 242,
    keys2: [270, 272, 274, 276, 278, 281] as readonly number[], // , h _ 6 0 0
    crop: [283, 299] as R, // height 450 -> 600, SITE
    ghostAppear: 283,
    ghostDrift: [290, 304] as R,
    badge2: [283, 295] as R,
    labelHeight: 285,
    keys3: [300, 302, 304, 306, 308, 311] as readonly number[], // , r _ m a x
    round: [313, 329] as R, // radius 0 -> 300, SITE
    labelRound: 315,
    drift: [256, 359] as R, // zoom 1 -> 1.035 about (960, 760), linear
    driftZ: [1, 1.035] as R,
    frameCentre: { x: 960, y: 760 } as P,
    poster: 345,
  },

  S7: {
    labelsOut: [360, 366] as R,
    hostCollapse: [362, 367] as R, // INOUT width collapse (the host has faded out over f360..f364 first)
    swaps: [368, 384, 398, 410, 420, 429, 437, 444, 450, 455, 459, 463, 466, 469, 471, 473, 475, 477] as readonly number[],
    order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 0] as readonly number[], // indexes into VARIANTS.S7
    creep: [360, 479.5] as R, // v5: runs on through the cache beat (rt opens bar 8 at 479.5), into the drop // zoom 1 -> 1.12 about (960, 760), CREEP
    creepZ: [1, 1.12] as R,
    freeze: [478, 479] as R,
  },

  S8: {
    drop: 480,
    release: [480, 524] as R, // S (960,760) -> (960,1072), z 1.12 -> 0.42, RELEASE
    releaseS0: { x: 960, y: 760 } as P,
    releaseS1: { x: 960, y: 1072 } as P,
    releaseZ: [1.12, 0.42] as R,
    releasePeak: 481,
    cellReveal: [480, 492] as R, // clip circle r 0 -> 2200, REVEAL
    tilesIn: [481, 498] as R,
    badgeOut: [480, 486] as R,
    pillCollapse: [482, 492] as R, // widths collapse once the edges have faded (f480..f481)
    paramsFlip: [480, 524] as R,
    marquee: [480, 597] as R, // v(f) = 2 + 10 e^(-(f-480)/18) px/f
  },

  S9: {
    whip: [570, 590] as R, // content translateX 0 -> -1200, bezier(0.55, 0, 0.85, 0.5); then it keeps its last speed
    whipPeak: 590,
    collapse: [575, 597] as R, // cell width 1848 -> 120 about x 960, COLLAPSE
    edges: [576, 597] as R,
    rowsOut: { A1: [583, 587] as R, A2: [586, 590] as R, B1: [589, 593] as R, B2: [592, 596] as R },
    columnOut: [597, 605] as R,
  },

  S10: {
    land: [590, 630] as R, // rail V1 centre x 2360 -> 960, LAND
    meterIn: [612, 620] as R,
    count1: [616, 640] as R, // 2,950,577 -> 87,582 B, bar 800 -> 23.7, INOUT
    flip: [645, 653] as R, // f_webp -> f_avif odometer + badge swap, SITE
    count2: [648, 664] as R, // 87,582 -> 61,613 B, bar 23.7 -> 16.7, INOUT
    hold: [682, 716] as R,
    railPitch: 900,
    railDrift: -1.0, // px/f between pans (FINAL 2.3): a whole px every frame, so the snapped cards step on a regular cadence
    railY: 800,
  },

  S11: {
    pan: [720, 752] as R, // rail translateX 0 -> -900, RAIL
    panPeak: 736,
    processing: [744, 779] as R,
    chipPop: [744, 750] as R, // scale 0.8 -> 1, BADGE spring
    spinPeriod: 24, // 360 deg per 24 f
    resolve: 780, // video plays from source 2.0 s at 1x
    chipOut: [780, 785] as R, // scale 1 -> 0.8, opacity -> 0
    overlayOut: [780, 788] as R,
    videoFrom: 2.0,
    metaPop: 784,
    labelsIn: 784,
    trim: [780, 796] as R, // SNAP, handles to 2/14 and 6/14
    trimClacks: [786, 790] as readonly number[],
  },

  S12: {
    // Flights (FLY): E from the rail's right side (V3), F from V1, C B A D from R + 1400 u.
    flights: {
      E: [837, 855] as R,
      C: [845, 863] as R,
      B: [852, 870] as R,
      A: [860, 878] as R,
      D: [867, 885] as R,
      F: [875, 893] as R,
    } as const,
    landings: [855, 863, 870, 878, 885, 893] as readonly number[], // E C B A D F
    seat: 2, // scale 1.02 -> 1 over 2 f after landing
    cropAfterLanding: 4, // outside part 15% -> 0, SITE
    morph: [838, 866] as R, // G from the centre (video) card, FLY: clears the lower-shard zone before E lands
    videoToStencil: [842, 852] as R, // linear crossfade, inside the morph's peak velocity
    gCrop: [894, 900] as R, // the photo rectangle rounds into the G dome, the ray cut-outs open (SITE)
    topShard: 900,
    flood: [910, 924] as R, // r 0 -> 520, feather 48, FLOOD
    floodPeak: 916,
    floodR: 520,
    floodFeather: 48,
    drift: [902, 926] as R, // stencil group zoom about R, linear (no frozen hold before the CARD move)
    driftZ: [1, 0.985] as R,
  },

  S13: {
    toLockup: [926, 956] as R, // stencil placement -> lockup placement, CARD
    toLockupPeak: 938,
    letters: 946,
    letterOffsets: [0, 2, 5, 8, 11, 14, 17, 20, 23] as readonly number[], // O p e n i n a r y
    letterSlide: 20, // translateX +14 -> 0, LETTER ease; opacity 0 -> 1 linear over the first 4 f
    letterDx: 14,
    ctaIn: [966, 986] as R, // y +40 -> 0, opacity 0 -> 1, SITE
    subIn: [976, 988] as R, // y 12 -> 0, opacity 0 -> 1, SITE
    formed: 990,
    zoom: [990, 1044] as R, // lockup + CTA group 1 -> 1.02 about (960, 742), linear
    zoomZ: [1, 1] as R, // v5: no group zoom, the mark sits inside the typed line
    zoomAnchor: { x: 960, y: 742 } as P,
    cursorIn: [1000, 1022] as R, // CURSOR ease, quadratic
    cursorFrom: { x: 1990, y: 1580 } as P,
    cursorCtrl: { x: 1560, y: 1300 } as P,
    cursorTo: { x: 1298, y: 938 } as P, // tip on the ArrowUpRight glyph: the URL stays readable
    hover: 1018, // pill bg #FFFFFF -> #F7F7F7, hard
    press: 1030, // pill 0.97, bg #F0F0F0
    pressWindow: [1026, 1045] as R,
    release: 1037,
    cta: { cx: 960, cy: 930, h: 124, radius: 30, font: 64, icon: 38, gap: 18, padX: 46 },
    subBaseline: 653, // v5: the end line and this sub-line make one block centred in the CTA framing
    lockupCentre: { x: 960, y: 705 } as P,
  },

  S14: {
    exit: [1044, 1052] as R, // K7 grey, pill + sub-line fade and sink 12 px
    retract: [1044, 1056] as R, // letters left to right (O first), 1 f stagger, 4 f fade, -20 px toward the mark, EXITIN
    retractStagger: 1,
    retractFade: 4,
    retractDx: -20,
    cursorOut: [1044, 1060] as R, // to (2000, 1600), EXITIN
    cursorOutTo: { x: 2000, y: 1600 } as P,
    recentre: [1044, 1056] as R, // lockup placement -> preburst (k 4, R on (960, 720)), INOUT
    selLeft: 1054,
    selTop: 1055,
    selRightBottom: 1056,
    blink: 1057,
    burst: [1058, 1076] as R, // k 4 -> 7 at R, offsets 0 -> F0, BURST
    burstPeak: 1064,
    burstHit: step16(9, 14), // f1065: the burst's velocity peak (frame diff 8.1 at f1064..f1065) = bell cluster + sub bloom
    card: [1060, 1076] as R, // scale about R 0.12 -> 1, BURST; opacity over the first 6 f
    cardOpacity: [1060, 1066] as R,
    cardScale0: 0.12,
    chip: [1066, 1074] as R, // opacity 0 -> 1, y 6 -> 0, SITE
    static: [1076, 1079] as R, // pixel-identical to f0
    selectionPad: 16,
  },
} as const;

// ---------------------------------------------------------------------------------------------------------
// Sound-only frames (envelopes, tick trains) that are not a picture event above. export-cues.ts reads these.
// ---------------------------------------------------------------------------------------------------------
const SOUND0 = {
  burstEchoes: [1, 2, 3].map((i) => T0.S14.burstHit + i * BEAT - 1080) as readonly number[], // f15, f45, f75: quarter notes after the hit, wrapped into bar 1
  flingWhoosh: [18, 54] as R,
  flingWhooshPeak: 50,
  cardLift: T0.S2.grab + 2,
  windowWhoosh: [T0.S2.rise[0], 74] as R,
  windowSeat: beat(1, 4), // f90: the RISE is 25 px from rest (at f74 it was still 142 px out), on the beat
  hoverGhost: T0.S2.hover + 3,
  cardSeat: T0.S3.flip[0] + 9, // f114: the FLIP thumbnail is ~90% into the row (the drop itself is c12)
  progressTicks: [117, 119, 121, 123, 125, 127] as readonly number[], // under the Uploading... spinner
  cropClack: T0.S6.crop[0] + 1, // f284: first changed pixel of the crop (its D6 bell sits on the f285 kick)
  roundBloop: T0.S6.round[0] + 1, // f314: first changed pixel of the rounding (its F6 bell sits on the f315 kick)
  count1Ticks: [618, 619.5, 621, 622.5, 623.5, 624.5, 625.5, 626.5, 627.5, 628.5, 640] as readonly number[], // off the f630 clap
  sidebarRow: 146,
  pushSwell: [180, 210] as R, // reverse swell into the re-entry
  pillWhoosh: [T0.S5.pillIn[0], T0.S5.pillIn[0] + 10] as R,
  badgeTicks: [245, 246.5, 248, 249.5, 251] as readonly number[], // the visible odometer roll (badge fades in f244-f248)
  snapOut: [T0.S8.drop, 500] as R,
  railLands: [T0.S10.land[0] + 1, T0.S10.land[1]] as R,
  spinnerTicks: Array.from({ length: 8 }, (_, i) => 750 + i * (SIXTEENTH / 2)) as readonly number[], // 1/32 notes
  lockupWhoosh: T0.S13.toLockup,
  ctaWhoosh: [T0.S13.ctaIn[0], T0.S13.ctaIn[0] + 10] as R,
  reverseSwell: [T0.S14.burstHit - 18, T0.S14.burstHit] as R, // f1047..f1065, ends exactly on the hit
  glints: [1059, 1065] as R,
  photoPuff: [1060, 1070] as R,
} as const;

/** The film's time: everything above, mapped by rt(). */
export const SCENES = remap(SCENES0);
export const HANDOFF = remap(HANDOFF0);
export const T = remap(T0);
export const SOUND = {
  ...remap(SOUND0),
  // the burst's echoes wrap past the loop end into bar 1, a quarter note apart
  burstEchoes: [1, 2, 3].map((i) => T.S14.burstHit + i * BEAT - FRAMES) as readonly number[],
};

// ---------------------------------------------------------------------------------------------------------
// Words (slot words at baseline 318, centred x 960; the hero word K3 belongs to scene B)
// ---------------------------------------------------------------------------------------------------------
export type TypeStep =
  | { readonly type: string; readonly at: number; readonly k?: number } // append chars, slot i at at + round(i k)
  | { readonly del: number; readonly at: number; readonly k?: number }; // delete n chars from the end, 1 per k f

export type WordScript = {
  readonly id: string;
  readonly steps: readonly TypeStep[];
  readonly exit?: R; // whole word -> exit grey over [a, b]; gone from b + 1
  readonly size?: number; // px, default 168 (auto-fit to <= 1600 wide)
  readonly x?: number; // design px, the word's centre (default SLOT.x)
  readonly baseline?: number; // design px, default SLOT.baseline: set per word so the title sits midway between the top and its scene
};

export const SLOT = { x: 960, baseline: 318, size: 168, maxWidth: 1600, weight: 400, trackingEm: -0.04 } as const; // the site's H1: Mona Sans 400, -0.04em
export const HERO = { x: 960, baseline: 822, size: 300, weight: 400, trackingEm: -0.04 } as const;

const K0 = {
  K1: { id: "K1", steps: [{ type: "upload once", at: 61 }], exit: [150, 158], baseline: 359 },
  K2: {
    id: "K2",
    baseline: 385,
    steps: [
      { type: "change the url", at: 252 },
      { del: 3, at: 318 }, // l r u at f318, 319, 320: grey 1 f, then gone
      { type: "file", at: 322, k: 1.5 }, // f322, 324, 325, 327
    ],
    exit: [446, 454],
  },
  K3: { id: "K3", steps: [{ type: "every size", at: 484, k: 1.5 }] }, // hero, scene B, no exit (eaten by the mask)
  K4: { id: "K4", steps: [{ type: "every format", at: 600 }], exit: [652, 658], baseline: 394 }, // types on the bar-6 downbeat, holds over the f_webp -> f_avif flip
  K5: { id: "K5", steps: [{ type: "98% smaller", at: 660 }], exit: [716, 724], baseline: 394 },
  K6: { id: "K6", steps: [{ type: "video too", at: 782 }], exit: [826, 834], baseline: 394 },
  // the end line: "Try [mark] openinary cloud", one line in the H1 style; the mark lands in the gap first (PLACEMENTS.lockup)
  K7: { id: "K7", steps: [{ type: "Try", at: 958 }], exit: [1044, 1052], size: 150, baseline: 548, x: 351.6 },
  K9: { id: "K9", steps: [{ type: "openinary cloud", at: 962 }], exit: [1044, 1052], size: 150, baseline: 548, x: 1158.4 },
} as const satisfies Record<string, WordScript>;
export const K = {
  ...remap(K0),
  // v5, written in film frames: the cache beat (bar 8, f840..f960)
  K8: { id: "K8", steps: [{ type: "fast after the first hit", at: 846 }], exit: [938, 946] as R, baseline: 361 } as WordScript,
};

/**
 * The cache beat (v5, film frames): under the URL pill, a timing chip. The first request does the work (a progress
 * line runs, the counter climbs to 412 ms), the page reloads (the photo blinks), the second answer comes from the edge
 * (the counter rolls down to 9 ms, the dot turns green). Out before the drop at f960.
 */
export const CACHE = {
  chipIn: [850, 860] as R,
  first: [856, 882] as R, // progress line + count 0 -> 412
  firstMs: 412,
  reload: [896, 906] as R, // the photo blinks, the line resets
  second: [900, 908] as R, // count 412 -> 9, label swap
  secondMs: 9,
  out: [944, 954] as R,
  cy: 1384, // 16 px under the pill
} as const;

/** What SlotWords (HUD, Film layer P3) renders. */
export const SLOT_WORDS: readonly WordScript[] = [K.K1, K.K2, K.K8, K.K4, K.K5, K.K6, K.K7, K.K9];

export const TYPE = {
  rampFrames: 12, // #CFCFCF -> #0A0A0A
  fadeInFrames: 2, // newest glyph opacity
  exitFrames: 8,
  recentreFrames: 8, // rewrite: SITE re-centre from the old final width to the new one
} as const;

// ---------------------------------------------------------------------------------------------------------
// Music (FINAL.md section 4; lead lines from concept A 5.2 re-timed). Frames only via bar/beat/step16 or T.
// ---------------------------------------------------------------------------------------------------------
export const NOTE = { Eb5: 75, F5: 77, G5: 79, Bb5: 82, C6: 84, D6: 86, Eb6: 87, F6: 89, G6: 91, Bb6: 94 } as const;
export type NoteName = keyof typeof NOTE;
export type LeadNote = { readonly note: NoteName; readonly frame: number; readonly until?: number; readonly role: string; readonly levelDb?: number };

const steps = (...on: number[]) => Array.from({ length: 16 }, (_, i) => (on.includes(i) ? "x" : ".")).join("");

export const MUSIC = {
  harmony: "Abmaj7, Eb/G, Bb, Cm7 -> G (stutter), Ab (drop), Cm7, Bb, Eb/G, Ab(add9), burst Bb-D-F cluster -> Abmaj7 at f0",
  master: { lufs: -14, truePeakDb: -1, lra: [5, 7], subMonoBelowHzFromBar: { hz: 120, bar: 3 } },
  levelsDb: { kick: 0, sub: -3, clap: 0, hats: -12, pad: -10, lead: -8, uiClick: -6, ticks: -8, typing: -8, whooshes: -12, riser: -6, impact: -3, buzz: -8 },
  bell: { carrier: "sine", ratio: 3.5, index: [1.15, 0.2], indexTauMs: 40, decayTauMs: 140, delay: "dotted 8th ping-pong (22.5 f), fb 0.35, LPF 4 kHz in loop", reverb: "IR 1.5 s wet -12 dB" },
  bars: [
    {
      bar: 1, chord: "Abmaj7", voicing: [56, 60, 63, 67], bass: { note: "Ab1", midi: 32, stereo: "wide +-4 cents" },
      drums: {}, pad: { gateDb: -6, duty: 0.6, rampMs: 5 },
      lead: [] as LeadNote[],
      automation: [
        { type: "burst-echoes-wrap", frame: bar(1), note: "burst bell echoes from the previous loop wrap in (see sfx c01)" },
        { type: "ui-foley-is-the-rhythm", frame: bar(1) },
      ],
    },
    {
      bar: 2, chord: "Eb/G", voicing: [55, 58, 63, 67], bass: { note: "G1", midi: 31, stereo: "wide +-4 cents" },
      drums: { shaker: steps(4, 6, 8, 10, 12, 14) }, drumLevelsDb: { shaker: -18 }, pad: { gateDb: -6, duty: 0.6, rampMs: 5 },
      lead: [] as LeadNote[],
      automation: [
        { type: "hpf-dropout", from: 188, to: 210, params: { hz: 400, slopeDbOct: 24, lowsGoneMs: 60 } },
        { type: "re-entry", frame: 210, params: { fullRange: true, padReattack: true } },
        { type: "reverse-pad-swell", from: 180, to: 210, params: { endsExactly: 210 } },
      ],
    },
    {
      bar: 3, chord: "Bb", voicing: [58, 62, 65, 70], bass: { note: "Bb1", midi: 34, stereo: "mono" },
      drums: { kick: steps(0, 6, 10, 14), rim: steps(4, 12), hatClosed: steps(0, 2, 4, 6, 8, 10, 12, 14) }, drumLevelsDb: { rim: -16 },
      pad: { gateDb: -6, duty: 0.6, rampMs: 5 },
      lead: [
        { note: "Bb5", frame: T.S6.snapHit, role: "token bell w_600" },
        { note: "D6", frame: step16(3, 6), role: "token bell h_600 (on the kick)" },
        { note: "F6", frame: step16(3, 10), role: "token bell r_max (on the kick)" },
        { note: "Bb5", frame: 322, role: "soft bell on the change the file rewrite", levelDb: -16 },
      ] as LeadNote[],
      automation: [],
    },
    {
      bar: 4, chord: "Cm7", voicing: [58, 60, 63, 67], chordChanges: [{ frame: beat(4, 4), chord: "G", note: "G3 196 Hz buzz only (stutter-freeze)" }],
      bass: { note: "C2", midi: 36, stereo: "mono" },
      drums: { kickMuffled: steps(0) }, pad: { gateDb: -9, duty: 0.6, rampMs: 5 },
      lead: [] as LeadNote[],
      automation: [
        { type: "band-limit", from: 360, to: 419, params: { hpfHz: 350, lpfHz: 2000 } },
        { type: "filters-open-log", from: 420, to: 449, params: { hpfHz: [350, 20], lpfHz: [2000, 20000] } },
        { type: "stutter-freeze", from: beat(4, 4), to: 479, params: { muteAllExcept: "G3 buzz (sfx c33)" } },
        { type: "hard-cut", frame: bar(5), params: { fadeMs: 5 } },
      ],
    },
    {
      bar: 5, chord: "Ab(add9)", voicing: [56, 60, 63, 70], bass: { note: "Ab1", midi: 32, stereo: "mono", sidechainDb: -3 },
      drums: { kick: steps(0, 6, 10, 14), clap: steps(4, 12), hatClosed: steps(0, 4, 8, 12), hatOpen: steps(2, 6, 10, 14) }, drumLevelsDb: { hatOpen: 2 },
      pad: {},
      lead: [
        { note: "Bb5", frame: step16(5, 0), role: "M1" },
        { note: "C6", frame: step16(5, 2), role: "M1" },
        { note: "Eb6", frame: step16(5, 4), role: "M1" },
        { note: "C6", frame: step16(5, 8), role: "M1" },
        { note: "Bb5", frame: step16(5, 10), role: "M1" },
        { note: "G5", frame: step16(5, 12), until: bar(6), role: "M1 held" },
      ] as LeadNote[],
      automation: [
        { type: "impact", frame: T.S8.drop, note: "sfx c34" },
        { type: "hpf-suckout", from: 585, to: 600, params: { hz: 400, subDb: -35 } },
        { type: "return", frame: bar(6) },
      ],
    },
    {
      bar: 6, chord: "Cm7", voicing: [58, 60, 63, 67], bass: { note: "C2", midi: 36, stereo: "mono" },
      drums: { kick: steps(0, 6, 10, 14), clap: steps(4, 12), clapFlam: steps(8), hatClosed: steps(0, 4, 8, 12), hatOpen: steps(2, 6, 10, 14), hatGhost: steps(1, 3, 5, 7, 9, 11, 13, 15) },
      drumLevelsDb: { hatOpen: 2, hatGhost: -8 },
      pad: {},
      lead: [
        { note: "G5", frame: step16(6, 0), role: "M2" },
        { note: "Bb5", frame: step16(6, 2), role: "M2" },
        { note: "C6", frame: step16(6, 4), role: "M2" },
        { note: "Bb5", frame: step16(6, 8), role: "M2" },
        { note: "G5", frame: step16(6, 10), role: "M2" },
        { note: "F5", frame: step16(6, 12), role: "M2" },
        { note: "Eb5", frame: step16(6, 14), role: "M2" },
      ] as LeadNote[],
      automation: [
        { type: "hpf-suckout", from: 637, to: 660, params: { hz: 400, subDb: -35 } },
        { type: "return", frame: beat(6, 3), params: { clapFlam: true, with: "K5 98% smaller" } },
      ],
    },
    {
      bar: 7, chord: "Bb", voicing: [58, 62, 65, 70], bass: { note: "Bb1", midi: 34, stereo: "mono" },
      drums: { kick: steps(0, 6, 8, 12, 14), clap: steps(4, 12), hatClosed: steps(0, 2, 4, 6, 8, 10, 12, 14) },
      pad: {},
      lead: [
        { note: "D6", frame: step16(7, 0), role: "sparse" },
        { note: "C6", frame: step16(7, 2), role: "sparse" },
        { note: "Bb5", frame: T.S11.resolve, role: "after resolve" },
        { note: "D6", frame: step16(7, 10), role: "after resolve" },
        { note: "F6", frame: step16(7, 12), role: "after resolve" },
      ] as LeadNote[],
      automation: [
        { type: "band-pass-radio", from: 750, to: 780, params: { lowHz: 300, highHz: 3000, above5kDb: -30, subDb: -30 } },
        { type: "slam-back", frame: T.S11.resolve, params: { softImpact: "kick + sub bloom, no crash" } },
      ],
    },
    {
      bar: 8, chord: "Eb/G", voicing: [55, 58, 63, 67], bass: { note: "G1", midi: 31, stereo: "mono" },
      drums: { kick: steps(0, 6, 10, 14), clap: steps(4, 12), hatClosed: steps(0, 4, 8, 12), hatOpen: steps(2, 6, 10, 14) },
      pad: {},
      lead: [
        ...T.S12.landings.map((frame, i) => ({ note: (["Bb5", "C6", "D6", "F6", "G6", "Bb6"] as const)[i], frame, role: "landing blip" })),
        { note: "Eb6", frame: T.S12.topShard, role: "bell with the top-shard thock" },
      ] as LeadNote[],
      automation: [{ type: "flood-bloom", from: T.S12.flood[0], to: T.S12.flood[1], params: { padLpfHz: [800, 6000] } }],
    },
    {
      bar: 9, chord: "Ab(add9)", voicing: [56, 60, 63, 70], bass: { note: "Ab1", midi: 32, stereo: "mono", levelDb: -12 },
      drums: {}, pad: {},
      lead: [
        { note: "G5", frame: step16(9, 0), role: "CTA motif" },
        { note: "Bb5", frame: step16(9, 2), role: "CTA motif" },
        { note: "Eb6", frame: step16(9, 4), role: "CTA motif" },
      ] as LeadNote[],
      automation: [
        { type: "drums-out", frame: bar(9) },
        { type: "reverse-swell", from: T.S14.burstHit - 18, to: T.S14.burstHit },
        { type: "hard-stop", frame: T.S14.exit[0], params: { fadeMs: 5, except: "reverse swell" } },
        { type: "burst", frame: T.S14.burstHit, params: { bellCluster: ["Bb5", "D6", "F6"], subBloom: "Bb1", whoosh: "outward" } },
        { type: "echoes-wrap", frame: T.S14.burstHit, params: { quarterNote: true, darkening: true, wrapsTo: "bar 1 (sfx c01)" } },
      ],
    },
  ],
} as const;
