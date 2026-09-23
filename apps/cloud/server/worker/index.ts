import { WorkerEntrypoint } from "cloudflare:workers";
import { getContainer } from "@cloudflare/containers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../api/db/index.js";
import { mediaDuration } from "../api/db/schema/media-duration.js";
import { videoJob } from "../api/db/schema/video-job.js";
import {
  checkFeature,
  quotaError,
  trackFeature,
  type UsageFeatureId,
} from "../api/lib/autumn.js";
import { getBucketOwner } from "../api/lib/bucket.js";
import { type BucketOwner, parseBucketOwner } from "../api/lib/bucket-owner.js";
import {
  type CacheOutcome,
  type DeliveryKind,
  deliveryEvent,
  isBillableRange,
  isDashboardTraffic,
} from "../api/lib/delivery-log.js";
import { syncLifecycle } from "../api/lib/loops.js";
import { notify } from "../api/lib/push.js";
import { billableJob } from "../api/lib/video-metering.js";
import { app, parseRangeHeader } from "./app.js";
import { MediaContainer } from "./container.js";
import {
  downloadOriginal,
  downloadOriginalRange,
  existsOriginal,
  getOriginalMetadata,
} from "./r2-storage.js";
import {
  dashboardThumbParams,
  determineOptimalFormatForCache,
  generateCacheKey,
  isDashboardThumbSegment,
  isTransformSegment,
  isVideoOutputExt,
  parseParams,
  resolveAutoFormat,
  videoOutputExt,
} from "./transform-cache.js";
import { UsageMeter } from "./usage-meter.js";

export { MediaContainer, UsageMeter };

// Must match the daily entry in wrangler.jsonc's triggers.crons verbatim -
// `controller.cron` is the raw expression, so a typo here silently turns the
// lifecycle sync off and runs video metering twice a day instead.
const DAILY_CRON = "0 7 * * *";

// A bare URL's original is the canonical answer for that URL, so it earns the
// same year as a derivative on the HIT path. It is also what an untransformed
// asset already got back when it was answered with a derivative: dropping it to
// minutes would multiply the cdn_requests the customer is billed for on the most
// common URL shape there is.
const ORIGINAL_CACHE_CONTROL = "public, max-age=31536000, must-revalidate";

// Minutes, for the one answer that is not canonical: a quota refusal, where the
// optimized variant should take over as soon as the allowance resets rather than
// being pinned at the edge for a year.
//
// The parameterless video path used to share this, out of conservatism about a
// re-upload to the same path - but must-revalidate above already covers that,
// and the short window was the whole cost of the most common URL shape there is:
// one account served 53 distinct assets as 832 deliveries, every repeat a fresh
// transatlantic read against a WEUR bucket that billed another cdn_request.
const FALLBACK_CACHE_CONTROL = "public, max-age=300";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function extractBucketId(pathname: string): string | null {
  const match = pathname.match(/^\/b\/([^/]+)\//);
  return match ? match[1] : null;
}

// BucketOwner, parseBucketOwner: api/lib/bucket-owner.ts (imported above).

// Per-isolate memo in front of KV. A hot bucket otherwise pays $0.50 per
// million reads to re-learn an answer that changes at most once a minute, so
// this is a straight cost cut on the cache-hit path - the isolate serving a
// burst for one bucket does one KV read instead of one per request.
//
// The TTL is what bounds how stale `blocked` can get, so it stays well under
// UsageMeter's 60s FLUSH_INTERVAL_MS: an over-quota account keeps being served
// for at most BUCKET_OWNER_TTL_MS past the flush that blocked it, on the
// isolates that had already cached it. Deliberately not a "clear on block"
// scheme - there's no channel from the DO to an arbitrary isolate, and 5s of
// slack on a limit that already lags a minute is not worth inventing one.
const BUCKET_OWNER_TTL_MS = 5_000;
const bucketOwnerMemo = new Map<
  string,
  { owner: BucketOwner; expiresAt: number }
>();

// Resolves who owns a bucket without ever asking the container: isolate memo
// first, then KV (populated by an earlier request), then Postgres (via the
// same api/lib/bucket.ts query the old container-side handler used) on a miss,
// caching the result for next time. Now possible entirely in the Worker
// because the DB driver is neon-http (see api/db/index.ts) - no TCP pool
// required.
//
// The KV value also carries the account's CDN-quota block flag, kept
// current by UsageMeter's alarm() - this read is the only place that flag
// is consulted, so blocking never costs the hot path a second KV lookup.
async function resolveBucketOwner(
  bucketId: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<BucketOwner | null> {
  const now = Date.now();
  const memo = bucketOwnerMemo.get(bucketId);
  if (memo && memo.expiresAt > now) return memo.owner;

  const owner = await readBucketOwner(bucketId, env, ctx);
  // Misses aren't memoized: a 404 here is either a bad bucket id (cheap to
  // re-resolve, and rare enough not to matter) or a bucket created seconds
  // ago, which must not stay invisible for the length of a TTL.
  if (owner) {
    bucketOwnerMemo.set(bucketId, {
      owner,
      expiresAt: now + BUCKET_OWNER_TTL_MS,
    });
  }
  return owner;
}

async function readBucketOwner(
  bucketId: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<BucketOwner | null> {
  const cached = parseBucketOwner(await env.BUCKET_OWNERS.get(bucketId));
  if (cached) return cached;

  const userId = await getBucketOwner(bucketId);
  if (!userId) return null;
  const owner: BucketOwner = { userId, blocked: false };
  ctx.waitUntil(env.BUCKET_OWNERS.put(bucketId, JSON.stringify(owner)));
  return owner;
}

type CdnRequestInfo = {
  relativePath: string;
  ext: string | undefined;
  isImageExt: boolean;
  isVideoExt: boolean;
  isThumbnailRequest: boolean;
  isDashboardThumb: boolean;
  hasTransform: boolean;
  params: Record<string, string>;
};

// Shared by tryServeFromR2Cache and the metering check below it - both need
// the same "is this an image or video, and which file" classification of a
// /b/* request.
function parseCdnRequest(url: URL, bucketId: string): CdnRequestInfo | null {
  const rest = url.pathname.slice(`/b/${bucketId}/`.length);
  // Public CDN URLs are always "/b/{bucketId}/t/[transform,params/]file..." -
  // "t" is scopeUpstreamPath's fixed transform-route mount segment (mirrors
  // the container's own Hono mount), always present, never itself a
  // transform or file segment. Strip it the same way scopeUpstreamPath does
  // before looking at what follows - otherwise it's misread as part of the
  // file path (or, worse, re-prepending "/t/" onto it below double-mounts
  // the segment and parseParams silently returns {} for a real transform
  // request), which desyncs this file's cache key from the one the
  // container actually wrote under, so every request looks like a miss.
  if (!rest.startsWith("t/")) return null;
  const afterT = rest.slice(2);
  const segments = afterT.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const hasTransform = isTransformSegment(segments[0]);
  const fileSegments = hasTransform ? segments.slice(1) : segments;
  if (fileSegments.length === 0) return null;
  // url.pathname is percent-encoded, R2 keys are not: every write path goes
  // through app.ts's extractFilePath, which decodes. Without the same
  // decoding here, any asset whose name carries a space or an accent gets
  // its cache key built from "La%20Mar%C3%A9e.png" and never matches the
  // stored "La Marée.png" - a permanent 404 on a thumbnail that does exist,
  // which /storage/thumbnails-missing (query params, decoded by Hono)
  // reports as present, so nothing ever regenerates it either.
  const relativePath = fileSegments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        // Malformed escape sequence - keep the segment as sent, matching
        // extractFilePath's behaviour.
        return segment;
      }
    })
    .join("/");
  // Unanchored, matching core's own `ext?.match(/.../)` checks exactly -
  // a stricter regex here would just make the two implementations disagree.
  const ext = relativePath.split(".").pop()?.toLowerCase();
  const isImageExt = !!ext?.match(/jpe?g|png|webp|avif|gif|psd/);
  const isVideoExt = !!ext?.match(/mp4|mov|webm/);
  const params = parseParams(`/t/${afterT}`);
  const isThumbnailRequest =
    params.thumbnail === "true" || params.thumbnail === "1";
  const isDashboardThumb = hasTransform && isDashboardThumbSegment(segments[0]);
  return {
    relativePath,
    ext,
    isImageExt,
    isVideoExt,
    isThumbnailRequest,
    isDashboardThumb,
    hasTransform,
    params,
  };
}

// ACAO because this body is the only explanation a developer gets when the
// browser refuses their asset - an opaque CORS failure would hide it.
async function quotaResponse(
  userId: string,
  featureId: UsageFeatureId,
): Promise<Response> {
  return new Response(JSON.stringify(await quotaError(userId, featureId)), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// A URL with no transform segment is just "give me this file" - the format
// optimization we'd normally apply to it is our own choice, not something the
// caller asked for. Two callers rely on that reading. Quota is spent, where
// refusing outright would make a freshly uploaded asset unreachable at its
// public URL, so the stored original goes out instead of a 402. And any
// parameterless request, image or video, which must never be turned into a
// transform (see the call site below).
//
// Deliberately narrow either way: any request carrying an actual transform
// returns null here and takes the normal path, and a missing original still
// falls through to the error.
//
// Serves byte ranges, because on the video path this is now the only response
// a player ever gets: without Accept-Ranges and a 206, Safari refuses to play
// the file at all and every browser loses seeking, since the whole point of a
// range request is to jump without pulling the bytes in between. Reuses
// /download/*'s parser rather than a second interpretation of the same header -
// the two routes must agree on what "bytes=" means.
async function serveOriginalFallback(
  env: Env,
  info: CdnRequestInfo,
  tenantRoot: string,
  rangeHeader: string | null,
  cacheControl: string,
): Promise<Response | null> {
  if (info.hasTransform || Object.keys(info.params).length > 0) return null;
  // Only a ranged request pays for the extra HEAD, and it needs one: the total
  // size belongs in Content-Range, and a ranged get alone doesn't report it.
  const meta = rangeHeader
    ? await getOriginalMetadata(env.MEDIA_BUCKET, tenantRoot, info.relativePath)
    : null;
  if (rangeHeader && !meta) return null;
  // Null covers malformed and multi-range headers as well as unsatisfiable
  // ones, and all of them fall back to the whole file. RFC 7233 asks for a 416
  // on the unsatisfiable case specifically, but the parser doesn't separate it
  // out, and answering a range we didn't understand with the complete file is
  // the reading every player recovers from.
  const range = meta ? parseRangeHeader(rangeHeader, meta.size) : null;
  const object = range
    ? await downloadOriginalRange(
        env.MEDIA_BUCKET,
        tenantRoot,
        info.relativePath,
        range,
      )
    : await downloadOriginal(env.MEDIA_BUCKET, tenantRoot, info.relativePath);
  if (!object) return null;
  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType ||
      (info.ext && CONTENT_TYPE_BY_EXT[info.ext]) ||
      "application/octet-stream",
  );
  headers.set("Accept-Ranges", "bytes");
  // Cross-origin by design - these URLs are embedded on third-party sites - so
  // a player reading how much it got and how much is left needs them exposed.
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges",
  );
  headers.set("Content-Length", String(range ? range.length : object.size));
  // Chosen by the caller, because the same bytes mean different things
  // depending on why they are going out - see ORIGINAL_CACHE_CONTROL and
  // FALLBACK_CACHE_CONTROL.
  headers.set("Cache-Control", cacheControl);
  // What makes the line above reachable at all for a video. Every playback is
  // ranged, so every video delivery here is a 206, and a browser will not store
  // a partial response that carries no strong validator - it has nothing to
  // revalidate the sparse entry against. Without this the year was unusable for
  // exactly the traffic it was raised for: the first power user's page loads
  // re-fetched all 17 assets before and after the change, 141 billed
  // cdn_requests an hour either side. Images never needed it, being plain 200s,
  // which is why the split looked like it was only ever about the TTL.
  headers.set("ETag", object.httpEtag);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Openinary-Cache", "ORIGINAL");
  if (range && meta) {
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

// The single place the Worker decides what an image request that named no
// format - or named f_auto - actually resolves to, so the key looked up below
// and the segment forwarded to the container can never disagree about it.
function negotiatedFormat(request: Request, info: CdnRequestInfo): string {
  return determineOptimalFormatForCache(
    request.headers.get("User-Agent") ?? "",
    request.headers.get("Accept") ?? undefined,
    info.ext,
  );
}

// Mirrors @openinary/core's TransformService.checkCaches/formatCacheResponse
// (see transform-cache.ts for why this is a hand-mirrored copy rather than
// an import): reconstructs the same R2 object key a completed transform was
// saved under, and serves it directly if present, so a repeat request for an
// already-generated derivative never wakes the container.
//
// Video derivatives are included even though the job queue, not this path,
// produces them. Their absence was affordable only while video transforms
// were rare: the container answering every playback of an already-encoded
// file costs a wake (~$0.00094, two orders of magnitude above the work) on
// the hottest path there is. worker/video.ts already proves the key matches
// what the queue wrote - videoStatusResponse resolves "is it done" with this
// very generateCacheKey call.
/**
 * The params the container will actually have stored a derivative under, which
 * is not always what the URL asked for.
 *
 * Extracted so the cache lookup and the miss path below it cannot disagree:
 * the miss path hands this key to UsageMeter, which later heads R2 with it to
 * find out whether the transform it just launched succeeded. A key derived a
 * second way would silently report every transform as failed.
 */
function derivativeParams(
  request: Request,
  info: CdnRequestInfo,
): Record<string, string> {
  const { isImageExt, params } = info;
  if (info.isDashboardThumb) {
    // Dashboard thumbnails skip content negotiation, and skip their own
    // size too: all four of @openinary/ui's preview sizes resolve to the one
    // stored object per asset, which each slot's object-cover <img> fits to
    // its box. See dashboardThumbParams.
    return dashboardThumbParams(isImageExt);
  }
  if (isImageExt && (!params.format || params.format === "auto")) {
    // f_auto is treated exactly like "no format named": both mean "pick the
    // best one for this client", and both have to land on a key the container
    // will actually write - see resolveAutoFormat, which puts the same answer
    // into the URL the container is asked. The spread overwrites format in
    // place, so an f_auto segment keeps its original key order.
    return { ...params, format: negotiatedFormat(request, info) };
  }
  return params;
}

/** The R2 key a completed transform for this request is stored under. */
function derivativeKey(
  request: Request,
  info: CdnRequestInfo,
  tenantRoot: string,
): string {
  return generateCacheKey(
    `${tenantRoot}/${info.relativePath}`,
    derivativeParams(request, info),
  );
}

async function tryServeFromR2Cache(
  request: Request,
  env: Env,
  info: CdnRequestInfo,
  tenantRoot: string,
): Promise<Response | null> {
  const { relativePath, ext, isImageExt, isVideoExt } = info;
  if (!isImageExt && !isVideoExt) return null;

  const effectiveParams = derivativeParams(request, info);

  // What the container actually stored under this key. A video source only
  // yields a video when the requested format is a container format: f_webp on
  // an .mp4 is a still frame, and every header below has to describe that
  // image instead - starting with Content-Type, since a webp served as
  // video/mp4 is what puts an empty player on screen. See videoOutputExt.
  const outputExt = isVideoExt
    ? videoOutputExt(effectiveParams.format)
    : effectiveParams.format || ext;
  const servesVideo = isVideoExt && isVideoOutputExt(outputExt ?? "");

  const fullPath = `${tenantRoot}/${relativePath}`;
  const key = generateCacheKey(fullPath, effectiveParams);
  // R2 parses the Range header itself when handed the request's Headers, so
  // seeking in a cached video needs no range arithmetic here. Without this a
  // <video> asking for bytes=N- would get 200 and the whole file, and every
  // seek would restart the download.
  const wantsRange = servesVideo && request.headers.has("Range");
  const object = await env.MEDIA_BUCKET.get(
    key,
    wantsRange ? { range: request.headers } : undefined,
  );
  if (!object) return null;

  const headers = new Headers();
  headers.set(
    "Content-Type",
    (outputExt && CONTENT_TYPE_BY_EXT[outputExt]) || "application/octet-stream",
  );
  headers.set("Cache-Control", "public, max-age=31536000, must-revalidate");
  headers.set("ETag", `"${JSON.stringify(effectiveParams)}"`);
  // /b/* is meant to be embedded on arbitrary third-party sites, not just
  // CORS_ORIGIN - matches the permissive policy media-routes.ts's Hono cors
  // used to set for this route.
  headers.set("Access-Control-Allow-Origin", "*");
  if (servesVideo) {
    headers.set("X-Video-Status", "ready");
    // Announced unconditionally: a player that cannot tell whether seeking is
    // supported downloads the file from the start every time.
    headers.set("Accept-Ranges", "bytes");
  }
  headers.set("X-Openinary-Cache", "HIT");

  // R2Range is a union - offset-only, length-only and suffix forms all exist -
  // so both ends are resolved against the object size rather than assumed
  // present. A mismatch here is not cosmetic: a Content-Length that disagrees
  // with the bytes actually sent hangs the player mid-stream.
  const range = wantsRange ? object.range : undefined;
  if (range) {
    const offset =
      "offset" in range && range.offset !== undefined
        ? range.offset
        : object.size - ("suffix" in range ? range.suffix : 0);
    const length =
      "length" in range && range.length !== undefined
        ? range.length
        : object.size - offset;
    headers.set("Content-Length", String(length));
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  headers.set("X-Openinary-Cache-Key", key);

  return new Response(object.body, { headers });
}

// Both quota refusals take the same shape - serve the stored original if the
// request allows it, otherwise 402 - and both have to say which of the two
// happened, since one delivered bytes (and is billed one CDN request) and the
// other delivered nothing.
async function quotaFallback(
  env: Env,
  info: CdnRequestInfo,
  tenantRoot: string,
  rangeHeader: string | null,
  delivery: DeliveryContext,
  refuse: () => Promise<Response>,
): Promise<Response> {
  const original = await serveOriginalFallback(
    env,
    info,
    tenantRoot,
    rangeHeader,
    FALLBACK_CACHE_CONTROL,
  );
  if (original) {
    delivery.cache = "ORIGINAL";
    return original;
  }
  return refuse();
}

// Transcoding is billed on the time the container actually spends on a job,
// not on how long the source video happens to be - the two only correlate
// loosely (a 720p remux runs several times faster than real time, a 1080p
// re-encode roughly at it), and it is the container's running time that
// Cloudflare bills us for.
//
// The gate below therefore can't measure what it's gating: nothing knows the
// processing time before the work is done. It reserves an estimate derived
// from the source duration instead, and meterCompletedVideoJobs bills the
// real figure afterwards. The ratio is deliberately optimistic, because the
// two failure modes are not symmetric: under-reserving lets a Free account
// overrun its allowance slightly, while over-reserving refuses work the
// account could have afforded.
// ponytail: single flat ratio, calibrated by eye against 2x-real-time 720p.
// video_job now records both startedAt and completedAt for every job, so
// replace this with a measured per-resolution median once there's data.
const ESTIMATED_PROCESSING_RATIO = 0.5;

// Non-thumbnail video requests always miss tryServeFromR2Cache (their work
// happens asynchronously in the container's job queue - see its comment),
// so this is the one synchronous point in the Worker where "is this video
// about to be enqueued for processing" is known. Thumbnail extraction is
// cheap regardless of source length and shares the image cache path above,
// so it isn't metered here.
async function checkVideoProcessing(
  userId: string,
  tenantRoot: string,
  info: CdnRequestInfo,
): Promise<boolean> {
  if (!info.isVideoExt || info.isThumbnailRequest) return true;
  const fullPath = `${tenantRoot}/${info.relativePath}`;
  const [row] = await db
    .select({ seconds: mediaDuration.seconds })
    .from(mediaDuration)
    .where(eq(mediaDuration.filePath, fullPath));
  // Unknown duration (parsing failed or predates this feature) - let it
  // through rather than block on missing metadata. Unlike before, this no
  // longer means the job escapes billing: the scheduled handler measures the
  // container directly and doesn't consult mediaDuration at all.
  if (!row) return true;
  const estimate = Math.max(
    1,
    Math.ceil(row.seconds * ESTIMATED_PROCESSING_RATIO),
  );
  return checkFeature(userId, "video_processing_seconds", estimate);
}

// Runs hourly (see wrangler.jsonc's triggers.crons - a shorter interval pins
// Neon's compute awake and burns the whole monthly allowance). Deduction is
// deferred here rather than done at enqueue time so a job that errors out
// is never billed - only video_job rows that actually reached completedAt
// get metered.
//
// Billed quantity is completedAt - startedAt: the wall-clock the container
// spent on this job, which is exactly what Cloudflare charges for. Both
// stamps are written by PgVideoJobStore in the container (getNextPendingJob
// claims the job, updateJobStatus closes it), so no new column was needed.
// retryFailedJob clears startedAt, so a retried job bills only its final
// attempt - our retries are not the customer's to pay for.
/**
 * Hourly canary on the one request that matters most: the exact call the
 * dashboard's Google button makes. It exercises DNS and routing, the auth
 * mount, Postgres (better-auth writes the OAuth state row) and the Google
 * credentials in a single request - which is the point, because while all of
 * that was broken /api/auth/ok kept cheerfully answering 200. A plain health
 * endpoint would have reported everything fine for two days.
 *
 * Costs one verification row per hour, expired ten minutes later and never
 * read again. Cheaper than hearing about an outage from a customer.
 */
async function checkSignIn(): Promise<void> {
  const origin = process.env.CORS_ORIGIN ?? "";
  const res = await fetch(
    `${process.env.BETTER_AUTH_URL}/api/auth/sign-in/social`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      // disableRedirect keeps the answer JSON instead of a hop to Google.
      body: JSON.stringify({
        provider: "google",
        callbackURL: origin,
        disableRedirect: true,
      }),
    },
  );
  if (res.ok) return;
  // Body included because better-auth answers an unexpected failure with an
  // empty 500 - the status alone was what made this one slow to place.
  await notify(
    "Openinary Cloud sign-in is down",
    `POST /api/auth/sign-in/social -> ${res.status} ${(await res.text()).slice(0, 300)}`,
  );
}

async function meterCompletedVideoJobs(): Promise<void> {
  const rows = await db
    .select({
      id: videoJob.id,
      filePath: videoJob.filePath,
      startedAt: videoJob.startedAt,
      completedAt: videoJob.completedAt,
    })
    .from(videoJob)
    // status, not completedAt: updateJobStatus stamps completedAt for
    // "error" and "cancelled" too, so filtering on it alone bills jobs that
    // never produced a transform.
    .where(and(eq(videoJob.status, "completed"), isNull(videoJob.meteredAt)))
    .limit(1000);
  if (rows.length === 0) return;

  const items: { userId: string; seconds: number; jobId: string }[] = [];
  // Missing or nonsensical timestamps: marked metered anyway so these rows
  // don't get rescanned forever - they're simply never billed. Erring toward
  // not charging is the right side to fail on.
  const unbillableIds: string[] = [];
  for (const row of rows) {
    const billable = billableJob(row);
    if (billable) items.push({ ...billable, jobId: row.id });
    else unbillableIds.push(row.id);
  }

  // One track() per job rather than a single batchTrack: autumn-js 1.2.43
  // only accepts a 202 from /v1/balances.batch_track, but the API answers
  // 200 {"success":true}, so every batch call throws - which aborted this
  // whole pass before meteredAt was ever written, and no video job was ever
  // billed. track() accepts both statuses. Marking each row as soon as its
  // own call lands also means a mid-pass failure costs one retry instead of
  // re-billing everything that already succeeded.
  for (const { userId, seconds, jobId } of items) {
    try {
      await trackFeature(userId, "video_processing_seconds", seconds);
      await db
        .update(videoJob)
        .set({ meteredAt: Date.now() })
        .where(eq(videoJob.id, jobId));
    } catch (error) {
      // Left unmarked on purpose: retried next tick. Caught so one bad row
      // can't block every row behind it, the way the batch call did.
      console.error(`Failed to meter video job ${jobId}`, error);
    }
  }
  if (unbillableIds.length > 0) {
    await db
      .update(videoJob)
      .set({ meteredAt: Date.now() })
      .where(inArray(videoJob.id, unbillableIds));
  }
}

// Splices the tenant root into the request path's file-path segments before
// forwarding to the container's raw (unscoped) /t transform route, so the
// filePath @openinary/core derives from the request path is already the
// real R2 key. Port of media-routes.ts's scopeUpstreamPath - the Worker now
// does this instead of the container, since bucket ownership is resolved
// here.
function scopeUpstreamPath(
  mountPrefix: string,
  pathname: string,
  tenantRoot: string,
): string {
  const rest = pathname.slice(mountPrefix.length).replace(/^\/+/, "");
  const segments = rest ? rest.split("/") : [];
  const hasParamsSegment = Object.keys(parseParams(`/t/${rest}`)).length > 0;
  segments.splice(hasParamsSegment ? 1 : 0, 0, ...tenantRoot.split("/"));
  return `${mountPrefix}/${segments.join("/")}`;
}

// Named entrypoint so Workers Caching (see wrangler.jsonc's "exports" block)
// can sit in front of it: unlike the manual caches.default handling below
// for /download/*, this gets tiered caching (shared across
// datacenters, not just the one that first served an asset) and request
// collapsing (a burst of first-time requests for the same asset invokes
// this once instead of once per request) for free. Safe to enable
// unconditionally here because every /b/* response is either an
// anonymous, cookie-less public asset the transform route already marks
// "public, max-age=31536000" (cacheable) or an error/placeholder without
// that header (automatically left uncached).
//
// Only reached on an R2 cache miss (see tryServeFromR2Cache above and its
// call site below) - still wakes the container, exactly as before. Bucket
// ownership is now resolved by the Worker before this is ever called, so
// there's no X-Bucket-Owner echo to learn from the response anymore.
export class CdnAssets extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    // Singleton, not getRandom's default pool of 3: at current traffic one
    // instance absorbs cache-miss bursts fine, and every extra instance woken
    // bills its own processing + 2m sleepAfter tail (metrics showed 3
    // instances awake in parallel for a handful of requests).
    //
    // This line, not wrangler.jsonc's max_instances, is what caps transform
    // concurrency at 1 - raising that ceiling alone changes nothing here.
    // Left as a singleton on purpose: the measurement above still holds, and
    // now that transcoding bills the customer for measured container time,
    // waking parallel instances spends idle tails we eat rather than time
    // they pay for.
    // ponytail: singleton container; switch to getRandom(binding, n) when
    // job wait time (video_job.startedAt - createdAt, now recorded for every
    // job) shows real queueing - that's the signal, not account count.
    //
    // No explicit startAndWaitForPorts() before the fetch: containerFetch
    // already runs it, but only when the instance is not already running and
    // healthy. Calling it ourselves on every request ran the whole readiness
    // handshake each time - a container-get poll, then an HTTP ping to port
    // 3000 with a 5s timeout and up to 20s of retries, then a
    // blockConcurrencyWhile(setHealthy + onStart) that halts every other event
    // on this Durable Object, in-flight proxied requests included.
    //
    // Harmless while idle, pathological during a transcode: ffmpeg pins the
    // single vCPU, the ping is answered slowly, and each request holds the
    // concurrency gate while the next ones stack up behind it - 524 at the
    // edge's 100s ceiling, or a 500 when the ping exhausted its retry budget
    // and startAndWaitForPorts threw. Both were reproducible, roughly one
    // request in a dozen, only ever while a job was encoding.
    //
    // containerFetch also maps the start failures we were flattening into a
    // generic 500: 503 for "no instance available", 429 when rate limited.
    return getContainer(this.env.MEDIA_CONTAINER).fetch(request);
  }
}

/**
 * Filled in as serveCdnRequest learns what it is actually doing, so that the
 * single emit in handleCdnRequest below can describe the delivery whatever
 * exit it took. Deliberately mutable and passed down rather than returned:
 * every early return - a 402, a 429, a 404 - has to end up in the log too,
 * and threading a second return value through all of them would be a much
 * larger diff for the same one emit.
 */
type DeliveryContext = {
  /** Unset while the request has no attributable owner; nothing is logged then. */
  userId?: string;
  bucketId?: string;
  path: string;
  kind: DeliveryKind;
  cache: CacheOutcome;
  /**
   * Reported to PostHog but kept out of the customer's activity tab. Set by
   * the dashboard thumbnail handshake below - those 404s are our own dashboard
   * talking to itself, not an asset served publicly, and at one per grid mount
   * they would crowd out every real line in a 500-entry log - and by both
   * "still processing" 202s, which delivered no bytes.
   *
   * Also set for anything else the dashboard itself asks for (see
   * isDashboardTraffic), which is the same "talking to itself" case the
   * thumbnail rule already covered - just for the URL shapes it missed.
   */
  quiet: boolean;
  /** Cleared for the range requests a single playback fans out into. */
  loggable: boolean;
};

// Every /b/* outcome - not just the two success paths that set it inline -
// has to carry CORS. A browser reports a header-less 404/429/500 as "CORS
// error" and turns the caller's fetch into `TypeError: Failed to fetch`, so
// the real status never reaches the client: the dashboard's asset sidebar
// logged an unexplained "Failed to fetch" for what was actually a plain 503
// from the container. Also catches, so a throw becomes a CORS-tagged 500
// rather than the runtime's bare error page.
async function handleCdnRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const delivery: DeliveryContext = {
    path: "",
    kind: "other",
    cache: "NONE",
    // Anything that is not a GET asked about the asset without receiving it.
    // @openinary/ui's asset panel fires two HEADs at a video the moment it is
    // selected - one reading X-Video-Status and X-Optimized-Size, one whose
    // own catch message is "Failed to trigger video job creation" - and a
    // preflight OPTIONS carries no body either. None of them is a delivery,
    // so none may be billed or shown; they stay in PostHog, which is where
    // this pair was found in the first place.
    quiet:
      request.method !== "GET" ||
      isDashboardTraffic(
        request.headers.get("Origin"),
        request.headers.get("Referer"),
        env.CORS_ORIGIN,
      ),
    loggable: isBillableRange(request.headers.get("Range")),
  };
  let response: Response;
  try {
    response = await serveCdnRequest(request, env, ctx, url, delivery);
  } catch (error) {
    console.error(`CDN request failed for ${url.pathname}`, error);
    response = new Response("Internal error", { status: 500 });
  }
  // Emitted here rather than inside serveCdnRequest because this is the first
  // point that knows the status the caller actually received, and the status
  // is what decides whether anything is billed at all. Off the response path
  // (waitUntil), as the metering it replaces already was.
  if (delivery.loggable && delivery.userId && delivery.bucketId) {
    const event = deliveryEvent({
      now: Date.now(),
      bucketId: delivery.bucketId,
      path: delivery.path,
      kind: delivery.kind,
      cache: delivery.cache,
      status: response.status,
      // Never true: the only request that makes a derivative is the one
      // answered with a 202 above, and it delivers nothing, so deliveryEvent's
      // own `delivered` gate would zero this out regardless.
      // image_transformations is still billed, off the container promise.
      transformed: false,
      quiet: delivery.quiet,
    });
    const userId = delivery.userId;
    // Viewer + asset, so UsageMeter can tell one viewing that re-opened the
    // stream from two genuine deliveries. The IP is the same one the rate
    // limiter above already keys on; it is compared in the Durable Object's
    // memory for a few seconds and never persisted or shipped anywhere.
    const viewer = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const dedupeKey = `${viewer}|${delivery.bucketId}|${delivery.path}`;
    ctx.waitUntil(
      env.USAGE_METER.get(env.USAGE_METER.idFromName(userId)).hit(
        event,
        delivery.quiet,
        dedupeKey,
      ),
    );
  }
  // SVGs predate upload validation (core 1.2.0's validateUploadFileType now
  // rejects them - stored-XSS vector) but some are still in R2. Whatever
  // path produced the response, never let one render inline on the CDN
  // origin: octet-stream + attachment neutralizes the script context.
  const isSvg = url.pathname.split(".").pop()?.toLowerCase() === "svg";
  if (!isSvg && response.headers.has("Access-Control-Allow-Origin"))
    return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  if (isSvg && response.ok) {
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", "attachment");
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/b/")) {
      return handleCdnRequest(request, env, ctx, url);
    }

    // Everything else (auth, oRPC, storage/upload/download, video-status,
    // queue events) is served directly by the Worker - see worker/app.ts.
    // Only /b/* on a cache miss ever reaches the container now.
    return app.fetch(request, env, ctx);
  },
  async scheduled(
    controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Two schedules, one handler (see wrangler.jsonc's triggers.crons). The
    // lifecycle sync scans every account and talks to Autumn and Loops once
    // per account, so it runs daily and never on the hourly metering
    // tick - and syncLifecycle's own "crossed the inactivity threshold today"
    // test assumes exactly one run per day.
    //
    // ctx.waitUntil discards a rejection, so both jobs could fail forever in
    // silence - meterCompletedVideoJobs threw on every tick for two days once
    // Neon's compute allowance ran out, and the first report was a customer
    // who couldn't sign in. The hourly tick queries Postgres unconditionally,
    // which makes it a database health check that already exists; this just
    // gives it a mouth. Delivery is the same Telegram chat as new signups
    // (api/lib/push.ts), the one already being watched.
    //
    // ponytail: one message per failed tick, no dedup and no cooldown - a
    // real outage is 24 a day, which is noise worth having at this size. Add
    // a cooldown (last-alert timestamp in USAGE_METER) if it grates.
    const alert = (job: string) => (error: unknown) =>
      notify("Openinary Cloud cron failed", `${job}: ${error}`);

    if (controller.cron === DAILY_CRON) {
      ctx.waitUntil(syncLifecycle().catch(alert("syncLifecycle")));
      return;
    }
    ctx.waitUntil(
      meterCompletedVideoJobs().catch(alert("meterCompletedVideoJobs")),
    );
    ctx.waitUntil(checkSignIn().catch(alert("checkSignIn")));
  },
};

async function serveCdnRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  delivery: DeliveryContext,
): Promise<Response> {
  const rangeHeader = request.headers.get("Range");
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.CDN_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    // Nothing is attributed here: the IP limiter fires before the bucket's
    // owner is resolved, and resolving one just to log the refusal would do
    // the work this limiter exists to avoid. The only /b/* outcome absent
    // from the activity tab.
    return new Response("Too many requests", { status: 429 });
  }

  const bucketId = extractBucketId(url.pathname);
  if (!bucketId) {
    return new Response("Not found", { status: 404 });
  }
  const owner = await resolveBucketOwner(bucketId, env, ctx);
  if (!owner) {
    return new Response("Not found", { status: 404 });
  }
  const { userId } = owner;
  // Enough to log every remaining exit. Refined to the parsed relative path
  // below, once the transform segments have been stripped off it.
  delivery.userId = userId;
  delivery.bucketId = bucketId;
  delivery.path = url.pathname.slice(`/b/${bucketId}/`.length);

  // Before the quota check, and not folded into it: an account an admin cut
  // off is not an account that ran out of allowance, and quotaResponse would
  // tell it to upgrade its plan to fix something no plan fixes.
  if (owner.suspended) {
    return new Response("Account suspended", { status: 403 });
  }
  if (owner.blocked) {
    return quotaResponse(userId, "cdn_requests");
  }
  const accountLimit = await env.ACCOUNT_RATE_LIMITER.limit({ key: userId });
  if (!accountLimit.success) {
    return new Response("Too many requests", { status: 429 });
  }
  const tenantRoot = `ugc/${userId}/${bucketId}`;
  const info = parseCdnRequest(url, bucketId);
  if (info) {
    delivery.path = info.relativePath;
    delivery.kind = info.isImageExt
      ? "image"
      : info.isVideoExt
        ? "video"
        : "other";
    // Set here, not on the 404 branch further down: once the browser has
    // filled the thumbnail cache these requests stop 404ing and start being
    // served, and marking them only on the miss let every subsequent grid
    // render bill and log itself as a public delivery. A single video upload
    // fans out into one per dashboard thumbnail variant, all carrying the
    // video's own filename, which is what buried the real lines.
    // Assigned, never cleared: the method check above may already have set it,
    // and a plain `=` here would put every HEAD back in the customer's log.
    delivery.quiet ||= info.isDashboardThumb;
  }

  // A URL carrying no transform is "give me this file", and it has to be
  // answered as one - for images as well as videos now.
  //
  // Video: core's processFile routes every non-thumbnail video request into
  // handleVideoJobQueue whether or not a parameter was asked for, so a bare
  // /t/clip.mp4 enqueued a full transcode and billed the customer minutes of
  // container time for work nobody requested - a preload on hover was enough to
  // start one.
  //
  // Image: a bare /t/cow.png was looked up as a *derivative*, under the format
  // negotiated from the client's Accept/UA (see negotiatedFormat), which exists
  // only once the container has produced it. So the first request per client
  // class - three of them: avif, webp, and png-or-jpeg - woke the container,
  // billed the customer an image_transformation for a URL that asked for no
  // transformation, and on a cold start held the connection until the edge
  // returned a bodyless 524 at 100s. core has the same asymmetry: its bare-URL
  // exemption (TransformService.transform) is gated on isVideo, and could not
  // fire for an image anyway, since getEffectiveParamsAndCachePath has already
  // injected a format into the params it tests for emptiness.
  //
  // Optimization is opt-in through the URL now, the way it is at every
  // competitor: f_auto, q_auto, or any explicit parameter.
  //
  // Ahead of the cache lookup on purpose: a derivative may well sit in R2 under
  // the key this request used to resolve to, left by the era when it generated
  // one, and serving that would quietly reinstate the old behaviour. Skipping
  // the lookup also saves an R2 read that could only be wrong.
  //
  // Narrowed to what can be delivered as-is, which is why this is not simply
  // `if (info)`: ALLOWED_UPLOAD_TYPES also accepts .psd and .heic, and no
  // browser renders either, so handing back the file would be a download
  // instead of an image. Both keep taking the transform path - a bare
  // /t/comp.psd has always meant the png core decodes it into, and heic is
  // refused there as it already was. Same whitelist as core's canServeOriginal;
  // the two have to agree on this or one of them serves what the other refuses.
  if (info && (info.isVideoExt || (info.isImageExt && info.ext !== "psd"))) {
    // Returns null the moment any transform or parameter is present, so a
    // genuine transformation still falls through below.
    const original = await serveOriginalFallback(
      env,
      info,
      tenantRoot,
      rangeHeader,
      ORIGINAL_CACHE_CONTROL,
    );
    if (original) {
      delivery.cache = "ORIGINAL";
      return original;
    }
  }

  const cached = info
    ? await tryServeFromR2Cache(request, env, info, tenantRoot)
    : null;
  if (cached) {
    delivery.cache = "HIT";
    return cached;
  }

  // Dashboard thumbnails are generated by the browser, never here: the
  // dashboard's <img> fires the moment MediaGrid mounts, long before
  // apps/web's ThumbnailGenerator has finished encoding and uploading the
  // asset, so this is the request that used to lose that race, wake the
  // container and burn one image_transformation per uploaded asset. Answer
  // it with a 404 and let the client fill the cache; no-store so neither
  // the browser nor the edge pins the miss once the object shows up.
  if (info?.isDashboardThumb) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Does the source even exist? One R2 head, on the cache-miss path only,
  // and it is what lets both 202s below go out immediately instead of waiting
  // to find out. The container is the only other thing that can tell "this
  // will never work" from "this is not ready yet", and asking it costs a wake
  // (seconds, cold) on the one request that cannot afford one.
  //
  // Without this the two answers are indistinguishable at the moment we have
  // to pick, and picking "processing" for a path that does not exist is a
  // promise that never resolves - every retry gets the same 202, forever.
  // Checked here rather than inside either branch so the video path gets it
  // too: its 202 hands out a statusUrl that would poll a job nothing will
  // ever create.
  if (
    info &&
    !(await existsOriginal(env.MEDIA_BUCKET, tenantRoot, info.relativePath))
  ) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // The object can show up a moment later (an upload still in flight),
        // so this must not be pinned at the edge - same reasoning as the
        // dashboard thumbnail 404 above.
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // A cache miss on an image is a real transformation about to happen -
  // gate it on quota before waking the container. A cache miss on a
  // full (non-thumbnail) video is about to be enqueued for async
  // processing - gate that on its known duration too.
  if (info?.isImageExt) {
    const allowed = await checkFeature(userId, "image_transformations", 1);
    if (!allowed) {
      return quotaFallback(env, info, tenantRoot, rangeHeader, delivery, () =>
        quotaResponse(userId, "image_transformations"),
      );
    }
  } else if (info?.isVideoExt) {
    const allowed = await checkVideoProcessing(userId, tenantRoot, info);
    if (!allowed) {
      return quotaFallback(env, info, tenantRoot, rangeHeader, delivery, () =>
        quotaResponse(userId, "video_processing_seconds"),
      );
    }
  }

  // Delegates to the cached CdnAssets entrypoint (see wrangler.jsonc's
  // "exports" block) instead of caches.default below, which gets this
  // path tiered caching and request collapsing on top.
  const transformPath = url.pathname.slice(`/b/${bucketId}`.length);
  const rewritten = new URL(request.url);
  rewritten.pathname = scopeUpstreamPath(
    "/t",
    // The container is asked for the same concrete format the cache lookup
    // above went looking for, never "auto" - see resolveAutoFormat.
    info?.isImageExt && info.params.format === "auto"
      ? resolveAutoFormat(transformPath, negotiatedFormat(request, info))
      : transformPath,
    tenantRoot,
  );
  const pending = ctx.exports.CdnAssets.fetch(new Request(rewritten, request));
  // Held by waitUntil from the moment it exists, because both 202 branches
  // below return without awaiting it: once the response is out and the other
  // waitUntil promises (fast DO RPCs) settle, the runtime cancels any
  // subrequest still in flight. Unheld, that cancel landed during the
  // container's cold start - the transform request never reached it, no
  // derivative was ever written, and every retry answered the same 202,
  // forever. The catch is also the only trace a transform request that fails
  // outright leaves anywhere.
  ctx.waitUntil(
    pending.catch((error) => {
      console.error(`Transform request failed for ${url.pathname}`, error);
    }),
  );
  delivery.cache = "MISS";
  // A non-thumbnail video transform is asynchronous on the other side: core's
  // handleVideoJobQueue enqueues the job and answers 202, never bytes. The R2
  // lookup above already missed, so that 202 is the only answer this path can
  // produce - and waiting for it charges the caller the container's wake time
  // (seconds on a cold start) for a response we can write ourselves. Enqueue
  // still happens, under waitUntil, and /video-status is what reports progress.
  //
  // Trade-off: a container that answers 503/429 is no longer passed through, so
  // a failed enqueue shows as "processing" until the client's next request
  // creates the job. The status route says not_found meanwhile, which
  // useVideoStatus already treats as "keep polling".
  if (info?.isVideoExt && !info.isThumbnailRequest) {
    // Same reason as the container's own 202 below: no media was delivered.
    delivery.quiet = true;
    return new Response(
      JSON.stringify({
        status: "processing",
        message: "Video transformation is being processed",
        // core builds this from the path it received, which by then carries the
        // tenant root - a URL that both leaks ugc/{userId}/{bucketId} and 404s
        // against the Worker's /video-status, since that route splices the root
        // in itself. Built from the client's own path here instead.
        statusUrl: transformPath.replace(/^\/t\//, "/video-status/"),
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": "5",
          "Access-Control-Allow-Origin": "*",
          "X-Video-Status": "processing",
          "X-Openinary-Cache": "MISS",
        },
      },
    );
  }
  if (info?.isImageExt) {
    // Handed to UsageMeter rather than billed here, because this request is
    // about to answer 202 and stop existing. The container builds the whole
    // image before it replies, so `pending` settles seconds later - by which
    // time there is no request left to run a .then on, and nothing was ever
    // billed for an image transformation. UsageMeter outlives the request, so
    // it can wait; it confirms by heading the key below, which core writes
    // before it answers. See its transformLaunched.
    ctx.waitUntil(
      env.USAGE_METER.get(env.USAGE_METER.idFromName(userId)).transformLaunched(
        derivativeKey(request, info, tenantRoot),
      ),
    );
  }
  // No wait: the source was confirmed to exist above, so "not ready yet" is
  // the only thing this can be and the 202 goes out now rather than after the
  // container has woken up to say the same thing. The transform still runs and
  // writes the derivative to R2 before it answers, so nothing is lost - the
  // next request for this URL is a HIT.
  //
  // What this cannot distinguish is a source that exists but will never
  // transform (corrupt, or an encoder that refuses it): that stays a 202 on
  // every retry. It is logged below rather than surfaced, which is the trade
  // for never holding a caller - see the non-ok branch under waitUntil.
  // Quiet and unbilled, exactly like core's video 202 below: no bytes went out.
  if (info?.isImageExt) {
    delivery.quiet = true;
    return new Response(
      JSON.stringify({
        status: "processing",
        message: "Image transformation is being generated",
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": "1",
          "Access-Control-Allow-Origin": "*",
          "X-Openinary-Cache": "MISS",
        },
      },
    );
  }
  // Only a video thumbnail (extracted synchronously, like an image) or an
  // extension neither branch above claimed still waits on the container.
  const response = await pending;
  if (response.headers.get("X-Video-Status") === "processing") {
    // 202 + a JSON "still encoding, poll the status URL" body (core >= 1.3.0):
    // no media was delivered, so nothing to bill or show. Quiet rather than
    // merely unbilled - the dashboard's own preload triggers these, and one
    // viewer waiting on a transcode produces a run of identical lines that
    // says nothing except that we are still encoding.
    delivery.quiet = true;
  }
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Openinary-Cache", "MISS");
  return new Response(response.body, { status: response.status, headers });
}
