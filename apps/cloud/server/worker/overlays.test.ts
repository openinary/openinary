// Run with: npx tsx worker/overlays.test.ts
//
// Overlays (l_ & co, core's overlays commit) on Cloud. Pins:
//  - the Worker recognises overlay segments (image and video),
//  - l_ is confined to the tenant (ugc/<userId>/<bucketId>) and every escape
//    attempt is refused,
//  - a missing overlay is a 400 before the container is woken,
//  - existing URLs keep their exact R2 cache keys (no mass cache miss /
//    re-billing after the core bump),
//  - the container writes a derivative under the key UsageMeter heads
//    (metering), in-request, for a queued video job, and after a restart.

import assert from "node:assert/strict";
import { KeyGenerator, parseParams as coreParseParams } from "@openinary/core";
import {
  requestCacheParams,
  useInsertionOrderCacheKeys,
  toCloudCacheParams,
  withCloudCacheKeys,
  parseCacheParamsHeader,
} from "../api/lib/cache-params.js";
import { overlayMissingResponse, scopeCdnOverlay } from "./overlay.js";
import {
  generateCacheKey,
  isTransformSegment,
  parseParams,
  resolveStatusTarget,
  tryScopeOverlaySegment,
} from "./transform-cache.js";

const ROOT = "ugc/user_123/bucket_abc";
const FILE = `${ROOT}/a/photo.jpg`;

// --- 1. recognition ---------------------------------------------------------
for (const segment of [
  "l_logo.png",
  "l_brand:logo.png,lo_50,lg_south_east,w_800,f_webp",
  "l_logo.png,lx_10,ly_20,lw_200,lh_auto",
  "l_logo.png,lt_true,ls_40,f_mp4", // video, tiled
  "l_logo.png,lg_se,so_2,eo_8,f_webm",
]) {
  assert.ok(isTransformSegment(segment), `${segment} not recognised`);
  assert.ok(isTransformSegment(segment) === coreIsTransform(segment));
}
function coreIsTransform(segment: string): boolean {
  return Object.keys(coreParseParams(`/t/${segment}/x.png`)).length > 0;
}
assert.deepEqual(
  parseParams("/t/l_brand:logo.png,lo_50,lg_south_east,lw_auto,w_800/x.jpg"),
  {
    overlayPath: "brand/logo.png",
    overlayOpacity: "50",
    overlayGravity: "southeast",
    width: "800",
  },
);
assert.deepEqual(parseParams("/t/l_logo.png,lt_1,ls_40,f_mp4/clip.mp4"), {
  overlayPath: "logo.png",
  overlayTiled: "true",
  overlayTileSpacing: "40",
  format: "mp4",
});

// --- 2. tenant scoping -------------------------------------------------------
{
  const r = tryScopeOverlaySegment("l_brand:logo.png,w_500", ROOT);
  assert.ok(r.ok);
  assert.equal(r.segment, "l_ugc:user_123:bucket_abc:brand:logo.png,w_500");
  assert.equal(r.overlayRelativePath, "brand/logo.png");
  // What the container's core parser makes of the forwarded segment.
  assert.equal(
    (coreParseParams(`/t/${r.segment}/${FILE}`) as { overlayPath?: string })
      .overlayPath,
    `${ROOT}/brand/logo.png`,
  );
}
// No overlay: untouched.
assert.deepEqual(tryScopeOverlaySegment("w_500,f_auto", ROOT), {
  ok: true,
  segment: "w_500,f_auto",
  overlayRelativePath: null,
});
// Cross-tenant / escapes are refused.
for (const segment of [
  "l_ugc:other_user:other_bucket:secret.png",
  "l_UGC:other:b:x.png",
  "l_logo.png,lx_10", // lx_ without ly_
  "l_a.png,l_b.png",
]) {
  const r = tryScopeOverlaySegment(segment, ROOT);
  assert.equal(r.ok, false, `${segment} should be refused`);
}
// "..", "/", "%2F", absolute paths never even parse as a transform (core's l_
// pattern), so they stay a folder name: unscoped, no overlay, and the source
// lookup under the tenant 404s.
for (const segment of ["l_..:x.png", "l_%2Fetc%2Fx.png", "l_:abs.png", "l_a..b.png"]) {
  const r = tryScopeOverlaySegment(segment, ROOT);
  assert.ok(r.ok && r.overlayRelativePath === null, `${segment} parsed as overlay`);
}
// Full URL rewrite.
{
  const url = new URL("https://cdn.openinary.dev/b/bucket_abc/t/l_logo.png,w_500/a/photo.jpg");
  const r = scopeCdnOverlay(url, "bucket_abc", ROOT);
  assert.ok(r.ok);
  assert.equal(r.url.pathname, "/b/bucket_abc/t/l_ugc:user_123:bucket_abc:logo.png,w_500/a/photo.jpg");
  const bad = scopeCdnOverlay(
    new URL("https://cdn.openinary.dev/b/bucket_abc/t/l_ugc:x:y:z.png/a/photo.jpg"),
    "bucket_abc",
    ROOT,
  );
  assert.equal(bad.ok, false);
  const none = scopeCdnOverlay(new URL("https://cdn.openinary.dev/b/bucket_abc/t/w_500/a.jpg"), "bucket_abc", ROOT);
  assert.ok(none.ok && none.url.pathname === "/b/bucket_abc/t/w_500/a.jpg");
}
// Video status keys use the scoped overlay too.
assert.equal(
  resolveStatusTarget(ROOT, "l_logo.png,f_mp4/clip.mp4").params.overlayPath,
  `${ROOT}/logo.png`,
);

// --- 3. missing overlay -> 400 ----------------------------------------------
{
  const heads: string[] = [];
  const bucket = {
    head: async (key: string) => {
      heads.push(key);
      return key.endsWith("present.png") ? ({} as R2Object) : null;
    },
  };
  const missing = await overlayMissingResponse(bucket, ROOT, "brand/absent.png");
  assert.equal(missing?.status, 400);
  assert.match(await missing!.text(), /Overlay not found: brand\/absent.png/);
  assert.equal(heads[0], `public/${ROOT}/brand/absent.png`);
  assert.equal(await overlayMissingResponse(bucket, ROOT, "present.png"), null);
}

// --- 4. cache-key parity for existing URLs -----------------------------------
// Expected values generated from the Worker's transform-cache.ts *before*
// this change (origin/main bc54443): they are the keys already sitting in R2.
const LEGACY = JSON.parse(String.raw`{"w_500": {"params": {"width": "500"}, "key": "cache/46c7cb6d952d6c9f0c27c6fb9081bc0e.jpg"}, "w_500,f_auto": {"params": {"format": "auto", "width": "500"}, "key": "cache/6484716fe4ed907e91b9e888d31c262b.jpg"}, "w_500,h_300,c_fill,q_80,f_webp": {"params": {"quality": "80", "format": "webp", "width": "500", "height": "300", "resize": "500x300", "crop": "fill"}, "key": "cache/186e13768613ceb32d7f4f1706611c0a.jpg"}, "h_200,g_face,r_max": {"params": {"gravity": "face", "radius": "max", "height": "200"}, "key": "cache/cf929d903d2e6f3ae3e01602778a386f.jpg"}, "a_90,b_white,ar_16:9": {"params": {"rotate": "90", "background": "#ffffff", "aspect": "16:9"}, "key": "cache/9ff01cb369557764063d06c0a82591c7.jpg"}, "q_auto,f_avif": {"params": {"quality": "auto", "format": "avif"}, "key": "cache/fc8da2f3123ad476044e75edd1446ce8.jpg"}, "t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80": {"params": {"thumbnail": "true", "thumbnailTime": "5", "format": "webp", "quality": "80", "width": "500", "height": "500", "resize": "500x500", "crop": "fill"}, "key": "cache/b4a34cd49fd3497a8f1c4866bc99f7e4.jpg"}, "so_2,eo_10,w_720,f_webm": {"params": {"format": "webm", "width": "720", "startOffset": "2", "endOffset": "10"}, "key": "cache/89fa2a31a426cd91e6e2c7f51a6e1ad2.jpg"}, "w_auto,f_png": {"params": {"format": "png", "width": "auto"}, "key": "cache/4e2fab5935f087370df5cc66e9da7fa6.jpg"}, "t_1,tt_1.50": {"params": {}, "key": "cache/13b061f593c44e92c2b72f5477adad43.jpg"}, "bg_rgb:ff0000,c_pad,w_300,h_300": {"params": {"background": "#ff0000", "width": "300", "height": "300", "resize": "300x300", "crop": "pad"}, "key": "cache/0dc409893711335149514eb7255fcadb.jpg"}}`) as Record<
  string,
  { params: Record<string, string>; key: string }
>;
// Lossy under core's typed parser: only the in-request header keeps these exact.
const CORE_LOSSY = new Set(["w_auto,f_png", "t_1,tt_1.50"]);
for (const [segment, { params, key }] of Object.entries(LEGACY)) {
  const now = parseParams(`/t/${segment}/a/photo.jpg`);
  assert.deepEqual(now, params, `worker params drifted for ${segment}`);
  assert.equal(generateCacheKey(FILE, now), key, `worker key drifted for ${segment}`);
  const fallback = toCloudCacheParams(coreParseParams(`/t/${segment}/a/photo.jpg`));
  if (!CORE_LOSSY.has(segment)) {
    assert.equal(
      generateCacheKey(FILE, fallback),
      key,
      `fallback key drifted for ${segment}: ${JSON.stringify(fallback)}`,
    );
  }
}
// Overlay params: fallback converter agrees with the Worker too.
for (const segment of [
  "l_ugc:user_123:bucket_abc:logo.png,lo_50,lg_se,w_800,f_webp",
  "l_ugc:user_123:bucket_abc:logo.png,lt_true,ls_40,lx_5,ly_6,lw_100,f_mp4",
]) {
  assert.equal(
    generateCacheKey(FILE, toCloudCacheParams(coreParseParams(`/t/${segment}/${FILE}`))),
    generateCacheKey(FILE, parseParams(`/t/${segment}/${FILE}`)),
    segment,
  );
}

// --- 5. metering: container writes where UsageMeter heads ------------------
{
  const writes: string[] = [];
  const fake = {
    upload: async (path: string, params: unknown) => {
      writes.push(generateCacheKey(path, params as Record<string, string>));
    },
    exists: async (path: string, params: unknown) => {
      writes.push(generateCacheKey(path, params as Record<string, string>));
      return false;
    },
    existsOriginal: async () => true,
  };
  const storage = withCloudCacheKeys(fake);
  const segment = "l_ugc:user_123:bucket_abc:logo.png,lo_50,w_800,f_webp";
  // What the Worker keys (and meters) on, sent as the header.
  const workerParams = parseParams(`/t/${segment}/a/photo.jpg`);
  const meteredKey = generateCacheKey(FILE, workerParams);
  const header = parseCacheParamsHeader(JSON.stringify(workerParams));
  const coreParams = coreParseParams(`/t/${segment}/${FILE}`);
  await requestCacheParams.run(header, async () => {
    await storage.exists(FILE, coreParams);
    await storage.upload(FILE, coreParams);
  });
  assert.deepEqual(writes, [meteredKey, meteredKey]);
  // Queued video job: uploads later, outside the request, with the job's
  // (JSON round-tripped) params - same key thanks to the in-request memo.
  writes.length = 0;
  const video = `${ROOT}/clip.mp4`;
  const vSeg = "l_ugc:user_123:bucket_abc:logo.png,w_auto,f_mp4";
  const vWorker = parseParams(`/t/${vSeg}/clip.mp4`);
  const vCore = coreParseParams(`/t/${vSeg}/${video}`);
  await requestCacheParams.run(vWorker, () => storage.exists(video, vCore));
  await storage.upload(video, JSON.parse(JSON.stringify(vCore)));
  assert.equal(writes[1], generateCacheKey(video, vWorker));
  // Untouched methods and originals pass through.
  assert.equal(await storage.existsOriginal(), true);
  // Garbage header is ignored, not trusted.
  assert.equal(parseCacheParamsHeader("{\"a\":1}"), null);
  assert.equal(parseCacheParamsHeader("nope"), null);
}

// --- 6. core #168 sorts params in KeyGenerator; Cloud keeps insertion order.
{
  const multi = LEGACY["w_500,h_300,c_fill,q_80,f_webp"];
  // Unpatched core would re-key this existing derivative...
  assert.notEqual(KeyGenerator.generateKey(FILE, multi.params), multi.key);
  useInsertionOrderCacheKeys(KeyGenerator);
  // ...the container (media.ts) restores the key already in R2.
  for (const { params, key } of Object.values(LEGACY)) {
    assert.equal(KeyGenerator.generateKey(FILE, params), key);
  }
}

console.log("overlays: ok");
