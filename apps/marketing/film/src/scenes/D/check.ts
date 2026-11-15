// Scene D self-check (geometry continuity at every hand-off inside the scene). Run: npx tsx src/scenes/D/check.ts
import assert from "node:assert/strict";
import { PLACEMENTS, markBox, type Placement } from "../../lib/shards";
import { MAX_R_DIST } from "../../components/Mark";
import { T } from "../../timeline";
import {
  CTA_BOX,
  FLY_IDS,
  FLOOD_R_END,
  G_RECT,
  SEAT_S,
  STENCIL,
  STENCIL_RECT,
  HUB_R,
  cameraAtD,
  floodR,
  gCropAt,
  stencilPlacementAt,
  stencilZ,
  cursorAtD,
  cursorPos,
  flightAt,
  lockupAt,
  markPlacementAt,
  morphAt,
  selectionRectAt,
  shardRect,
} from "./geometry";

const near = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b}`);
const samePlacement = (a: Placement, b: Placement, eps: number, what: string) => {
  near(a.k, b.k, eps / 100, `${what} k`);
  near(a.origin.x, b.origin.x, eps, `${what} x`);
  near(a.origin.y, b.origin.y, eps, `${what} y`);
};
const S12 = T.S12,
  S13 = T.S13,
  S14 = T.S14;

// flights land on the seat rect with the stencil alignment (last flight frame within a few px, FLY settles)
for (const id of FLY_IDS) {
  const L = S12.flights[id][1];
  const last = flightAt(id, L - 1)!;
  const seat = shardRect(id, SEAT_S);
  for (const k of ["x", "y", "w", "h"] as const) near(last.rect[k], seat[k], 3, `${id} rect.${k} at f${L - 1}`);
  for (const k of ["x", "y", "w", "h"] as const) near(last.img[k], STENCIL_RECT[k], 6, `${id} img.${k} at f${L - 1}`);
  assert.equal(flightAt(id, L), null, `${id} flight gone on its landing frame`);
  // mid-flight the image always covers the card (no empty chrome box); c_pad only from its landing
  for (let f = S12.flights[id][0]; f < L; f++) {
    const fl = flightAt(id, f)!;
    if (fl.pad && f < L - 1) continue;
    const { rect: r, img: i } = fl;
    assert.ok(i.x <= r.x + 0.01 && i.y <= r.y + 0.01 && i.x + i.w >= r.x + r.w - 0.01 && i.y + i.h >= r.y + r.h - 0.01, `${id} image covers its card at f${f}`);
  }
}
// G: the morph ends on G's bbox
const gm = morphAt(S12.topShard - 1)!;
for (const k of ["x", "y", "w", "h"] as const) near(gm.rect[k], G_RECT[k], 1, `G rect.${k}`);
assert.equal(gm.stencil, 1, "video fully crossfaded to the stencil before G lands");
// the flood covers every outline point with the whole feather inside
assert.ok(FLOOD_R_END - S12.floodFeather >= MAX_R_DIST * STENCIL.k, "flood covers the mark");
// mark placement is continuous at every internal key
samePlacement(markPlacementAt(S13.toLockup[0]), stencilPlacementAt(S13.toLockup[0]), 1e-6, "f926 = drifted stencil");
near(stencilZ(S12.drift[0]), 1, 1e-9, "drift starts at 1");
near(stencilZ(S12.drift[1]), S12.driftZ[1], 1e-9, "drift ends at driftZ");
// the flood starts on the hub rim (no red on any shard on its first frame)
near(floodR(S12.flood[0]), HUB_R, 1e-9, "flood starts at the hub");
assert.ok(HUB_R > 100 && HUB_R < 115, `hub radius ${HUB_R}`);
// G crop: p = 0 is G's bbox rectangle, p = 1 is G's own outline (hand-over to MarkShards on topShard)
assert.equal(gCropAt(S12.gCrop[0]), 0);
assert.equal(gCropAt(S12.topShard), 1);
// the morph clears the lower-shard zone (top of E / F) before E lands
const lowTop = Math.min(...FLY_IDS.map((id) => shardRect(id).y));
const clear = morphAt(S12.flights.E[1] - 9)!.rect;
assert.ok(clear.y + clear.h < lowTop, `morph card bottom ${clear.y + clear.h} above the lower shards ${lowTop} at f${S12.flights.E[1] - 9}`);
samePlacement(markPlacementAt(S13.toLockup[1] - 1), PLACEMENTS.lockup, 1.5, "f955 ~ lockup");
samePlacement(markPlacementAt(S13.toLockup[1]), PLACEMENTS.lockup, 1e-6, "f956 = lockup");
samePlacement(markPlacementAt(S14.recentre[0]), lockupAt(S14.recentre[0]), 1e-6, "f1044 = zoomed lockup");
samePlacement(markPlacementAt(S14.recentre[1]), PLACEMENTS.preburst, 1e-6, "f1056 = preburst (F0Tableau takes over)");
// camera back to identity before the burst; selection only on its three frames
const cam = cameraAtD(S14.recentre[1])!;
near(cam.zoom, 1, 1e-9, "camera identity at f1056");
assert.equal(cameraAtD(S14.recentre[1] + 1), null);
assert.equal(selectionRectAt(S14.selLeft - 1), null);
assert.equal(selectionRectAt(S14.blink), null);
const sel = selectionRectAt(S14.selRightBottom)!;
const want = markBox(PLACEMENTS.preburst, S14.selectionPad);
near(sel.x, want.x, 1e-6, "selection x");
near(sel.w, want.w, 1e-6, "selection w");
// hover: the tip is inside the (zoomed) pill on the hover frame and at the press
const pill = CTA_BOX();
const z = lockupAt(S13.hover).k / PLACEMENTS.lockup.k;
const A = S13.zoomAnchor;
const zp = { x: A.x + z * (pill.x - A.x), y: A.y + z * (pill.y - A.y), w: pill.w * z, h: pill.h * z };
for (const f of [S13.hover, S13.press]) {
  const c = cursorPos(f);
  assert.ok(c.x > zp.x && c.x < zp.x + zp.w && c.y > zp.y && c.y < zp.y + zp.h, `cursor inside the pill at f${f}`);
}
// the cursor has left the frame when its layer ends
assert.equal(cursorAtD(S14.cursorOut[1]), null, "cursor off frame at f1060");
console.log("scene D checks ok", { floodREnd: FLOOD_R_END, pillW: pill.w.toFixed(1) });
