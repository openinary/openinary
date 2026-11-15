// The dashboard-thumbnail contract has no fallback: cdn/serve.ts answers a
// cache miss on these segments with a 404 instead of the container, so if the
// key the /thumbnail upload writes under ever stops matching the key the CDN
// looks up, every dashboard preview 404s permanently and silently. That
// agreement is what this pins.

import assert from "node:assert/strict";
import {
  dashboardThumbSegments,
  legacyCloudKey,
  legacyCloudParams,
  isTransformSegment,
  parseParams as coreParseParams,
} from "@openinary/core/url";
import {
  dashboardThumbParams,
  isDashboardThumbSegment,
  thumbnailCacheKey,
} from "./dashboard-thumbs.js";
import { resolveStatusTarget } from "./overlay.js";
import { parseCdnPath, resolveAutoFormat } from "./path.js";


const TENANT_ROOT = "ugc/user_123/bucket_abc";

// The CDN's side: parse the request URL the way the Worker sees it -
// percent-encoded by the browser - then, because the segment is a dashboard
// one, key on the canonical params rather than its own. The upload route
// stores the decoded name, so a file called "La Marée.png" is where the two
// sides drift apart if that decoding is ever dropped.
function keyForRequest(
  segment: string,
  relativePath: string,
  isImage: boolean,
): string {
  const path = parseCdnPath(
    `/b/bucket_abc/t/${segment}/${relativePath.split("/").map(encodeURIComponent).join("/")}`,
  );
  assert.equal(path?.transform, segment, `${segment} is not recognised as a transform segment`);
  return legacyCloudKey(`${TENANT_ROOT}/${path!.relativePath}`, dashboardThumbParams(isImage));
}

function keyForUpload(relativePath: string, isImage: boolean): string {
  return thumbnailCacheKey(`${TENANT_ROOT}/${relativePath}`, isImage);
}

for (const [segments, file, isImage] of [
  [dashboardThumbSegments("image"), "photos/holiday.jpg", true],
  [dashboardThumbSegments("video"), "clips/demo.mp4", false],
  // Spaces and accents survive the browser's percent-encoding round trip.
  [dashboardThumbSegments("image"), "clients/La Marée - logo.png", true],
] as const) {
  // Whichever of the four sizes the dashboard asks for, it must land on the
  // one object the client uploaded - the whole point of the collapse, and a
  // 404 with no container fallback if it ever stops holding.
  const keys = new Set(
    segments.map((segment) => keyForRequest(segment, file, isImage)),
  );
  assert.equal(keys.size, 1, `${file} resolves to ${keys.size} keys, not 1`);
  assert.ok(
    keys.has(keyForUpload(file, isImage)),
    `upload key mismatch for ${file}`,
  );
  for (const segment of segments) {
    assert.ok(
      isDashboardThumbSegment(segment),
      `"${segment}" not covered by the 404-instead-of-container guard`,
    );
  }
}

// Both kinds resolve to webp, the one format the client encodes - the whole
// point of pinning it instead of negotiating it.
assert.equal(dashboardThumbParams(true).format, "webp");
assert.equal(dashboardThumbParams(false).format, "webp");

// Images and videos must NOT share a param set: a video's thumbnail key is
// then md5(path + image-shaped params), which is exactly the key the
// container would write a real /t/w_500,h_500,q_80/clip.mp4 transcode under -
// the thumbnail and the transcode would overwrite each other.
assert.notDeepEqual(dashboardThumbParams(true), dashboardThumbParams(false));

// Video transforms: the cache key is order-sensitive, and the container
// round-trips the params through video_job.params_json before computing it
// (VideoWorker does JSON.parse(job.params_json) -> storage.upload). So the
// string PgVideoJobStore persists must be JSON.stringify verbatim - sorting
// the keys, as it once did, wrote the transform under a key neither this file
// nor core ever computes, and core's "completed but cache missing" branch then
// re-queued the job on every request: an endless re-encode, billed each time.
const videoParams = legacyCloudParams("/t/w_303,h_100/clip.mp4");
const VIDEO_PATH = `${TENANT_ROOT}/clip.mp4`;
assert.equal(
  JSON.stringify(videoParams),
  '{"width":"303","height":"100","resize":"303x100"}',
);
// A verbatim round trip through the DB column lands on the same key.
assert.equal(
  legacyCloudKey(VIDEO_PATH, JSON.parse(JSON.stringify(videoParams))),
  legacyCloudKey(VIDEO_PATH, videoParams),
);
// Any reordering does not - this is the trap, not a theoretical one.
assert.notEqual(
  legacyCloudKey(
    VIDEO_PATH,
    Object.fromEntries(
      Object.entries(videoParams).sort(([a], [b]) => a.localeCompare(b)),
    ),
  ),
  legacyCloudKey(VIDEO_PATH, videoParams),
);

// A normal customer-facing transform must NOT be caught by the guard, or it
// would 404 instead of reaching the container.
assert.equal(isDashboardThumbSegment("w_800,h_600,c_fit"), false);
assert.equal(isDashboardThumbSegment("w_500,h_500,q_81"), false);

// The Worker used to treat any "." outside l_/d_/a_/dpr_ as a file name, so
// so_1.5, tt_1.5, eo_2.5 and ar_1.5 were folders to it and transforms to the
// container: the CDN looked up, metered and scoped the wrong path. It now
// follows core's grammar.
for (const segment of ["so_1.5", "ar_1.5", "tt_1.5,t_true", "eo_2.5,so_1"]) {
  assert.ok(isTransformSegment(segment), segment);
  assert.notDeepEqual(legacyCloudParams(`/t/${segment}/clip.mp4`), {}, segment);
}
assert.equal(legacyCloudParams("/t/so_1.5/clip.mp4").startOffset, "1.5");

// f_auto is resolved by the Worker instead of being forwarded, so the key
// the R2 lookup computes (params with the negotiated format spread in
// place) has to be the key core computes from the segment the container is
// actually sent. legacyCloudKey hashes JSON.stringify with no key sorting, so
// this is the same order trap as the video params above, and the reason the
// rewrite overwrites format in place rather than appending it.
for (const [segment, format] of [
  ["f_auto", "avif"],
  ["w_500,f_auto,q_80", "webp"],
  ["f_auto,w_500", "jpeg"],
] as const) {
  const path = `/t/${segment}/cow.png`;
  const IMAGE_PATH = `${TENANT_ROOT}/cow.png`;
  assert.equal(legacyCloudParams(path).format, "auto", `${segment} lost its f_auto`);
  assert.equal(
    legacyCloudKey(IMAGE_PATH, { ...legacyCloudParams(path), format }),
    legacyCloudKey(IMAGE_PATH, legacyCloudParams(`/t/${resolveAutoFormat(segment, format)}/cow.png`)),
    `f_auto key drift for ${segment}`,
  );
}

// Every format negotiatedFormat can return must still be a value f_ accepts, or
// the resolved segment stops parsing as a transform and 404s as a path segment.
for (const format of ["avif", "webp", "png", "jpeg"])
  assert.ok(isTransformSegment(`f_${format}`), `f_${format} no longer parses`);

// Only a transform segment is resolved: a file may legitimately be named
// f_auto.png, and a bare URL has no segment to resolve at all.
assert.equal(parseCdnPath("/b/x/t/f_auto.png")?.transform, "");
assert.equal(parseCdnPath("/b/x/t/w_100/f_auto.png")?.transform, "w_100");

// /video-status has to land on the job and cache key the matching /t/ URL
// wrote: the transform segment goes into params, never into the file path.
// Keeping it in the path made every status URL with params answer not_found.
{
  const { filePath, params } = resolveStatusTarget(
    "ugc/user_123/bucket_abc",
    "w_720,h_720,c_fill,q_80,f_webm/Videos/flowers.mp4",
  );
  assert.equal(filePath, "ugc/user_123/bucket_abc/Videos/flowers.mp4");
  assert.deepEqual(
    params,
    legacyCloudParams("/t/w_720,h_720,c_fill,q_80,f_webm/Videos/flowers.mp4"),
  );
  assert.equal(
    JSON.stringify(params),
    '{"quality":"80","format":"webm","width":"720","height":"720","resize":"720x720","crop":"fill"}',
  );
  // A folder that merely looks like a transform key stays part of the path.
  const plain = resolveStatusTarget("ugc/u/b", "w_photos/clip.mp4");
  assert.equal(plain.filePath, "ugc/u/b/w_photos/clip.mp4");
  assert.deepEqual(plain.params, {});
}

// video_job rows hold core's params as the container parsed the URL it was
// forwarded; /video-status must look the row up with exactly that JSON, d_
// excluded (the container drops it before enqueueing).
{
  const { filePath, jobParams } = resolveStatusTarget(
    "ugc/u/b",
    "w_720,h_720,c_fill,q_80,f_webm,d_x.png/clip.mp4",
  );
  assert.equal(filePath, "ugc/u/b/clip.mp4");
  assert.equal(
    JSON.stringify(jobParams),
    JSON.stringify(coreParseParams("/t/w_720,h_720,c_fill,q_80,f_webm/clip.mp4")),
  );
}

// Every derivative already in Cloud's R2 sits under a key in the legacy
// format (insertion order, every param a string). A change to either half
// re-keys those objects: one re-transform, and one re-bill, per derivative
// ever served. These keys were computed before the parser moved into
// @openinary/core/url and must never change.
{
  const ROOT = "ugc/user_123/bucket_abc";
  const PINNED: Record<string, string> = {
    "w_800": "cache/a271f7529d15fe25b20f3acee7e11eb9.jpg",
    "w_800,h_600,c_fill,g_north,q_80": "cache/55f74dee0cab05ef028e9f18563a38ac.jpg",
    "h_600,w_800,c_lfill,f_webp": "cache/de7afbd2d9e7e5bb98acce2c95528b39.jpg",
    "w_auto,h_500,q_auto,f_avif": "cache/18b8408a7a3206ab5c276904b283a8de.jpg",
    "a_hflip.90,dpr_2,w_400,b_auto": "cache/6fc98b5c8c153ab71ebbeca51bd53f8c.jpg",
    "a_auto,t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80": "cache/3e3f3c61de5a99c8bb058c83b9d5483f.jpg",
    "e_blur:300,e_grayscale,o_50,co_red,bo_4px_solid_red,r_max": "cache/a3407cf11bb166cac3e40df25e836744.jpg",
    "l_brand:logo.png,lx_10,ly_20,lo_50,lw_200,lg_south_east,lt_1,ls_5": "cache/2957b59d5a279362db8fb84530fedd88.jpg",
    "so_2,eo_10,f_mp4,w_720": "cache/05d6f91fa725a467f2f036fdca2aae5d.jpg",
    "ar_16:9,c_pad,bg_white,a_ignore": "cache/016153d65b53832eb7ca6782354edfae.jpg",
  };

  for (const [segment, key] of Object.entries(PINNED)) {
    assert.equal(
      legacyCloudKey(`${ROOT}/photos/La Marée.jpg`, legacyCloudParams(`/t/${segment}/x`)),
      key,
      segment,
    );
  }
  assert.equal(
    legacyCloudKey(`${ROOT}/a.png`, dashboardThumbParams(true)),
    "cache/640708c0d765c5774bc858649065649a.png",
  );
  assert.equal(
    legacyCloudKey(`${ROOT}/a.mp4`, dashboardThumbParams(false)),
    "cache/4c37c81c199477d2314f8146735dd2c1.mp4",
  );
}

console.log("cache-keys: ok");
