// Run with: npx tsx worker/effects.test.ts
//
// Effects (e_, o_, co_; core's effects commit) on Cloud. Pins:
//  - worker/effect-spec.ts is still a verbatim copy of core's,
//  - the Worker and core agree on which segments are transforms (a segment
//    only one side accepts either 404s on Cloud or forwards a folder name),
//  - toCloudCacheParams(core params) lands on the Worker's cache key, so a
//    request with effects is cached under one key on both sides.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseParams as coreParseParams } from "@openinary/core";
import { toCloudCacheParams } from "../api/lib/cache-params.js";
import { scopeCdnOverlay } from "./overlay.js";
import { generateCacheKey, isTransformSegment, parseParams } from "./transform-cache.js";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
assert.equal(
  readFileSync(here("./effect-spec.ts"), "utf8"),
  readFileSync(here("../../../../packages/core/src/utils/image/effect-spec.ts"), "utf8"),
  "worker/effect-spec.ts drifted from packages/core/src/utils/image/effect-spec.ts",
);

const FILE = "ugc/user_123/bucket_abc/a/photo.jpg";
const coreAccepts = (segment: string) =>
  Object.keys(coreParseParams(`/t/${segment}/a/photo.jpg`)).length > 0;
// What core keys on: TransformService takes d_ out before anything is keyed.
const coreKeyParams = (path: string) => {
  const params = coreParseParams(path) as Record<string, unknown>;
  delete params.defaultImage;
  return toCloudCacheParams(params);
};

for (const segment of [
  "e_fill_light",
  "e_fill_light:70:20,w_400",
  "w_400,e_blur:300,e_grayscale",
  "e_contrast:level_150;type_linear",
  "e_tint:equalize:80:red:blue:20p",
  "co_darkviolet,e_colorize:35",
  "co_rgb:20a020,e_colorize",
  "o_40,b_white",
  "e_trim:50:yellow",
  "c_pad,w_300,h_100,b_auto",
  "c_pad,w_300,h_100,b_auto:predominant_gradient_contrast:4",
  "c_pad,b_auto:border:palette_red_00ff00",
  "b_rgb:ABCDEF",
  "bg_red",
  "b_rgb:12345",
  "dpr_2,w_400,h_300",
  "w_400,dpr_1.5,c_fill",
  "a_hflip",
  "a_vflip.45,w_100",
  "a_90.hflip",
  "a_ignore",
  "a_ignore,w_100",
  "a_hflip.ignore.90",
  "c_lfill,w_100,h_100",
  "c_lpad,w_200,h_100,b_auto",
  "c_mfit,w_300",
  "c_mpad,w_300,h_300",
  "w_100,bo_4px_solid_red",
  "bo_60px_solid_rgb:00390b60",
  "c_pad,w_300,h_100,b_blurred:400:15",
  "w_100,d_placeholders:avatar.png",
  // rejected by both
  "e_vignette",
  "e_blur:0",
  "e_tint:50.5:blue",
  "o_101",
  "co_notacolor",
  "e_fill_light:101",
  "b_auto:middle",
  "b_auto:border:palette_nope",
  "b_notacolor",
  "dpr_6",
  "dpr_0",
  "a_hflip.png",
  "a_sideways",
  "bo_4px_dashed_red",
  "b_blurred:0",
  "d_..:secret.png",
]) {
  assert.equal(isTransformSegment(segment), coreAccepts(segment), `disagree on ${segment}`);
  if (!coreAccepts(segment)) continue;
  assert.equal(
    generateCacheKey(FILE, coreKeyParams(`/t/${segment}/${FILE}`)),
    generateCacheKey(FILE, parseParams(`/t/${segment}/${FILE}`)),
    `fallback key drifted for ${segment}`,
  );
}

assert.deepEqual(parseParams("/t/e_fill_light:70:20,e_blur,o_40,co_red/a.jpg"), {
  effects: "fill_light:70:20,blur",
  opacity: "40",
  color: "#ff0000",
});

// b_ values that existed before b_auto keep their exact params (cache keys).
assert.equal(parseParams("/t/b_rgb:ABCDEF/a.jpg").background, "#ABCDEF");
assert.equal(parseParams("/t/bg_white/a.jpg").background, "#ffffff");
assert.equal(parseParams("/t/b_auto:predominant/a.jpg").background, "auto:predominant");

// dpr_ shares the scaled URL's key; a_ and c_ values that existed keep theirs.
assert.deepEqual(parseParams("/t/dpr_2,w_400/a.jpg"), parseParams("/t/w_800/a.jpg"));
assert.equal(parseParams("/t/a_auto/a.jpg").rotate, "auto");
assert.equal(parseParams("/t/a_-90/a.jpg").rotate, "-90");
assert.equal(parseParams("/t/c_lpad,w_10/a.jpg").crop, "pad");
assert.equal(parseParams("/t/c_pad,w_10/a.jpg").resizeLimit, undefined);
// A root file named like a transform is still a file.
assert.equal(isTransformSegment("a_hflip.png"), false);
assert.equal(isTransformSegment("dpr_2.png"), false);

// d_ never reaches the container: its path is not tenant-scoped.
{
  const scoped = (path: string) => {
    const result = scopeCdnOverlay(
      new URL(`https://cdn.example${path}`),
      "bucket_abc",
      "ugc/user_123/bucket_abc",
    );
    assert.ok(result.ok);
    return result.ok ? result.url.pathname : "";
  };
  assert.equal(
    scoped("/b/bucket_abc/t/w_100,d_ugc:other:bucket:secret.png/a.jpg"),
    "/b/bucket_abc/t/w_100/a.jpg",
  );
  assert.equal(scoped("/b/bucket_abc/t/d_avatar.png/a.jpg"), "/b/bucket_abc/t/a.jpg");
  assert.equal(scoped("/b/bucket_abc/t/w_100/a.jpg"), "/b/bucket_abc/t/w_100/a.jpg");
  assert.equal(parseParams("/t/w_100,d_avatar.png/a.jpg").defaultImage, undefined);
}

console.log("effects: worker and core agree on e_/o_/co_/b_/a_/dpr_/c_/bo_/d_");
