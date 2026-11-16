import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParams } from "./grammar";
import { legacyCloudParams, sortedKey, toLegacyCloudParams } from "./cache-key";

// Self-hosted derivatives already in storage were keyed this way; a change
// re-keys every one of them.
const PINNED: Record<string, string> = {
  "w_800": "cache/ba615cb85e7854edbf4146e3c245aae1.jpg",
  "w_800,h_600,c_fill,g_north,q_80": "cache/2a1cfe7d3baaaf6f61ec32df76df8b3b.jpg",
  "h_600,w_800,c_lfill,f_webp": "cache/bc27f46cceb420917997eb5f747223e8.jpg",
  "w_auto,h_500,q_auto,f_avif": "cache/b3c86f6fca1ba8f418ef13048c835c77.jpg",
  "a_hflip.90,dpr_2,w_400,b_auto": "cache/ea243f824f2f5a2556a2a77cd6484bdd.jpg",
  "a_auto,t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80": "cache/1b72339c738e755ed507443b704a5bca.jpg",
  "e_blur:300,e_grayscale,o_50,co_red,bo_4px_solid_red,r_max": "cache/6941909aae0a0624512f956f680eefa5.jpg",
  "l_brand:logo.png,lx_10,ly_20,lo_50,lw_200,lg_south_east,lt_1,ls_5": "cache/6edde73c00922ea469ce32f6a6d3e1fe.jpg",
  "so_2,eo_10,f_mp4,w_720": "cache/3e2effb405a6ff49c3673d5469793813.jpg",
  "ar_16:9,c_pad,bg_white,a_ignore": "cache/43c86881489830af52ebe6bcf3160f24.jpg",
};

test("self-hosted keys stay byte-identical", () => {
  for (const [segment, key] of Object.entries(PINNED)) {
    assert.equal(sortedKey("photos/La Marée.jpg", parseParams(`/t/${segment}/x`)), key, segment);
  }
});

test("self-hosted keys do not depend on param order", () => {
  assert.equal(
    sortedKey("blue.mp4", { width: 320, overlayPath: "wm.png" }),
    sortedKey("blue.mp4", { overlayPath: "wm.png", width: 320 }),
  );
});

test("typed params convert back to the cloud shape where the parser is lossless", () => {
  for (const segment of Object.keys(PINNED)) {
    if (/w_auto|a_auto/.test(segment)) continue; // lossy in the typed parser
    assert.deepEqual(
      JSON.stringify(toLegacyCloudParams(parseParams(`/t/${segment}/x`))),
      JSON.stringify(legacyCloudParams(`/t/${segment}/x`)),
      segment,
    );
  }
});
