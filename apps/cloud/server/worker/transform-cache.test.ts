// Run with: pnpm -F server test
//
// The dashboard-thumbnail contract has no fallback: worker/index.ts answers
// a cache miss on these segments with a 404 instead of the container, so if
// the key worker/app.ts writes under ever stops matching the key
// tryServeFromR2Cache looks up, every dashboard preview 404s permanently and
// silently. That agreement is what this pins.

import assert from "node:assert/strict";
// The real package: fine here (tsx under Node - sharp et al. load normally),
// forbidden in worker/*.ts itself (see transform-cache.ts's header).
import {
  ALLOWED_UPLOAD_TYPES as CORE_ALLOWED_UPLOAD_TYPES,
  stripUrlHostile as coreStripUrlHostile,
  validateUploadFileType as coreValidateUploadFileType,
} from "@openinary/core";
import { stripUrlHostile } from "./r2-storage.js";
import {
  ALLOWED_UPLOAD_TYPES,
  DASHBOARD_IMAGE_THUMB_SEGMENTS,
  DASHBOARD_VIDEO_THUMB_SEGMENTS,
  dashboardThumbParams,
  generateCacheKey,
  isDashboardThumbSegment,
  isTransformSegment,
  isVideoOutputExt,
  parseParams,
  resolveAutoFormat,
  validateUploadFileType,
  videoOutputExt,
} from "./transform-cache.js";

const TENANT_ROOT = "ugc/user_123/bucket_abc";

// Mirrors worker/index.ts's parseCdnRequest + tryServeFromR2Cache: parse the
// real request URL, then - because the segment is a dashboard one - discard
// its own params for the canonical set. The path is taken through URL the way
// the Worker sees it - percent-encoded by the browser - and decoded per
// segment, because the upload route stores the decoded name: a file called
// "La Marée.png" is where the two sides drift apart if that decoding is ever
// dropped.
function keyForRequest(
  segment: string,
  relativePath: string,
  isImage: boolean,
): string {
  const afterT = `${segment}/${relativePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  assert.ok(
    isTransformSegment(segment),
    `${segment} is not recognised as a transform segment`,
  );
  const decodedPath = afterT
    .split("/")
    .slice(1)
    .map((s) => decodeURIComponent(s))
    .join("/");
  return generateCacheKey(
    `${TENANT_ROOT}/${decodedPath}`,
    dashboardThumbParams(isImage),
  );
}

// Mirrors worker/app.ts's thumbnailCacheKey.
function keyForUpload(relativePath: string, isImage: boolean): string {
  return generateCacheKey(
    `${TENANT_ROOT}/${relativePath}`,
    dashboardThumbParams(isImage),
  );
}

for (const [segments, file, isImage] of [
  [DASHBOARD_IMAGE_THUMB_SEGMENTS, "photos/holiday.jpg", true],
  [DASHBOARD_VIDEO_THUMB_SEGMENTS, "clips/demo.mp4", false],
  // Spaces and accents survive the browser's percent-encoding round trip.
  [DASHBOARD_IMAGE_THUMB_SEGMENTS, "clients/La Marée - logo.png", true],
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
const videoParams = parseParams("/t/w_303,h_100/clip.mp4");
const VIDEO_PATH = `${TENANT_ROOT}/clip.mp4`;
assert.equal(
  JSON.stringify(videoParams),
  '{"width":"303","height":"100","resize":"303x100"}',
);
// A verbatim round trip through the DB column lands on the same key.
assert.equal(
  generateCacheKey(VIDEO_PATH, JSON.parse(JSON.stringify(videoParams))),
  generateCacheKey(VIDEO_PATH, videoParams),
);
// Any reordering does not - this is the trap, not a theoretical one.
assert.notEqual(
  generateCacheKey(
    VIDEO_PATH,
    Object.fromEntries(
      Object.entries(videoParams).sort(([a], [b]) => a.localeCompare(b)),
    ),
  ),
  generateCacheKey(VIDEO_PATH, videoParams),
);

// An image format asked of a video source is a still frame, not a transcode,
// and must be served as that image: /t/f_webp/clip.mp4 answered with
// video/mp4 showed an empty player instead of the frame. Only a real
// container format (or none, which means mp4) stays a video.
assert.equal(videoOutputExt("webp"), "webp");
assert.equal(videoOutputExt("jpg"), "jpg");
assert.equal(videoOutputExt("webm"), "webm");
assert.equal(videoOutputExt(undefined), "mp4");
assert.equal(videoOutputExt("auto"), "mp4");
for (const format of ["webp", "jpg", "jpeg", "png", "avif", "gif"])
  assert.equal(isVideoOutputExt(videoOutputExt(format)), false, format);
for (const format of [undefined, "auto", "mp4", "mov", "webm"])
  assert.equal(isVideoOutputExt(videoOutputExt(format)), true, `${format}`);
// The dashboard's own video thumbnails go through the same branch.
assert.equal(videoOutputExt(dashboardThumbParams(false).format), "webp");

// A normal customer-facing transform must NOT be caught by the guard, or it
// would 404 instead of reaching the container.
assert.equal(isDashboardThumbSegment("w_800,h_600,c_fit"), false);
assert.equal(isDashboardThumbSegment("w_500,h_500,q_81"), false);

// core 1.2.0 narrowed f_ to formats an encoder can produce. A segment
// carrying a dropped format must not parse as a transform at all
// (all-or-nothing) - it becomes a path segment and 404s, same as core.
assert.equal(isTransformSegment("f_psd"), false);
assert.equal(isTransformSegment("f_avi,w_100"), false);
assert.equal(isTransformSegment("f_webp,w_100"), true);

// f_auto is resolved by the Worker instead of being forwarded, so the key
// tryServeFromR2Cache looks up (params with the negotiated format spread in
// place) has to be the key core computes from the segment the container is
// actually sent. generateCacheKey hashes JSON.stringify with no key sorting, so
// this is the same order trap as the video params above, and the reason the
// rewrite overwrites format in place rather than appending it.
for (const [segment, format] of [
  ["f_auto", "avif"],
  ["w_500,f_auto,q_80", "webp"],
  ["f_auto,w_500", "jpeg"],
] as const) {
  const path = `/t/${segment}/cow.png`;
  const IMAGE_PATH = `${TENANT_ROOT}/cow.png`;
  assert.equal(parseParams(path).format, "auto", `${segment} lost its f_auto`);
  assert.equal(
    generateCacheKey(IMAGE_PATH, { ...parseParams(path), format }),
    generateCacheKey(IMAGE_PATH, parseParams(resolveAutoFormat(path, format))),
    `f_auto key drift for ${segment}`,
  );
}

// Every format negotiatedFormat can return must still be a value f_ accepts, or
// the resolved segment stops parsing as a transform and 404s as a path segment.
for (const format of ["avif", "webp", "png", "jpeg"])
  assert.ok(isTransformSegment(`f_${format}`), `f_${format} no longer parses`);

// The transform segment and nothing else: a file may legitimately be named
// f_auto.png, and a bare URL has no segment to resolve at all.
assert.equal(resolveAutoFormat("/t/f_auto.png", "avif"), "/t/f_auto.png");
assert.equal(
  resolveAutoFormat("/t/w_100/f_auto.png", "avif"),
  "/t/w_100/f_auto.png",
);
assert.equal(resolveAutoFormat("/t/cow.png", "avif"), "/t/cow.png");

// The vendored upload whitelist must match the package byte for byte -
// unlike a cache-key drift (a harmless miss), a drift here accepts what
// core rejects or vice versa. Sorted before comparing: only the mapping
// matters, not declaration order.
assert.deepEqual(
  Object.fromEntries(
    Object.entries(ALLOWED_UPLOAD_TYPES).sort(([a], [b]) => a.localeCompare(b)),
  ),
  Object.fromEntries(
    Object.entries(CORE_ALLOWED_UPLOAD_TYPES).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  ),
);
// And the two validators agree on the interesting shapes: the svg
// rejection this bump exists for, extension/MIME mismatch, browsers'
// octet-stream fallback for .psd, and case-insensitivity.
for (const [name, mime] of [
  ["logo.svg", "image/svg+xml"],
  ["logo.svg", "image/png"],
  ["photo.jpg", "image/jpeg"],
  ["PHOTO.JPG", "image/jpeg"],
  ["comp.psd", "application/octet-stream"],
  ["movie.mp4", "video/mp4"],
  ["movie.avi", "video/x-msvideo"],
  ["noextension", "image/png"],
] as const) {
  assert.equal(
    validateUploadFileType(name, mime),
    coreValidateUploadFileType(name, mime),
    `validators disagree on ${name} (${mime})`,
  );
}
assert.equal(validateUploadFileType("logo.svg", "image/svg+xml"), false);

// Same reasoning for the other half of "what may enter storage": core strips
// the characters that make a key unaddressable through a URL, and so does
// worker/r2-storage.ts (it cannot import core - see this file's header). A
// drift means the same filename is stored under two different keys depending
// on whether it went through cloud or a self-hosted instance.
for (const name of [
  "The #1 clip.mp4",
  "50% off? maybe.mp4",
  "La Marée.png",
  "clip [final].mp4",
  "Vidéos/Été 2026/plage.mov",
  "a\u0000b\u001fc.png",
  "",
] as const) {
  assert.equal(
    stripUrlHostile(name),
    coreStripUrlHostile(name),
    `strippers disagree on ${JSON.stringify(name)}`,
  );
}

console.log("transform-cache: dashboard thumbnail keys agree on both sides");
