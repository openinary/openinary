// The public CDN: every /b/{bucketId}/t/... request. Answered from R2 whenever
// possible; only a cache miss that needs real work reaches the container.

import {
  type ProcessingEstimate,
  processingBody,
  processingHeaders,
} from "@openinary/core/eta";
import {
  CACHE_PARAMS_HEADER,
  deliveryTarget,
  contentTypeForExt,
  contentTypeForFormat,
  determineOptimalFormatForCache,
  determineOutputFormat,
  IMAGE_FORMATS,
  isOpeningRange,
  isTransformableImageExt,
  isVideoExt,
  legacyCloudKey,
} from "@openinary/core/url";
import { tenantRootFor } from "../../shared/tenant.js";
import type { FeatureId } from "@openinary/plans";
import { DASHBOARD_ORIGIN } from "../config.js";
import { captureEvent } from "../lib/analytics.js";
import { checkFeature, quotaError } from "../lib/billing.js";
import {
  type CacheOutcome,
  type DeliveryKind,
  deliveryEvent,
  isDashboardTraffic,
} from "../lib/delivery-log.js";
import { getBucketOwner } from "../lib/bucket.js";
import { meterFor } from "../lib/meter.js";
import { durationOf } from "../media-duration.js";
import { resolveBucketOwner } from "../owner-cache.js";
import {
  imageProcessingEstimate,
  videoProcessingEstimate,
} from "../processing-eta.js";
import {
  downloadOriginal,
  existsOriginal,
  getOriginalMetadata,
} from "../r2-storage.js";
import {
  objectResponse,
  parseRangeHeader,
  RANGE_EXPOSE_HEADERS,
  servedRange,
  textResponse,
} from "../responses.js";
import { overlayMissingResponse, scopeCdnOverlay } from "./overlay.js";
import {
  type CdnPath,
  cdnBucketId,
  parseCdnPath,
  resolveAutoFormat,
  statusPath,
  upstreamPath,
  withTransform,
} from "./path.js";
import {
  dashboardThumbParams,
  isDashboardThumbSegment,
} from "./dashboard-thumbs.js";

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

// Transcoding is billed on the time the container actually spends on a job,
// not on how long the source video happens to be. The quota gate below can't
// measure that before the work is done, so it reserves an estimate derived
// from the source duration, and the real figure is billed afterwards
// (shared/video-metering.ts). Deliberately optimistic: under-reserving lets a
// Free account overrun its allowance slightly, while over-reserving refuses
// work the account could have afforded.
// ponytail: single flat ratio, calibrated by eye against 2x-real-time 720p.
// video_job records both startedAt and completedAt for every job, so replace
// this with a measured per-resolution median once there's data.
const ESTIMATED_PROCESSING_RATIO = 0.5;

/** A /b/* request, classified once for the cache, quota and delivery log. */
type CdnRequest = CdnPath & {
  isImage: boolean;
  isVideo: boolean;
  isThumbnailRequest: boolean;
  isDashboardThumb: boolean;
};

function classify(path: CdnPath): CdnRequest {
  return {
    ...path,
    isImage: isTransformableImageExt(path.ext),
    isVideo: isVideoExt(path.ext),
    isThumbnailRequest:
      path.params.thumbnail === "true" || path.params.thumbnail === "1",
    isDashboardThumb: isDashboardThumbSegment(path.transform),
  };
}

/**
 * Filled in as serveCdnRequest learns what it is actually doing, so that the
 * single emit in handleCdnRequest can describe the delivery whatever exit it
 * took. Mutable and passed down rather than returned: every early return - a
 * 402, a 429, a 404 - has to end up in the log too.
 */
type DeliveryContext = {
  /** Unset while the request has no attributable owner; nothing is logged then. */
  userId?: string;
  bucketId?: string;
  path: string;
  kind: DeliveryKind;
  cache: CacheOutcome;
  /**
   * Reported to PostHog but kept out of the customer's activity tab: the
   * dashboard talking to itself (its thumbnail handshake, anything else
   * isDashboardTraffic catches), and the "still processing" 202s, which
   * delivered no bytes.
   */
  quiet: boolean;
  /** Cleared for the range requests a single playback fans out into. */
  loggable: boolean;
};


// ACAO because this body is the only explanation a developer gets when the
// browser refuses their asset - an opaque CORS failure would hide it.
async function quotaResponse(
  userId: string,
  featureId: FeatureId,
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
// Serves byte ranges, because on the video path this is the only response a
// player ever gets: without Accept-Ranges and a 206, Safari refuses to play
// the file at all and every browser loses seeking.
async function serveOriginalFallback(
  env: Env,
  req: CdnRequest,
  tenantRoot: string,
  rangeHeader: string | null,
  cacheControl: string,
): Promise<Response | null> {
  if (req.transform || Object.keys(req.params).length > 0) return null;
  // Only a ranged request pays for the extra HEAD, and it needs one: the total
  // size belongs in Content-Range, and a ranged get alone doesn't report it.
  const meta = rangeHeader
    ? await getOriginalMetadata(env.MEDIA_BUCKET, tenantRoot, req.relativePath)
    : null;
  if (rangeHeader && !meta) return null;
  // Null covers malformed and multi-range headers as well as unsatisfiable
  // ones, and all of them fall back to the whole file. RFC 7233 asks for a 416
  // on the unsatisfiable case specifically, but answering a range we didn't
  // understand with the complete file is the reading every player recovers
  // from.
  const range = meta ? parseRangeHeader(rangeHeader, meta.size) : null;
  const object = await downloadOriginal(
    env.MEDIA_BUCKET,
    tenantRoot,
    req.relativePath,
    range ? { range } : undefined,
  );
  if (!object) return null;
  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || contentTypeForExt(req.ext),
  );
  headers.set("Accept-Ranges", "bytes");
  // Cross-origin by design - these URLs are embedded on third-party sites.
  headers.set("Access-Control-Expose-Headers", RANGE_EXPOSE_HEADERS);
  headers.set("Cache-Control", cacheControl);
  // What makes the line above reachable at all for a video. Every playback is
  // ranged, so every video delivery here is a 206, and a browser will not store
  // a partial response that carries no strong validator. Without this the year
  // was unusable for exactly the traffic it was raised for.
  headers.set("ETag", object.httpEtag);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Openinary-Cache", "ORIGINAL");
  return objectResponse(object, headers, range);
}

// The single place the Worker decides what an image request that named no
// format - or named f_auto - actually resolves to, so the key looked up below
// and the segment forwarded to the container can never disagree about it.
function negotiatedFormat(request: Request, req: CdnRequest): string {
  return determineOptimalFormatForCache(
    request.headers.get("User-Agent") ?? "",
    request.headers.get("Accept") ?? undefined,
    req.ext,
  );
}

/**
 * The params the container will actually have stored a derivative under, which
 * is not always what the URL asked for. The cache lookup, the CACHE_PARAMS
 * header and the key UsageMeter heads to confirm a launched transform all come
 * from here, so none of them can disagree.
 */
function derivativeParams(
  request: Request,
  req: CdnRequest,
): Record<string, string> {
  if (req.isDashboardThumb) {
    // Dashboard thumbnails skip content negotiation, and skip their own
    // size too: all four of @openinary/ui's preview sizes resolve to the one
    // stored object per asset. See dashboardThumbParams.
    return dashboardThumbParams(req.isImage);
  }
  if (req.isImage && (!req.params.format || req.params.format === "auto")) {
    // f_auto is treated exactly like "no format named": both mean "pick the
    // best one for this client". The spread overwrites format in place, so an
    // f_auto segment keeps its original key order.
    return { ...req.params, format: negotiatedFormat(request, req) };
  }
  return req.params;
}

// The Worker side of @openinary/core's TransformService cache check:
// reconstructs the R2 key a completed transform was saved under and serves it
// directly, so a repeat request for an already-generated derivative never
// wakes the container. Video derivatives included: the container answering
// every playback of an already-encoded file costs a wake on the hottest path
// there is.
async function tryServeFromR2Cache(
  request: Request,
  env: Env,
  req: CdnRequest,
  tenantRoot: string,
): Promise<Response | null> {
  if (!req.isImage && !req.isVideo) return null;
  const params = derivativeParams(request, req);

  // What the container actually stored under this key. A video source only
  // yields a video when the requested format is a container format: f_webp on
  // an .mp4 is a still frame, and every header below has to describe that
  // image instead - starting with Content-Type, since a webp served as
  // video/mp4 is what puts an empty player on screen.
  const outputExt = req.isVideo
    ? determineOutputFormat(req.ext, params.format).format
    : params.format || req.ext;
  const servesVideo = req.isVideo && isVideoExt(outputExt);

  const key = legacyCloudKey(`${tenantRoot}/${req.relativePath}`, params);
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
  headers.set("Content-Type", contentTypeForFormat(outputExt));
  headers.set("Cache-Control", ORIGINAL_CACHE_CONTROL);
  headers.set("ETag", `"${JSON.stringify(params)}"`);
  // Embedded on arbitrary third-party sites, not just the dashboard.
  headers.set("Access-Control-Allow-Origin", "*");
  if (servesVideo) {
    headers.set("X-Video-Status", "ready");
    // Announced unconditionally: a player that cannot tell whether seeking is
    // supported downloads the file from the start every time.
    headers.set("Accept-Ranges", "bytes");
  }
  // Same as core: a negotiated format must not leak to other clients through
  // shared caches.
  if (req.isImage && !req.isDashboardThumb && params.format !== req.params.format) {
    headers.set("Vary", "Accept");
  }
  headers.set("X-Openinary-Cache", "HIT");
  const range = wantsRange ? servedRange(object) : null;
  if (!range) headers.set("X-Openinary-Cache-Key", key);
  return objectResponse(object, headers, range);
}

// Both quota refusals take the same shape - serve the stored original if the
// request allows it, otherwise 402 - and both have to say which of the two
// happened, since one delivered bytes (and is billed one CDN request) and the
// other delivered nothing.
async function quotaFallback(
  env: Env,
  req: CdnRequest,
  tenantRoot: string,
  rangeHeader: string | null,
  delivery: DeliveryContext,
  userId: string,
  featureId: FeatureId,
): Promise<Response> {
  const original = await serveOriginalFallback(
    env,
    req,
    tenantRoot,
    rangeHeader,
    FALLBACK_CACHE_CONTROL,
  );
  if (original) {
    delivery.cache = "ORIGINAL";
    return original;
  }
  return quotaResponse(userId, featureId);
}

// Non-thumbnail video requests always miss the R2 cache before their first
// encode, so this is the one synchronous point where "is this video about to
// be enqueued" is known. Thumbnail extraction is cheap regardless of source
// length and shares the image cache path, so it isn't gated here.
async function checkVideoProcessing(
  userId: string,
  tenantRoot: string,
  req: CdnRequest,
): Promise<boolean> {
  if (req.isThumbnailRequest) return true;
  const seconds = await durationOf(`${tenantRoot}/${req.relativePath}`);
  // Unknown duration (parsing failed or predates this feature) - let it
  // through rather than block on missing metadata. The job is still billed:
  // metering measures the container, not the source.
  if (seconds === null) return true;
  const estimate = Math.max(1, Math.ceil(seconds * ESTIMATED_PROCESSING_RATIO));
  return checkFeature(userId, "video_processing_seconds", estimate);
}

// Every /b/* outcome - not just the two success paths that set it inline -
// has to carry CORS. A browser reports a header-less 404/429/500 as "CORS
// error" and turns the caller's fetch into `TypeError: Failed to fetch`, so
// the real status never reaches the client. Also catches, so a throw becomes a
// CORS-tagged 500 rather than the runtime's bare error page.
export async function handleCdnRequest(
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
    // selected, and a preflight OPTIONS carries no body either. None of them
    // is a delivery, so none may be billed or shown.
    quiet:
      request.method !== "GET" ||
      isDashboardTraffic(
        request.headers.get("Origin"),
        request.headers.get("Referer"),
        DASHBOARD_ORIGIN,
      ),
    loggable: isOpeningRange(request.headers.get("Range")),
  };
  let response: Response;
  try {
    response = await serveCdnRequest(request, env, ctx, url, delivery);
  } catch (error) {
    console.error("%s", `CDN request failed for ${url.pathname}`, error);
    response = new Response("Internal error", { status: 500 });
  }
  // Emitted here because this is the first point that knows the status the
  // caller actually received, and the status decides whether anything is
  // billed at all.
  if (delivery.loggable && delivery.userId && delivery.bucketId) {
    const event = deliveryEvent({
      now: Date.now(),
      bucketId: delivery.bucketId,
      path: delivery.path,
      kind: delivery.kind,
      cache: delivery.cache,
      status: response.status,
      quiet: delivery.quiet,
    });
    const userId = delivery.userId;
    // Viewer + asset, so UsageMeter can tell one viewing that re-opened the
    // stream from two genuine deliveries. The IP is the same one the rate
    // limiter keys on; it is compared in the Durable Object's memory for a
    // few seconds and never persisted or shipped anywhere.
    const viewer = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const dedupeKey = `${viewer}|${delivery.bucketId}|${delivery.path}`;
    ctx.waitUntil(
      meterFor(env.USAGE_METER, userId)
        .hit(event, delivery.quiet, dedupeKey)
        .then(async (first) => {
          // The Get started checklist's "Serve it back", as a funnel step.
          if (first) {
            await captureEvent("first_cdn_delivery", userId, {
              kind: delivery.kind,
            });
          }
        }),
    );
  }
  // SVGs predate upload validation (core rejects them now - stored-XSS
  // vector) but some are still in R2. Whatever path produced the response,
  // never let one render inline on the CDN origin: octet-stream + attachment
  // neutralizes the script context.
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

  const bucketId = cdnBucketId(url.pathname);
  if (!bucketId) return new Response("Not found", { status: 404 });
  const owner = await resolveBucketOwner(
    env.BUCKET_OWNERS,
    bucketId,
    getBucketOwner,
    (p) => ctx.waitUntil(p),
  );
  if (!owner) return new Response("Not found", { status: 404 });
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

  // Anything else under /b/{bucket}/ names no file: there is nothing for the
  // container to transform, so it is not woken to say so.
  const requested = parseCdnPath(url.pathname);
  if (!requested) return textResponse(404, "Not found");

  const tenantRoot = tenantRootFor(userId, bucketId);
  // Overlays: the l_ pair names a file relative to the customer's bucket and
  // is rewritten into the tenant scope here, before anything keys, meters or
  // forwards on it - the container's storage is the whole R2 bucket, so an
  // unscoped l_ would read (or 404) outside this tenant.
  const overlayScope = scopeCdnOverlay(requested, tenantRoot);
  if (!overlayScope.ok) return textResponse(400, overlayScope.error);
  const req = classify(overlayScope.path);
  delivery.path = req.relativePath;
  delivery.kind = req.isImage ? "image" : req.isVideo ? "video" : "other";
  // Set here, not on the 404 branch further down: once the browser has filled
  // the thumbnail cache these requests are served, and marking them only on
  // the miss let every subsequent grid render bill and log itself as a public
  // delivery. Assigned, never cleared: the method check may already have set
  // it.
  delivery.quiet ||= req.isDashboardThumb;

  // A URL carrying no transform is "give me this file", and it has to be
  // answered as one, for images as well as videos: core would enqueue a full
  // transcode for a bare video URL, and look a bare image up as a derivative
  // under the negotiated format, waking the container and billing an
  // image_transformation for a URL that asked for none. Optimization is
  // opt-in through the URL: f_auto, q_auto, or any explicit parameter.
  //
  // Ahead of the cache lookup on purpose: a derivative may well sit in R2
  // under the key this request used to resolve to, and serving that would
  // quietly reinstate the old behaviour.
  //
  // Narrowed to what a browser renders as-is (IMAGE_FORMATS): .psd and .heic
  // are accepted at upload but no browser renders either. A bare /t/comp.psd
  // has always meant the png core decodes it into, and heic is refused there.
  if (req.isVideo || IMAGE_FORMATS.has(req.ext)) {
    // Returns null the moment any transform or parameter is present.
    const original = await serveOriginalFallback(
      env,
      req,
      tenantRoot,
      rangeHeader,
      ORIGINAL_CACHE_CONTROL,
    );
    if (original) {
      delivery.cache = "ORIGINAL";
      return original;
    }
  }

  const cached = await tryServeFromR2Cache(request, env, req, tenantRoot);
  if (cached) {
    delivery.cache = "HIT";
    return cached;
  }

  // Dashboard thumbnails are generated by the browser, never here: the
  // dashboard's <img> fires the moment MediaGrid mounts, long before the
  // client has finished encoding and uploading the thumbnail, so this is the
  // request that used to lose that race, wake the container and burn one
  // image_transformation per uploaded asset. no-store so neither the browser
  // nor the edge pins the miss once the object shows up.
  if (req.isDashboardThumb) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Does the source even exist? One R2 head, on the cache-miss path only, and
  // it is what lets both 202s below go out immediately: picking "processing"
  // for a path that does not exist is a promise that never resolves. no-store
  // because the object can show up a moment later (an upload in flight).
  if (!(await existsOriginal(env.MEDIA_BUCKET, tenantRoot, req.relativePath))) {
    return textResponse(404, "Not found");
  }
  // The overlay must exist too, for the same reason.
  if (overlayScope.overlayRelativePath !== null) {
    const missing = await overlayMissingResponse(
      env.MEDIA_BUCKET,
      tenantRoot,
      overlayScope.overlayRelativePath,
    );
    if (missing) return missing;
  }

  // A cache miss on an image is a real transformation about to happen, and
  // one on a full video is about to be enqueued: gate both on quota before
  // waking the container.
  if (req.isImage) {
    if (!(await checkFeature(userId, "image_transformations", 1))) {
      return quotaFallback(env, req, tenantRoot, rangeHeader, delivery, userId, "image_transformations");
    }
  } else if (req.isVideo) {
    if (!(await checkVideoProcessing(userId, tenantRoot, req))) {
      return quotaFallback(env, req, tenantRoot, rangeHeader, delivery, userId, "video_processing_seconds");
    }
  }

  const params = derivativeParams(request, req);
  // The container is asked for the same concrete format the cache lookup went
  // looking for, never "auto" - see resolveAutoFormat.
  const forwarded =
    req.isImage && req.params.format === "auto"
      ? withTransform(req, resolveAutoFormat(req.transform, params.format))
      : req;
  const rewritten = new URL(request.url);
  rewritten.pathname = upstreamPath(forwarded, tenantRoot);
  const upstream = new Request(rewritten, request);
  // Always overwritten, never forwarded from the client: it decides which R2
  // key the container writes under (see container/cache-params.ts).
  upstream.headers.set(CACHE_PARAMS_HEADER, JSON.stringify(params));
  // Through the cached CdnAssets entrypoint (see wrangler.jsonc's "exports"),
  // which gets this path tiered caching and request collapsing.
  const pending = ctx.exports.CdnAssets.fetch(upstream);
  // Held by waitUntil from the moment it exists, because both 202 branches
  // below return without awaiting it: once the response is out, the runtime
  // cancels any subrequest still in flight, and that cancel used to land
  // during the container's cold start - no derivative was ever written, and
  // every retry answered the same 202, forever. The logging is the only trace
  // of a transform the container failed or refused once a 202 has gone out.
  ctx.waitUntil(
    pending.then(
      (response) => {
        if (!response.ok)
          console.error(
            `Transform request for ${url.pathname} answered ${response.status}`,
          );
      },
      (error) => {
        console.error("%s", `Transform request failed for ${url.pathname}`, error);
      },
    ),
  );
  delivery.cache = "MISS";

  // A non-thumbnail video transform is asynchronous on the other side: core
  // enqueues the job and answers 202, never bytes. Waiting for that 202 would
  // charge the caller the container's wake time for a response we can write
  // ourselves. Trade-off: a container that answers 503/429 is not passed
  // through, so a failed enqueue shows as "processing" until the client's
  // next request creates the job; /video-status says not_found meanwhile,
  // which useVideoStatus treats as "keep polling".
  if (req.isVideo && !req.isThumbnailRequest) {
    delivery.quiet = true;
    // Read from Postgres and the container's Durable Object, never from the
    // container itself: answering this must not cost the wake it predicts.
    const estimate = await videoProcessingEstimate(
      env,
      `${tenantRoot}/${req.relativePath}`,
      deliveryTarget(`${req.transform}/f`).params,
    );
    return processingResponse(estimate, {
      message: "Video transformation is being processed",
      // From the URL the client sent, not the tenant-scoped one forwarded:
      // that would leak ugc/{userId}/{bucketId} in its overlay, and
      // /video-status scopes the overlay itself.
      statusUrl: statusPath(requested),
    }, { "X-Video-Status": "processing" });
  }
  if (req.isImage) {
    // Billed by UsageMeter rather than here, because this request is about to
    // answer 202 and stop existing while the container is still encoding.
    // UsageMeter outlives the request and confirms by heading the key, which
    // core writes before it answers. See its transformLaunched.
    ctx.waitUntil(
      meterFor(env.USAGE_METER, userId).transformLaunched(
        legacyCloudKey(`${tenantRoot}/${req.relativePath}`, params),
      ),
    );
    // No wait: the source exists, so "not ready yet" is the only thing this
    // can be. The transform still runs and writes the derivative before it
    // answers, so the next request for this URL is a HIT. A source that
    // exists but will never transform stays a 202 on every retry; it is
    // logged above rather than surfaced, the trade for never holding a caller.
    delivery.quiet = true;
    const estimate = await imageProcessingEstimate(
      env,
      rewritten.pathname,
      params.format ?? req.ext,
    );
    return processingResponse(estimate, {
      message: "Image transformation is being generated",
    });
  }

  // Only a video thumbnail (extracted synchronously, like an image) or an
  // extension neither branch above claimed still waits on the container.
  const response = await pending;
  if (response.headers.get("X-Video-Status") === "processing") {
    // 202 + "still encoding, poll the status URL": no media was delivered, so
    // nothing to bill or show.
    delivery.quiet = true;
  }
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Openinary-Cache", "MISS");
  return new Response(response.body, { status: response.status, headers });
}

function processingResponse(
  estimate: ProcessingEstimate,
  body: Parameters<typeof processingBody>[1],
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(processingBody(estimate, body)), {
    status: 202,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...processingHeaders(estimate),
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
      "X-Openinary-Cache": "MISS",
    },
  });
}
