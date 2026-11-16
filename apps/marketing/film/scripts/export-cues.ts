// Builds public/cues.json (the ONLY timing input of the audio script) from src/timeline.ts.
// Run: npx tsx scripts/export-cues.ts        (scripts/check.ts verifies the file is up to date)
// Cue list = concept A section 6 remapped by FINAL.md section 5 + the new bar 6 / bar 7 cues.
// levelDb is relative to the clap peak (0 dB). pan: % (-100 L .. +100 R), [from, to] for a sweep, or a keyword.
import { writeFileSync } from "node:fs";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E, type EaseFn } from "../src/lib/ease";
import { SHARDS, type ShardId } from "../src/lib/shards";
import { compile } from "../src/lib/type";
import { BPM, CACHE, FPS, FRAMES, K, MUSIC, bar, NOTE, SAMPLES_PER_FRAME, SAMPLE_RATE, SOUND, T, type NoteName } from "../src/timeline";

/** % (-100 L .. +100 R), a list (one per hit, or [from, to] for a sweep), or a keyword ("wide", "mono", "by-x", ...). */
type Pan = number | readonly number[] | string;
export type Cue = {
  id: string;
  event: string;
  type: string;
  frame: number;
  endFrame?: number;
  peakFrame?: number;
  frames?: readonly number[];
  params: Record<string, unknown>;
  levelDb: number | readonly number[] | null;
  pan: Pan | null;
};

/** The cache beat's progress ticks: every 3 frames while the first request runs. */
const CACHE_TICKS = Array.from({ length: Math.floor((CACHE.first[1] - CACHE.first[0]) / 3) }, (_, i) => CACHE.first[0] + 3 * i);

const hz = (n: NoteName) => +(440 * Math.pow(2, (NOTE[n] - 69) / 12)).toFixed(2);
const bell = (n: NoteName) => ({ note: n, midi: NOTE[n], hz: hz(n) });

/** Tick frames of an odometer roll: one tick each time the eased value crosses one of n equal steps. */
const rollTicks = ([f0, f1]: readonly [number, number], n: number, ease: EaseFn) => {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const target = i / (n + 1);
    let f = f0;
    while (f < f1 && ease((f - f0) / (f1 - f0)) < target) f += 0.25;
    out.push(f);
  }
  return out;
};

// Shared recipes (audio.md 6 / concept A 6), referenced by name so the synth has one implementation each.
const R = {
  click: { recipe: "ui-click-press", burstMs: 2.5, resonatorsHz: [5300, 9600, 10200, 13100], q: 25, thockHz: 450, thockTauMs: 4, thockDb: -12, hpHz: 300 },
  release: { recipe: "ui-click-release", resonatorsHz: [4600, 7500, 9600, 14300], q: 25, hpHz: 300 },
  tab: { recipe: "tab-tick", burstMs: 1.5, resonatorsHz: [7500, 11200, 15000], q: 20, tauMs: 2.5, hpHz: 5000 },
  typing: { recipe: "typing", burstMs: 3, resonatorBandsHz: [[2400, 6400], [10000, 16000]], q: 12, tauMs: 2, hpHz: 1000, jitterDb: 3, newSeedPerKey: true },
  pop: { recipe: "soft-pop", chirpHz: [900, 1500], chirpMs: 25, clickMs: 1, tauMs: 30 },
  whooshShort: { recipe: "whoosh-short", noise: "pink", envelope: "raised-cosine", bandHz: [500, 2500, 900], q: 2 },
} as const;

const s1 = T.S1.fling;
const cues: Cue[] = [
  // --- bar 1 ---------------------------------------------------------------------------------------------
  { id: "c01", event: "burst bell echoes, quarter notes after the f1065 hit (wrapped from the previous loop)", type: "echo-tail", frame: SOUND.burstEchoes[0], frames: SOUND.burstEchoes, params: { source: "c65 bell cluster", lpfHz: [5000, 2500, 1200], darkerEachRepeat: true }, levelDb: [-14, -18, -22], pan: [-40, 40, -40] },
  { id: "c03", event: "shards inhale", type: "reverse-air", frame: T.S1.inhale[0], endFrame: T.S1.inhale[1], params: { noise: "pink", bandHz: [900, 500], q: 1, envelope: "raised-cosine", sineHz: [180, 150], sineDb: -12 }, levelDb: -28, pan: 0 },
  { id: "c04", event: "shards fling", type: "whoosh-wide", frame: SOUND.flingWhoosh[0], endFrame: SOUND.flingWhoosh[1], peakFrame: SOUND.flingWhooshPeak, params: { noise: "pink", bandHz: [400, 3200], rise: 0.8, fallMs: 60, independentLR: true, sidePeakDb: 6 }, levelDb: -12, pan: "wide" },
  {
    id: "c05", event: "7 shard swishes", type: "micro-whoosh",
    frame: T.S1.flingStartOf("E") + 1, frames: s1.order.map((id) => T.S1.flingStartOf(id) + 1),
    params: { order: s1.order, ms: 90, bandHz: [2000, 4000], octaveUpFor: "G" }, levelDb: -26, pan: [80, 60, 25, -25, -60, -80, 0],
  },
  { id: "c06", event: "grab", type: "click-press", frame: T.S2.grab, params: R.click, levelDb: -6, pan: 15 },
  { id: "c07", event: "card lifts", type: "paper-lift", frame: SOUND.cardLift, params: { ms: 60, bandHz: [2000, 5000], attackMs: 8 }, levelDb: -26, pan: 10 },
  { id: "c08", event: "window rises", type: "whoosh-low", frame: SOUND.windowWhoosh[0], endFrame: SOUND.windowWhoosh[1], peakFrame: T.S2.risePeak, params: { noise: "pink", bandHz: [250, 1200, 600], ms: 400 }, levelDb: -16, pan: 0 },
  { id: "c09", event: "window seats", type: "soft-thump", frame: SOUND.windowSeat, params: { sineHz: [110, 70], tauMs: 60, clickHz: 1500, clickMs: 2, clickDb: -20 }, levelDb: -18, pan: 0 },
  { id: "c10", event: "K1 upload once", type: "soft-pop", frame: K.K1.steps[0].at, params: R.pop, levelDb: -16, pan: 0 },
  { id: "c11", event: "card over the dropzone", type: "tab-tick", frame: T.S2.hover, frames: [T.S2.hover, SOUND.hoverGhost], params: { ...R.tab, ghostDb: -6 }, levelDb: [-10, -16], pan: 40 },
  { id: "c12", event: "drop", type: "click-release", frame: T.S2.drop, params: R.release, levelDb: -7, pan: 40 },
  { id: "c13", event: "card lands in the dialog row", type: "felt-thock", frame: SOUND.cardSeat, params: { sineHz: [180, 120], tauMs: 30, noiseBandHz: [400, 2000], noiseMs: 40, softer: true }, levelDb: -14, pan: 40 },
  { id: "c13a", event: "Upload Files press", type: "click-press+release", frame: T.S3.uploadPress, frames: [T.S3.uploadPress, T.S3.uploadRelease], params: { press: R.click, release: R.release }, levelDb: [-8, -9], pan: 30 },
  { id: "c14", event: "upload progress", type: "data-fill", frame: T.S3.progress[0], endFrame: T.S3.progress[1], frames: SOUND.progressTicks, params: { glideHz: [700, 1400], glideDb: -28, ticks: SOUND.progressTicks, tickResonatorsHz: [9000, 12000] }, levelDb: -24, pan: 40 },
  { id: "c16", event: "uploaded check", type: "pop", frame: T.S3.uploaded[0], params: { chirpHz: [1100, 1650], chirpMs: 25, plus: "tab-tick" }, levelDb: -12, pan: 40 },
  { id: "c16a", event: "dialog closes", type: "down-swish", frame: T.S3.dialogClose[0], endFrame: T.S3.dialogClose[1], params: { noise: "white", bandHz: [2000, 700], ms: 150 }, levelDb: -22, pan: 0 },
  // v5 cache beat (bar 8)
  { id: "k0", event: "K8 fast after the first hit", type: "soft-pop", frame: K.K8.steps[0].at, params: R.pop, levelDb: -16, pan: 0 },
  { id: "k1", event: "timing chip rises", type: "micro-whoosh", frame: CACHE.chipIn[0], endFrame: CACHE.chipIn[1], params: { noise: "pink", bandHz: [1200, 5000], ms: 140 }, levelDb: -26, pan: 0 },
  { id: "k2", event: "first request runs", type: "data-fill", frame: CACHE.first[0], endFrame: CACHE.first[1], frames: CACHE_TICKS, params: { glideHz: [500, 1100], glideDb: -30, ticks: CACHE_TICKS, tickResonatorsHz: [8000, 11000] }, levelDb: -26, pan: 0 },
  { id: "k3", event: "page reloads", type: "down-swish", frame: CACHE.reload[0], endFrame: CACHE.reload[1], params: { noise: "white", bandHz: [3000, 900], ms: 140 }, levelDb: -24, pan: 0 },
  { id: "k4", event: "served from the edge", type: "pop", frame: CACHE.second[0], params: { chirpHz: [1400, 2100], chirpMs: 18, plus: "tab-tick" }, levelDb: -13, pan: 0 },
  {
    id: "c16b", event: "grid tiles FLIP one slot", type: "tab-tick",
    frame: T.S3.gridInsert[0], frames: [0, 1, 2, 3].map((i) => T.S3.gridInsert[0] + i * T.S3.gridStagger),
    params: { ...R.tab, tiny: true }, levelDb: -18, pan: [45, 10, -25, -60], // scene A inserts right to left (c4 first, hills.jpg at c1 last)
  },
  // --- bar 2 ---------------------------------------------------------------------------------------------
  { id: "c17", event: "tile click", type: "click-press+release", frame: T.S4.press, frames: [T.S4.press, T.S4.release], params: { press: R.click, release: R.release }, levelDb: [-6, -7], pan: -30 },
  { id: "c18", event: "push through the tile", type: "suck-in-whoosh", frame: T.S4.push[0], endFrame: T.S4.push[1], peakFrame: T.S4.pushPeak, params: { noise: "white", bandHz: [300, 5000], rise: 0.8, decayAfterPeakMs: 120 }, levelDb: -12, pan: 0 },
  { id: "c19", event: "into the re-entry", type: "reverse-swell", frame: SOUND.pushSwell[0], endFrame: SOUND.pushSwell[1], params: { source: "reversed Eb/G pad tail", ms: 500, lpfHz: 6000, endsExactly: SOUND.pushSwell[1] }, levelDb: -14, pan: "wide" },
  { id: "c21", event: "URL pill slides in", type: "micro-whoosh", frame: SOUND.pillWhoosh[0], endFrame: SOUND.pillWhoosh[1], params: { noise: "pink", bandHz: [1000, 3000], ms: 180 }, levelDb: -24, pan: 0 },
  { id: "c22", event: "keys w_600/", type: "typing", frame: T.S5.keys[0], frames: T.S5.keys, params: { ...R.typing, chars: "w_600/" }, levelDb: -8, pan: "per-letter" },
  // --- bar 3 ---------------------------------------------------------------------------------------------
  { id: "c23", event: "w_600 snap", type: "thwip-slam", frame: T.S6.snap[0], endFrame: T.S6.snap[1], peakFrame: T.S6.snapHit, params: { sineHz: [900, 280], sineMs: 80, tauMs: 50, noiseBandHz: [3000, 800], noiseMs: 100, withKick: true, bell: { ...bell("Bb5"), frame: T.S6.snapHit } }, levelDb: -9, pan: 0 },
  { id: "c24", event: "badge odometer", type: "micro-ticks", frame: SOUND.badgeTicks[0], frames: SOUND.badgeTicks, params: { resonatorsHz: [12000, 15000] }, levelDb: -26, pan: 0 },
  { id: "c25", event: "K2 change the url", type: "soft-pop", frame: K.K2.steps[0].at, params: R.pop, levelDb: -16, pan: 0 },
  { id: "c26", event: "keys ,h_600", type: "typing", frame: T.S6.keys2[0], frames: T.S6.keys2, params: { ...R.typing, chars: ",h_600" }, levelDb: -8, pan: "per-letter" },
  { id: "c27", event: "crop", type: "clack", frame: SOUND.cropClack, params: { burstMs: 2, resonatorsHz: [2200, 4800], q: 8, sineHz: 240, sineTauMs: 20, bell: { ...bell("D6"), frame: MUSIC.bars[2].lead[1].frame } }, levelDb: -10, pan: 0 },
  { id: "c28", event: "overflow falls away", type: "soft-air-split", frame: T.S6.ghostDrift[0], endFrame: T.S6.ghostDrift[1], params: { bandHz: [2000, 600], ms: 200, leftStripLeft: true }, levelDb: -26, pan: [-50, 50] },
  { id: "c29", event: "keys ,r_max", type: "typing", frame: T.S6.keys3[0], frames: T.S6.keys3, params: { ...R.typing, chars: ",r_max" }, levelDb: -8, pan: "per-letter" },
  { id: "c30", event: "corners round", type: "bloop", frame: SOUND.roundBloop, params: { sineHz: [520, 780], ms: 90, attackMs: 6, tauMs: 60, h2Db: -18, bell: { ...bell("F6"), frame: MUSIC.bars[2].lead[2].frame } }, levelDb: -12, pan: 0 },
  (() => {
    const g = compile(K.K2).glyphs;
    const del = g.filter((x) => x.tDel !== null).map((x) => x.tDel as number).sort((a, b) => a - b);
    const typed = g.filter((x) => x.block === 1).map((x) => x.tIn);
    return {
      id: "c30a", event: "change the url -> change the file rewrite", type: "rewrite", frame: del[0], endFrame: typed[typed.length - 1],
      frames: [...del, ...typed],
      params: { reverseTicks: { frames: del, levelDb: -22 }, typingTicks: { frames: typed, levelDb: -12, ...R.typing }, bell: { ...bell("Bb5"), frame: typed[0], levelDb: -16 } },
      levelDb: -12, pan: 0,
    } satisfies Cue;
  })(),
  // --- bar 4 ---------------------------------------------------------------------------------------------
  { id: "c30b", event: "host collapse", type: "micro-zip", frame: T.S7.hostCollapse[0], endFrame: T.S7.hostCollapse[1], params: { noise: "white", bandHz: [3000, 1000], ms: 120 }, levelDb: -24, pan: 0 },
  { id: "c31", event: "slot-machine swaps", type: "ratchet-ticks", frame: T.S7.swaps[0], frames: T.S7.swaps, params: { hpHz: 1200, ms: [3, 5], resonatorsHz: [3100, 7400, 13500], semitoneUpPerTick: 1, crescendoDbLinear: true }, levelDb: [-30, -10], pan: "per-letter" },
  // --- bar 5 ---------------------------------------------------------------------------------------------
  { id: "c34", event: "DROP", type: "impact", frame: T.S8.drop, params: { sineHz: [60, 35], ms: 400, tauMs: 350, noiseHpHz: 3000, noiseTauMs: 250, irSeconds: 1.8, irOn: "noise", withKickAndSub: true }, levelDb: -3, pan: "mono" },
  { id: "c35", event: "snap-out", type: "whoomp", frame: SOUND.snapOut[0], endFrame: SOUND.snapOut[1], params: { noise: "pink", bandHz: [3000, 400], attackMs: 5, decayMs: 350 }, levelDb: -10, pan: "wide" },
  { id: "c37", event: "collapse-whip", type: "whoosh-long", frame: T.S9.whip[0], endFrame: T.S9.whip[1], peakFrame: T.S9.whip[1], params: { noise: "pink", bandHz: [300, 6000], rise: 0.8, flangerHz: 0.5 }, levelDb: -12, pan: [40, -60] },
  // --- bar 6 (S10, new) ----------------------------------------------------------------------------------
  { id: "b6-rail", event: "rail lands", type: "slide-air", frame: SOUND.railLands[0], endFrame: SOUND.railLands[1], params: { bandHz: [800, 2000], decayMs: 300 }, levelDb: -22, pan: [60, 0] },
  { id: "b6-k4", event: "K4 every format", type: "soft-pop", frame: K.K4.steps[0].at, params: R.pop, levelDb: -16, pan: 0 },
  { id: "b6-meter", event: "size meter appears", type: "micro-whoosh", frame: T.S10.meterIn[0], params: { noise: "pink", bandHz: [1000, 3000], ms: 150 }, levelDb: -26, pan: 0 },
  {
    id: "b6-count1", event: "counter 2.81 MB -> 85.53 KB", type: "odometer-deflate", frame: T.S10.count1[0], endFrame: T.S10.count1[1],
    frames: SOUND.count1Ticks,
    params: { ticks: SOUND.count1Ticks.length, resonatorStepSemitones: -1, deflate: { sineHz: [1200, 400], ms: 400, levelDb: -24 } }, levelDb: -18, pan: 0,
  },
  { id: "b6-flip", event: "f_webp -> f_avif flip", type: "pitched-tab-tick", frame: T.S10.flip[0], params: { ...R.tab, resonatorScale: Math.pow(2, 5 / 12), tk: { hz: 2000, ms: 6 } }, levelDb: -10, pan: 0 },
  {
    id: "b6-count2", event: "counter 85.53 KB -> 60.17 KB", type: "odometer", frame: T.S10.count2[0], endFrame: T.S10.count2[1],
    frames: rollTicks(T.S10.count2, 6, E.INOUT), params: { ticks: 6, transposeSemitones: -2 }, levelDb: -20, pan: 0,
  },
  { id: "b6-k5", event: "K5 98% smaller", type: "soft-pop", frame: K.K5.steps[0].at, params: { ...R.pop, withClapFlam: "music.bars[5].drums.clapFlam" }, levelDb: -16, pan: 0 },
  // --- bar 7 (S11, new) ----------------------------------------------------------------------------------
  { id: "b7-pan", event: "rail pan to the video", type: "whoosh-short", frame: T.S11.pan[0], endFrame: T.S11.pan[1], peakFrame: T.S11.panPeak, params: { ...R.whooshShort, ms: 250 }, levelDb: -12, pan: [60, -60] },
  { id: "b7-chip", event: "Processing chip pops", type: "soft-pop", frame: T.S11.chipPop[0], params: { ...R.pop, chirpHz: [700, 1000] }, levelDb: -18, pan: 0 },
  { id: "b7-spin", event: "processing spinner", type: "spinner-ticks", frame: SOUND.spinnerTicks[0], frames: SOUND.spinnerTicks, params: { hpHz: 6000, insideRadioBand: true }, levelDb: -30, pan: 0 },
  { id: "b7-resolve", event: "resolve: slam back + ready chime", type: "chime", frame: T.S11.resolve, params: { music: "kick + sub bloom", bells: [bell("Bb5"), bell("D6")], tauMs: 200 }, levelDb: -8, pan: 0 },
  { id: "b7-trim", event: "trim handles snap", type: "clack", frame: T.S11.trimClacks[0], frames: T.S11.trimClacks, params: { recipe: "as c27 crop clack" }, levelDb: -12, pan: [-30, 30] },
  { id: "b7-k6", event: "K6 video too", type: "soft-pop", frame: K.K6.steps[0].at, params: R.pop, levelDb: -16, pan: 0 },
  { id: "b7-meta", event: "meta chip pops", type: "tab-tick", frame: T.S11.metaPop, params: R.tab, levelDb: -16, pan: 0 },
  // --- bar 8 (concept A bar 7, +120) ---------------------------------------------------------------------
  {
    id: "c47", event: "cards incoming (flight starts)", type: "swish", frame: T.S12.flights.E[0],
    frames: Object.values(T.S12.flights).map((r) => r[0]), params: { ms: 150, bandHz: [1500, 4000], order: Object.keys(T.S12.flights) }, levelDb: -16, pan: [80, 60, 30, -30, -60, -80],
  },
  {
    id: "c48", event: "wedges click in", type: "pitched-snap", frame: T.S12.landings[0], frames: T.S12.landings,
    params: { plus: "tab-tick", fm: { ratio: 3.5, index: [2, 0.3], indexMs: 40, tauMs: 70 }, delay: "dotted 8th ping-pong fb 0.3", notes: (["Bb5", "C6", "D6", "F6", "G6", "Bb6"] as const).map(bell) },
    levelDb: -10, pan: [60, 45, 20, -20, -45, -60],
  },
  { id: "c49", event: "top card morphs up", type: "rise-air", frame: T.S12.morph[0], endFrame: T.S12.morph[1], params: { noise: "pink", bandHz: [400, 1500], ms: 600 }, levelDb: -22, pan: 0 },
  { id: "c50", event: "top shard lands", type: "deep-thock", frame: T.S12.topShard, params: { sineHz: [150, 90], tauMs: 70, clickHz: 3000, clickMs: 3, bell: bell("Eb6") }, levelDb: -6, pan: 0 },
  { id: "c51", event: "overflow falls (all)", type: "soft-air", frame: T.S12.gCrop[0] + 1, endFrame: T.S12.gCrop[1], params: { recipe: "as c28, centred" }, levelDb: -28, pan: 0 },
  { id: "c52", event: "red flood", type: "bloom", frame: T.S12.flood[0], endFrame: T.S12.flood[1], peakFrame: T.S12.floodPeak, params: { padLpfHz: [800, 6000], swellHz: [311.13, 466.16], attackMs: 60, tauMs: 400, shimmer: { hpHz: 6000, levelDb: -24 } }, levelDb: -14, pan: "wide" },
  // --- bar 9 ---------------------------------------------------------------------------------------------
  { id: "c54", event: "mark into lockup", type: "whoosh-short", frame: SOUND.lockupWhoosh[0], endFrame: SOUND.lockupWhoosh[1], peakFrame: T.S13.toLockupPeak, params: R.whooshShort, levelDb: -18, pan: [0, -30] },
  {
    id: "c55", event: "end line types", type: "typing", frame: K.K7.steps[0].at, frames: [...compile(K.K7).glyphs, ...compile(K.K9).glyphs].filter((g) => g.ch !== " ").map((g) => g.tIn),
    params: { ...R.typing, resonatorsHz: [5600, 6000, 10200, 15000] }, levelDb: -10, pan: [-20, 25],
  },
  { id: "c56", event: "K7 Try [mark] openinary cloud", type: "soft-pop", frame: K.K7.steps[0].at, params: { ...R.pop, withCtaMotif: true }, levelDb: -16, pan: 0 },
  { id: "c59", event: "into the burst", type: "reverse-swell", frame: SOUND.reverseSwell[0], endFrame: SOUND.reverseSwell[1], params: { source: "reversed bell-cluster tail + Ab(add9) pad", lpfHz: 6000, endsExactly: SOUND.reverseSwell[1] }, levelDb: -12, pan: "wide" },
  { id: "c60", event: "music hard stop", type: "music-automation", frame: T.S14.exit[0], params: { fadeMs: 5, except: "c59" }, levelDb: null, pan: null },
  { id: "c62", event: "selection draws on", type: "tab-tick", frame: T.S14.selLeft, params: R.tab, levelDb: -12, pan: 0 },
  { id: "c63", event: "blink", type: "click-press", frame: T.S14.blink, params: R.click, levelDb: -8, pan: 0 },
  { id: "c64", event: "burst", type: "airy-outward-whoosh", frame: T.S14.burst[0], endFrame: T.S14.burst[1], peakFrame: T.S14.burstPeak, params: { noise: "pink", bandHz: [600, 8000], widthMidToSide: [0, 1] }, levelDb: -8, pan: "mono to wide" },
  { id: "c65", event: "burst bell cluster", type: "bell-cluster", frame: T.S14.burstHit, params: { bells: (["Bb5", "D6", "F6"] as const).map(bell), attackMs: 2, tauMs: 300, echoes: "quarter-note ping-pong into c01" }, levelDb: -10, pan: "wide" },
  { id: "c66", event: "burst sub bloom", type: "sub-bloom", frame: T.S14.burstHit, params: { hz: 58.27, note: "Bb1", attackMs: 20, tauMs: 400 }, levelDb: -8, pan: "mono" },
  {
    id: "c67", event: "7 shards fly", type: "glints", frame: SOUND.glints[0], frames: Array.from({ length: 7 }, (_, i) => SOUND.glints[0] + i),
    params: { hzRange: [3100, 6200], ms: 20, scale: "E-flat pentatonic partials", order: T.S1.fling.order },
    levelDb: -26, pan: (T.S1.fling.order as readonly ShardId[]).map((id) => Math.round(SHARDS[id].u.x * 80)),
  },
  { id: "c68", event: "photo rises from R", type: "paper-puff", frame: SOUND.photoPuff[0], endFrame: SOUND.photoPuff[1], params: { bandHz: [1000, 4000], ms: 120, softAttack: true }, levelDb: -26, pan: 0 },
];

cues.sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));

const music = {
  harmony: MUSIC.harmony,
  master: MUSIC.master,
  levelsDb: MUSIC.levelsDb,
  bell: MUSIC.bell,
  bars: MUSIC.bars.map((b) => ({
    ...b,
    from: bar(b.bar),
    to: bar(b.bar + 1) - 1,
    lead: b.lead.map((n) => ({ ...n, midi: NOTE[n.note], hz: hz(n.note) })),
  })),
};

/** Picture events the score (audio/music.py) writes against, in film frames. */
const MARKS = {
  fling: T.S1.fling.start, cardDrop: T.S2.drop, uploadPress: T.S3.uploadPress, uploaded: T.S3.uploaded[0], push: T.S4.push[0],
  fullBleed: T.S4.fullBleed, snap: T.S6.snapHit, crop: T.S6.crop[0], round: T.S6.round[0], fileWord: K.K2.steps[2].at,
  swaps: T.S7.swaps, cacheIn: CACHE.chipIn[0], cacheFirst: CACHE.first[1], reload: CACHE.reload[0], cached: CACHE.second[0],
  drop: T.S8.drop, whip: T.S9.whip[0], land: T.S10.land[0], count1: T.S10.count1[1], flip: T.S10.flip[0], smaller: K.K5.steps[0].at,
  pan: T.S11.pan[0], processing: T.S11.processing[0], resolve: T.S11.resolve, landings: T.S12.landings, topShard: T.S12.topShard,
  lockup: T.S13.toLockup[0], formed: T.S13.formed, exit: T.S14.exit[0], burst: T.S14.burstHit,
};
export const CUES = { marks: MARKS, fps: FPS, bpm: BPM, frames: FRAMES, sampleRate: SAMPLE_RATE, samplesPerFrame: SAMPLES_PER_FRAME, music, sfx: cues };
export const cuesJson = () => JSON.stringify(CUES, null, 2) + "\n";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "cues.json");
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(out, cuesJson());
  console.log(`wrote ${out}: ${cues.length} sfx cues, ${music.bars.length} bars`);
}
