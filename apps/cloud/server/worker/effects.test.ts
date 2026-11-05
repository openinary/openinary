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
  // rejected by both
  "e_vignette",
  "e_blur:0",
  "e_tint:50.5:blue",
  "o_101",
  "co_notacolor",
  "e_fill_light:101",
]) {
  assert.equal(isTransformSegment(segment), coreAccepts(segment), `disagree on ${segment}`);
  if (!coreAccepts(segment)) continue;
  assert.equal(
    generateCacheKey(FILE, toCloudCacheParams(coreParseParams(`/t/${segment}/${FILE}`))),
    generateCacheKey(FILE, parseParams(`/t/${segment}/${FILE}`)),
    `fallback key drifted for ${segment}`,
  );
}

assert.deepEqual(parseParams("/t/e_fill_light:70:20,e_blur,o_40,co_red/a.jpg"), {
  effects: "fill_light:70:20,blur",
  opacity: "40",
  color: "#ff0000",
});

console.log("effects: worker and core agree on e_/o_/co_");
