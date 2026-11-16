// Effects (e_, o_, co_), backgrounds, angles, dpr_, borders and d_ on Cloud.
// Pins that the restart fallback (toLegacyCloudParams over core's typed
// params) lands on the key the Worker computes, and the legacy param shapes
// existing cache keys hash.

import assert from "node:assert/strict";
import {
  isTransformSegment,
  legacyCloudKey,
  legacyCloudParams,
  parseParams as coreParseParams,
  toLegacyCloudParams,
} from "@openinary/core/url";
import { scopeCdnOverlay } from "./overlay.js";
import { parseCdnPath, upstreamPath } from "./path.js";

const FILE = "ugc/user_123/bucket_abc/a/photo.jpg";
// What core keys on: TransformService takes d_ out before anything is keyed.
const coreKeyParams = (path: string) => {
  const params = coreParseParams(path) as Record<string, unknown>;
  delete params.defaultImage;
  return toLegacyCloudParams(params);
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
  // not transforms
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
  if (!isTransformSegment(segment)) continue;
  assert.equal(
    legacyCloudKey(FILE, coreKeyParams(`/t/${segment}/${FILE}`)),
    legacyCloudKey(FILE, legacyCloudParams(`/t/${segment}/${FILE}`)),
    `fallback key drifted for ${segment}`,
  );
}

assert.deepEqual(legacyCloudParams("/t/e_fill_light:70:20,e_blur,o_40,co_red/a.jpg"), {
  effects: "fill_light:70:20,blur",
  opacity: "40",
  color: "#ff0000",
});

// b_ values that existed before b_auto keep their exact params (cache keys).
assert.equal(legacyCloudParams("/t/b_rgb:ABCDEF/a.jpg").background, "#ABCDEF");
assert.equal(legacyCloudParams("/t/bg_white/a.jpg").background, "#ffffff");
assert.equal(legacyCloudParams("/t/b_auto:predominant/a.jpg").background, "auto:predominant");

// dpr_ shares the scaled URL's key; a_ and c_ values that existed keep theirs.
assert.deepEqual(legacyCloudParams("/t/dpr_2,w_400/a.jpg"), legacyCloudParams("/t/w_800/a.jpg"));
assert.equal(legacyCloudParams("/t/a_auto/a.jpg").rotate, "auto");
assert.equal(legacyCloudParams("/t/a_-90/a.jpg").rotate, "-90");
assert.equal(legacyCloudParams("/t/c_lpad,w_10/a.jpg").crop, "pad");
assert.equal(legacyCloudParams("/t/c_pad,w_10/a.jpg").resizeLimit, undefined);
// A root file named like a transform is still a file.
assert.equal(isTransformSegment("a_hflip.png"), false);
assert.equal(isTransformSegment("dpr_2.png"), false);

// d_ never reaches the container: its path is not tenant-scoped.
{
  // What the container is sent for each URL.
  const forwarded = (path: string) => {
    const root = "ugc/user_123/bucket_abc";
    const result = scopeCdnOverlay(parseCdnPath(path)!, root);
    assert.ok(result.ok);
    return result.ok ? upstreamPath(result.path, root) : "";
  };
  assert.equal(
    forwarded("/b/bucket_abc/t/w_100,d_ugc:other:bucket:secret.png/a.jpg"),
    "/t/w_100/ugc/user_123/bucket_abc/a.jpg",
  );
  assert.equal(
    forwarded("/b/bucket_abc/t/d_avatar.png/a.jpg"),
    "/t/ugc/user_123/bucket_abc/a.jpg",
  );
  assert.equal(
    forwarded("/b/bucket_abc/t/w_100/a.jpg"),
    "/t/w_100/ugc/user_123/bucket_abc/a.jpg",
  );
  assert.equal(legacyCloudParams("/t/w_100,d_avatar.png/a.jpg").defaultImage, undefined);
}

console.log("effects: fallback keys and legacy shapes hold for e_/o_/co_/b_/a_/dpr_/c_/bo_/d_");
