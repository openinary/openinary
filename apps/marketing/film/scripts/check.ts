// Self-checks (assert-based). Run: npx tsx scripts/check.ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { R, R_RESIDUALS, SHARD_IDS, PLACEMENTS, F0_STATE, shardScreenBBox, rScreen } from "../src/lib/shards";
import { ALL_SEGMENTS, BYTES, CTA, RAIL, S7_STATES, SOURCE, TYPING, formatBytes, outputOf, pillUrl } from "../src/lib/variants";
import { compile } from "../src/lib/type";
import { LETTERS } from "../src/lib/wordmark";
import { CACHE, FRAMES, FRAME_LINE, K, rt, SLOT_WORDS, T } from "../src/timeline";
import { cuesJson } from "./export-cues";
import * as ICONS from "../src/lib/icons";
import { framingAt, framingCamera, viewportAt } from "../src/lib/framing";
import { E, tween } from "../src/lib/ease";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (label: string) => {
  n++;
  console.log(`ok ${n} ${label}`);
};

// 1. Ray origin recomputed from the logo geometry.
assert.ok(Math.abs(R.x - 51.22) < 0.01 && Math.abs(R.y - 55.41) < 0.01, `R = ${R.x}, ${R.y}`);
assert.ok(Math.max(...R_RESIDUALS) < 0.05, `midline residuals ${R_RESIDUALS}`);
ok(`R = (${R.x.toFixed(3)}, ${R.y.toFixed(3)}), max midline residual ${Math.max(...R_RESIDUALS).toFixed(4)}`);

// 2. F0: R at (960, 720), every shard inside the frame line (>= 24 px margin), clear of the card + chip.
const r0 = rScreen(PLACEMENTS.F0);
assert.ok(Math.abs(r0.x - 960) < 1e-9 && Math.abs(r0.y - 720) < 1e-9);
const card = { x0: 720, y0: 540, x1: 1200, y1: 960 }; // card 480x360 on R + chip (top 916, h 44)
for (const id of SHARD_IDS) {
  const b = shardScreenBBox(id, PLACEMENTS.F0, F0_STATE[id]);
  const m = Math.min(b.x0 - FRAME_LINE.x0, b.y0 - FRAME_LINE.y0, FRAME_LINE.x1 - b.x1, FRAME_LINE.y1 - b.y1);
  assert.ok(m >= 24, `${id} margin ${m}`);
  const overlap = b.x0 < card.x1 && b.x1 > card.x0 && b.y0 < card.y1 && b.y1 > card.y0;
  assert.ok(!overlap, `${id} overlaps the card or chip`);
}
ok("F0: R on (960, 720); shards inside the frame line (>= 24 px) and clear of the card + chip");

// 3. No em dash / en dash (or figure dash / horizontal bar) anywhere we author.
const DASH = new RegExp(`[${[0x2012, 0x2013, 0x2014, 0x2015].map((c) => String.fromCharCode(c)).join("")}]`);
const walk = (p: string): string[] =>
  statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.(tsx?|json|md|py)$/.test(p) ? [p] : [];
const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts")), join(ROOT, "public", "cues.json"), join(ROOT, "BUILDERS.md")].filter(existsSync);
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const i = text.search(DASH);
  assert.ok(i < 0, `dash in ${f} at ${i}: ${text.slice(Math.max(0, i - 30), i + 30)}`);
  assert.ok(!DASH.test(f), `dash in file name ${f}`);
}
ok(`no em/en dash in ${files.length} files`);

// 4. URL grammar (packages/core/src/utils/parser.ts TRANSFORM_VALUE_PATTERNS, brand.md section 3).
const P: Record<string, RegExp> = {
  w: /^\d+$|^auto$/, h: /^\d+$|^auto$/,
  c: /^(fill|lfill|fill_pad|fit|limit|mfit|scale|crop|thumb|pad|lpad)$/,
  g: /^(center|c|north(?:_center)?|n|south(?:_center)?|s|east|e|west|w|faces?(?:_center)?|auto)$/,
  q: /^\d+$|^auto$/, f: /^(webp|jpe?g|png|avif|gif|mp4|webm|mov|auto)$/, a: /^-?\d+$|^auto$/,
  ar: /^\d+:\d+$|^\d+(?:\.\d+)?$/,
  b: /^(transparent|white|black|rgb:[0-9a-fA-F]{3,8}|#?[0-9a-fA-F]{3,8})$/,
  bg: /^(transparent|white|black|rgb:[0-9a-fA-F]{3,8}|#?[0-9a-fA-F]{3,8})$/,
  so: /^\d+(?:\.\d+)?$/, eo: /^\d+(?:\.\d+)?$/, t: /^(true|1|\d+)$/, tt: /^\d+(?:\.\d+)?$/, r: /^max$|^\d+(?::\d+){0,3}$/,
};
const isTransformSegment = (seg: string) =>
  !!seg && !seg.includes(".") && seg.split(",").filter(Boolean).length > 0 &&
  seg.split(",").filter(Boolean).every((part) => {
    const i = part.indexOf("_");
    if (i < 1) return false;
    const re = P[part.slice(0, i)];
    return !!re && !!part.slice(i + 1) && re.test(part.slice(i + 1));
  });
for (const seg of ALL_SEGMENTS) assert.ok(isTransformSegment(seg), `invalid segment ${seg}`);
for (const seg of TYPING) {
  const url = pillUrl(seg);
  const parts = url.split("/");
  const t = parts.indexOf("t");
  assert.equal(parts[0], "cdn.openinary.dev", url);
  assert.equal(parts[parts.length - 1], "hills.jpg", url);
  assert.ok(seg ? parts.length === t + 3 && isTransformSegment(parts[t + 1]) : parts.length === t + 2, url);
}
assert.equal(CTA.url, "app.openinary.dev");
assert.equal(CTA.sub, "free plan, no card required");
ok(`${ALL_SEGMENTS.length} transformation segments + ${TYPING.length} pill URLs valid`);

// 5. Honest outputs for the S7 states (concept A S7 table).
const dims = S7_STATES.map((s) => `${s.w}x${s.h}${s.radius ? `:${s.radius}` : ""}${s.pad ? ":pad" : ""}`);
assert.deepEqual(dims, ["600x600:max", "800x450", "480x600", "600x600:pad", "800x400", "400x600:40", "600x600", "700x500:24", "720x540:max", "600x300"]);
ok("S7 output shapes");

// 6. Byte counts and dimensions vs demo-manifest.json.
const manifest = JSON.parse(readFileSync(new URL("../../../cloud/web/src/components/playground/demo-manifest.json", import.meta.url), "utf8"));
const land = manifest.images.find((i: { role: string }) => i.role === "landscape");
assert.equal(land.original.bytes, BYTES.original);
assert.equal(land.original.bytes, SOURCE.bytes);
assert.equal(land.original.width, SOURCE.w);
assert.equal(land.original.height, SOURCE.h);
const v1500 = land.variants.find((v: { width: number }) => v.width === 1500);
assert.equal(v1500.webp.bytes, BYTES.w1500webp);
assert.equal(v1500.avif.bytes, BYTES.w1500avif);
const o = outputOf(RAIL.V1[1]);
assert.equal(`${o.w}x${o.h}`, `${v1500.width}x${v1500.height}`);
assert.equal(formatBytes(BYTES.original), "2.81 MB");
assert.equal(formatBytes(BYTES.w1500webp), "85.53 KB");
assert.equal(formatBytes(BYTES.w1500avif), "60.17 KB");
assert.equal(Math.round((1 - BYTES.w1500avif / BYTES.original) * 100), 98);
assert.equal(K.K5.steps[0].type, "98% smaller");
ok("bytes, dimensions and printed sizes match demo-manifest.json (98% smaller)");

// 7. Words: slot stays blank >= 1 f between words (K9 shares the end line with K7); wordmark split into 9 letters.
const spans = SLOT_WORDS.filter((w) => w.id !== "K9").map((w) => [compile(w).first, compile(w).exit![1]] as const).sort((a, b) => a[0] - b[0]);
for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] > spans[i - 1][1] + 1, `slot words overlap ${spans[i - 1]} ${spans[i]}`);
assert.equal(LETTERS.map((l) => l.char).join(""), "Openinary");
ok("slot words never overlap; wordmark = O p e n i n a r y");

// 8. cues.json is generated from timeline.ts and up to date; every frame inside the film.
const disk = readFileSync(join(ROOT, "public", "cues.json"), "utf8");
assert.equal(disk, cuesJson(), "public/cues.json is stale: run npx tsx scripts/export-cues.ts");
const cues = JSON.parse(disk);
for (const c of cues.sfx) for (const f of [c.frame, c.endFrame, c.peakFrame, ...(c.frames ?? [])].filter((x) => x !== undefined))
  assert.ok(f >= 0 && f < FRAMES, `${c.id} frame ${f}`);
ok(`cues.json up to date (${cues.sfx.length} sfx cues, all frames in 0..${FRAMES - 1})`);

// 9. Every icon the spec names resolves in the pinned lucide-react.
const SPEC_ICONS = ["Package", "Plug", "Image", "Video", "ChevronRight", "ChevronDown", "ChevronsUpDown", "PanelLeft", "Upload", "UploadCloud", "LayoutGrid", "List", "Square", "Folder", "FileImage", "FileVideo", "Plus", "Check", "CheckCircle2", "Link2", "ArrowUpRight", "Loader2", "X", "Play"];
for (const name of SPEC_ICONS) assert.ok((ICONS as Record<string, unknown>)[name], `icon ${name} missing`);
ok(`${SPEC_ICONS.length} lucide icons resolve`);

// 10. 16:9 framing (Film169): the master is untouched, the seam holds still, and the content extents measured on the
// master render (design px) sit inside the OUTPUT frame line with >= 24 px margin on their holds.
{
  const m = viewportAt(500);
  assert.deepEqual([m.visible, m.frameLine], [{ x: 0, y: 0, w: 1920, h: 1484 }, { x: 72, y: 72, w: 1776, h: 1340 }]);
  assert.deepEqual(framingCamera(m), { zoom: 1, tx: 0, ty: 0 });
  const f0 = framingAt(0);
  // back on F0 at the end of the recentre: the beat before the burst, the burst and the seam frames hold the framing
  for (let f = T.S14.recentre[1]; f < FRAMES; f++) assert.deepEqual(framingAt(f), f0, `seam framing f${f}`);
  const outY = (f: number, y: number) => { const c = framingCamera(viewportAt(f, "16:9")); return c.zoom * y + c.ty; };
  const inside = (f: number, y0: number, y1: number, what: string, margin = 24) => {
    const a = outY(f, y0) - FRAME_LINE.y0, b = 1080 - FRAME_LINE.y0 - outY(f, y1);
    assert.ok(a >= margin && b >= margin, `f${f} ${what}: ${a.toFixed(1)} / ${b.toFixed(1)} px inside the frame line`);
  };
  const bs = SHARD_IDS.map((id) => shardScreenBBox(id, PLACEMENTS.F0, F0_STATE[id]));
  inside(0, Math.min(...bs.map((b) => b.y0)), Math.max(...bs.map((b) => b.y1)), "F0 shards");
  inside(rt(105), 198, 1232, "upload once + dialog (its f138 pushed extent)");
  inside(rt(137.9), 1232, 1232, "pushed dialog bottom");
  // DASH1 -> DASH2 rides the dashboard push: net zoom (framing x drift) never reverses before the dive
  for (let f = rt(100), prev = 0; f <= T.S4.push[0]; f++) {
    const net = framingAt(f).s * tween(f, T.S2.drift, T.S2.driftZ, E.DRIFT);
    assert.ok(net >= prev - 1e-9, `f${f} net zoom ${net} < ${prev}`);
    prev = net;
  }
  inside(rt(162), 1031, 1417, "hills tile (click)");
  inside(rt(230), 1222, 1378, "URL pill + labels");
  for (const f of [300, 345, 400, 479].map(rt)) inside(f, 196, 1378, "slot word + pill labels");
  inside(rt(540), 605, 1240, "hero word + circle chip", 16);
  // the wall's top chip row (design y 227) stays clear of the ruler band, >= 96 px down, on the WALL hold
  for (let f = T.S8.release[1]; f <= T.S9.collapse[0]; f++) assert.ok(outY(f, 227) >= 96, `f${f} wall chip row at ${outY(f, 227).toFixed(1)}`);
  for (const f of [650, 700, 760, 800].map(rt)) inside(f, 195, 1320, "slot word + meter");
  inside(rt(900), 388, 1212, "stencil mark");
  for (const f of [990, 1044].map(rt)) inside(f, 430, 672, "end line + sub-line");
  for (const f of [CACHE.chipIn[1], CACHE.second[1], CACHE.out[0]]) inside(f, 196, CACHE.cy + 38, "cache word + timing chip", 16);
  // slot words never reach the frame line while visible, transitions included (measured tops: 195 at 168 px, 204 for K7 at 160)
  for (const w of SLOT_WORDS) {
    const top = w.size ? 204 : 195;
    for (let f = compile(w).first; f <= compile(w).exit![1]; f++) inside(f, top, top, `${w.id} top`, 16);
  }
  // the full-bleed photo (1979 x 1484 at f208, growing) covers the whole output on the FULL hold
  for (let f = rt(208); f <= rt(238); f++) {
    const v = viewportAt(f, "16:9").visible;
    assert.ok(v.x >= 960 - 1979 / 2 && v.x + v.w <= 960 + 1979 / 2 && v.y >= 0 && v.y + v.h <= 1484, `f${f} photo cover`);
  }
}
ok("16:9 framing: master identity, seam at rest, content inside the output frame line");

console.log(`\nall ${n} checks passed`);
