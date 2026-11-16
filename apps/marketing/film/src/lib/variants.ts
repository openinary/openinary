// Every URL / param string the film shows, and the honest output each one returns (engine rules, concept A 2.6).
// scripts/check.ts validates every string here against the parser grammar (brand.md section 3).

export const SOURCE = { name: "hills.jpg", w: 6883, h: 5162, bytes: 2950577 } as const;
export const BYTES = { original: 2950577, w1500webp: 87582, w1500avif: 61613 } as const;

export const HOST = "cdn.openinary.dev/";
export const PILL_HOST = "cdn.openinary.dev/…/t/"; // "…" elides the bucket path (b/{bucketId})
export const PILL_FILE = "/hills.jpg";

export type Output = {
  params: string;
  w: number;
  h: number;
  /** CSS radius in output px: number, or "max" (ellipse = border-radius 50%). 0 = square corners. */
  radius: number | "max";
  /** c_pad,b_white: image contained on white. */
  pad: boolean;
  format: string | null;
};

/** Output dimensions and shape the engine returns for `params` on a source of size src (fill/cover default). */
export const outputOf = (params: string, src: { w: number; h: number } = SOURCE): Output => {
  const kv = Object.fromEntries(params.split(",").filter(Boolean).map((p) => [p.slice(0, p.indexOf("_")), p.slice(p.indexOf("_") + 1)]));
  const ar = kv.ar ? (kv.ar.includes(":") ? Number(kv.ar.split(":")[0]) / Number(kv.ar.split(":")[1]) : Number(kv.ar)) : null;
  let w = kv.w ? Number(kv.w) : null;
  let h = kv.h ? Number(kv.h) : null;
  const ratio = ar ?? src.w / src.h;
  if (w !== null && h === null) h = Math.round(w / ratio);
  if (h !== null && w === null) w = Math.round(h * ratio);
  if (w === null || h === null) {
    w = src.w;
    h = src.h;
  }
  return {
    params,
    w,
    h,
    radius: kv.r === "max" ? "max" : kv.r ? Number(kv.r.split(":")[0]) : 0,
    pad: kv.c === "pad",
    format: kv.f ?? null,
  };
};

/** Bar 3 typing (S5, S6): each step is a valid URL on its own. */
export const TYPING = ["", "w_600", "w_600,h_600", "w_600,h_600,r_max"] as const;

/** S7 slot-machine states S0..S9 (index = state number). */
export const S7_STATES = [
  "w_600,h_600,r_max",
  "ar_16:9,c_fill,w_800",
  "w_480,h_600",
  "w_600,h_600,c_pad,b_white",
  "w_800,h_400",
  "w_400,h_600,r_40",
  "w_600,h_600",
  "w_700,h_500,r_24",
  "ar_4:3,w_720,r_max",
  "w_600,h_300",
].map((p) => outputOf(p));

/** S8 wall rows (concept A S8), each a sequence the builder repeats for marquee coverage. */
export const WALL = {
  A1: ["w_800,h_400", "w_300,h_300,r_max", "ar_3:2,w_720", "w_360,h_640", "w_600,h_600,c_pad,b_white", "ar_16:9,c_fill,w_800"],
  A2: ["w_480,h_600", "ar_4:3,w_720,r_max", "w_600,h_300", "ar_1:1,w_500,r_24", "w_800,f_webp", "w_400,h_600,r_40"],
  B1: ["ar_16:9,c_fill,w_800", "w_480,h_600", "w_600,h_600,r_max", "w_600,h_600,c_pad,b_white", "w_400,h_600,r_40", "w_800,h_400"],
  B2: ["w_360,h_640", "w_600,h_600", "ar_3:2,w_720", "w_300,h_300,r_max", "ar_4:3,w_720,r_max", "w_600,h_300"],
} as const;
export const WALL_ANCHOR = { row: "B1", index: 2 } as const; // our circle

/** S10 to S12 rail (FINAL.md S10, S11, S12). */
export const RAIL = {
  V0: "w_600,h_600,r_max",
  V1: ["w_1500,f_webp", "w_1500,f_avif"],
  V1_BADGE: ["WEBP", "AVIF"],
  V2: "so_2,eo_6", // on blossom.mp4
  V3: "ar_16:9,c_fill,w_800", // off-screen right, flies into E
} as const;

/** S12 shard sources (FINAL.md S12). */
export const STENCIL_SOURCES = {
  E: "ar_16:9,c_fill,w_800",
  F: "w_1500,f_avif",
  C: "w_600,h_600",
  B: "w_480,h_600",
  A: "w_600,h_600,r_max",
  D: "w_600,h_600,c_pad,b_white",
} as const;

export const VIDEO = { name: "blossom.mp4", w: 1280, h: 720, duration: 14.08, so: 2, eo: 6, meta: "MP4 · 1280 × 720 · 0:04" } as const;

export const CTA = { url: "app.openinary.dev", sub: "free plan, no card required" } as const;

/** Full URLs as the pill prints them (host elided). */
export const pillUrl = (params: string) => (params ? `${PILL_HOST}${params}${PILL_FILE}` : `${PILL_HOST.slice(0, -1)}${PILL_FILE}`);

/** Every transformation segment shown anywhere, for check.ts. */
export const ALL_SEGMENTS: readonly string[] = [
  ...TYPING.filter(Boolean),
  ...S7_STATES.map((s) => s.params),
  ...Object.values(WALL).flat(),
  RAIL.V0,
  ...RAIL.V1,
  RAIL.V2,
  RAIL.V3,
  ...Object.values(STENCIL_SOURCES),
];

/** Byte printing rules (FINAL.md S10): KB = bytes/1024, MB = bytes/1048576, always 2 decimals. */
export const formatBytes = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(2)} KB`);
