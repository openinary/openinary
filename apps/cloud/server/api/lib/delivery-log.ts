// What one publicly served asset looks like in the activity log, and the
// rules deciding whether it cost the customer anything.
//
// Free of Worker/DB imports so every rule below can be asserted under plain
// node (see delivery-log.test.ts). These are money decisions: the numbers a
// row carries here are the same numbers UsageMeter reports to Autumn, so a
// disagreement between this file and the dashboard is a disagreement between
// the dashboard and the invoice.

/**
 * Single-letter keys on purpose. 500 of these are held per account and
 * written to Durable Object storage once per flush window, and the same JSON
 * is billed by the byte on PostHog's side - full names roughly double both.
 * The expansion into something readable happens once, in the UI.
 */
export type DeliveryEvent = {
  /** Epoch ms. */
  t: number;
  /** Bucket id, so the UI can show which bucket served it. */
  b: string;
  /** Path within the bucket, truncated to PATH_MAX. */
  p: string;
  k: DeliveryKind;
  c: CacheOutcome;
  /** HTTP status actually returned to the caller. */
  s: number;
  /** cdn_requests charged for this delivery: 0 or 1. */
  cdn: 0 | 1;
  /** image_transformations charged for this delivery: 0 or 1. */
  img: 0 | 1;
};

export type DeliveryKind = "image" | "video" | "other";
/**
 * HIT - served from the R2 transform cache. MISS - the container ran.
 * NONE - nothing was served.
 *
 * ORIGINAL - the source file was served in place of a derivative, which
 * happens for two unrelated reasons. Quota is spent (see
 * serveOriginalFallback): the customer still gets bytes and still pays one
 * CDN request. Or a video transform is mid-encode and core streams the source
 * as a stopgap: that one is `quiet`, so it reaches PostHog but never the
 * customer's tab. `cdn` carries the difference, not this field.
 */
export type CacheOutcome = "HIT" | "MISS" | "ORIGINAL" | "NONE";

// Long enough for a real nested path, short enough that 500 rows stay well
// inside the 128 KiB a single Durable Object storage value may hold.
const PATH_MAX = 120;

/**
 * One playback is many HTTP hits: a <video> element pulls the file in byte
 * ranges and re-requests on seek and buffer. Only the opening request of a
 * delivery counts, so a view costs 1 cdn_request rather than 6.
 *
 * The activity log applies this same test before recording anything, not just
 * before billing. A log that showed the seeks would show six lines against one
 * charge, and the customer would be right to read that as overbilling.
 */
export function isBillableRange(range: string | null): boolean {
  return !range || range.startsWith("bytes=0-");
}

/**
 * How long after a viewer opens an asset a second opening of the same asset by
 * the same viewer is still the same delivery.
 *
 * isBillableRange above only collapses the range requests of one open stream.
 * A browser opens the stream more than once: navigating straight to a video URL
 * fetches it once to build the video document and again for the <video> element
 * inside it, both with the opening range, a second or so apart - so one viewing
 * logged and billed two CDN requests. A media element restarting after a stall
 * or seeking back to zero does the same thing.
 *
 * 15s is well past those re-opens and well short of a viewer deliberately
 * replaying something. Viewers are told apart by IP, so a handful of people
 * behind one NAT opening the same asset within the window count once - the same
 * side every other ambiguity in this file falls on.
 */
const DEDUPE_WINDOW_MS = 15_000;

// Bounds the in-memory key map (see seenRecently) if an account is serving many
// distinct assets at once. Purely a memory ceiling; nothing depends on the size.
const DEDUPE_MAX_KEYS = 2_000;

/**
 * Whether `key` was already counted inside the window, recording it if not.
 * Mutates `seen`, which the caller owns and keeps in memory only - losing it to
 * an eviction costs at most one double count.
 *
 * A repeat deliberately does not refresh the timestamp: the window runs from
 * the first delivery, so a client re-requesting forever still pays once per
 * window rather than never.
 */
export function seenRecently(
  seen: Map<string, number>,
  key: string,
  now: number,
): boolean {
  const at = seen.get(key);
  if (at !== undefined && now - at < DEDUPE_WINDOW_MS) return true;
  seen.set(key, now);
  if (seen.size > DEDUPE_MAX_KEYS) {
    for (const [k, t] of seen) {
      if (now - t >= DEDUPE_WINDOW_MS) seen.delete(k);
    }
  }
  return false;
}

/**
 * Whether this delivery is our own dashboard fetching an asset to show its
 * owner, rather than an asset served to the public. Such a request is marked
 * quiet by the caller: no charge, and no line in the customer's activity tab.
 *
 * worker/index.ts's isDashboardThumb only recognises the four transform
 * segments @openinary/ui builds grid thumbnails from. Its asset-details panel
 * asks for the bare `/t/{path}` - no transform segment, so that test is false
 * - and every asset opened in the media library was therefore billed one
 * cdn_request and written into the log as a public delivery. Which also meant
 * the Get started checklist's "serve your first request" ticked itself the
 * moment the user clicked a file.
 *
 * `origin` covers @openinary/ui's fetches, `referer` the <img> the panel
 * renders (cross-origin, so the default referrer policy sends the origin
 * alone). A customer's own site sends its own origin on both, so none of
 * their traffic is caught here. Spoofable, in that someone could send our
 * origin to avoid being billed a fraction of a cent for traffic of their own
 * while breaking their own referrer analytics to do it.
 */
export function isDashboardTraffic(
  origin: string | null,
  referer: string | null,
  dashboardOrigin: string | undefined,
): boolean {
  const source = origin ?? referer;
  if (!source || !dashboardOrigin) return false;
  try {
    return new URL(source).origin === new URL(dashboardOrigin).origin;
  } catch {
    // Either header can arrive malformed, and "null" is a real Origin value
    // browsers send from sandboxed contexts. Neither is our dashboard.
    return false;
  }
}

/**
 * Whether a response actually delivered the asset. Anything else - a quota
 * 402, an account 429, a 404, a container 500 - is recorded with zero usage,
 * because the customer received no bytes and must not pay for the attempt.
 */
export function isDelivered(status: number): boolean {
  return (status >= 200 && status < 300) || status === 304;
}

export function deliveryEvent(input: {
  now: number;
  bucketId: string;
  path: string;
  kind: DeliveryKind;
  cache: CacheOutcome;
  status: number;
  /** True only when the container produced a new image derivative. */
  transformed: boolean;
  /**
   * Kept out of the customer's activity tab and charged nothing. Still shipped
   * to PostHog, which is where we watch what the product itself is doing.
   *
   * Two sources, both traffic the customer did not ask for:
   *
   * - our own dashboard fetching its grid thumbnails, matching the /thumbnail
   *   upload route that already absorbs this cost deliberately;
   * - the untransformed original core streams back while a transcode is still
   *   encoding, whose count is set by our cache headers and our encode speed
   *   rather than by anything the viewer did.
   *
   * Both have to be zero rather than merely hidden, or the customer's CDN
   * count would exceed the sum of every line they can see, and the difference
   * would be traffic they never caused.
   */
  quiet?: boolean;
}): DeliveryEvent {
  const delivered = isDelivered(input.status) && !input.quiet;
  return {
    t: input.now,
    b: input.bucketId,
    p: input.path.slice(0, PATH_MAX),
    k: input.kind,
    c: input.cache,
    s: input.status,
    cdn: delivered ? 1 : 0,
    // Gated on `delivered` too: a transform that errored out wakes the
    // container on our dime, not the customer's.
    img: delivered && input.transformed ? 1 : 0,
  };
}

/** Newest last, capped at `max` by dropping from the front. */
export function appendCapped<T>(list: T[], item: T, max: number): T[] {
  list.push(item);
  return list.length > max ? list.slice(list.length - max) : list;
}

// --- PostHog Logs (OTLP/HTTP, JSON encoding) ---

// OTLP severity numbers, from the spec's ranges.
const SEVERITY = {
  INFO: [9, "INFO"],
  WARN: [13, "WARN"],
  ERROR: [17, "ERROR"],
} as const;

function severityOf(status: number) {
  if (status >= 500) return SEVERITY.ERROR;
  if (status >= 400) return SEVERITY.WARN;
  return SEVERITY.INFO;
}

const attr = (key: string, value: string | number) => ({
  key,
  // int64 is a string in proto3's JSON mapping; sending a bare number is the
  // usual reason a receiver drops the attribute rather than the whole record.
  value:
    typeof value === "number"
      ? { intValue: String(value) }
      : { stringValue: value },
});

/**
 * An OTLP ExportLogsServiceRequest for one account's window of deliveries.
 * PostHog's endpoint is a generic OTLP receiver that accepts plain JSON, so
 * this is a fetch away and needs no OpenTelemetry SDK in the Worker.
 *
 * Attributes are flat and named the way they'd be filtered in the logs view
 * (user_id, bucket_id, cache, status...), which is also what keeps the
 * per-record byte count - what PostHog bills - down.
 */
export function otlpLogsBody(userId: string, events: DeliveryEvent[]) {
  return {
    resourceLogs: [
      {
        resource: { attributes: [attr("service.name", "openinary-cdn")] },
        scopeLogs: [
          {
            logRecords: events.map((event) => {
              const [severityNumber, severityText] = severityOf(event.s);
              return {
                timeUnixNano: String(event.t * 1_000_000),
                severityNumber,
                severityText,
                body: {
                  stringValue: `${event.c} ${event.s} ${event.b}/${event.p}`,
                },
                attributes: [
                  attr("user_id", userId),
                  attr("bucket_id", event.b),
                  attr("path", event.p),
                  attr("kind", event.k),
                  attr("cache", event.c),
                  attr("status", event.s),
                  attr("cdn_requests", event.cdn),
                  attr("image_transformations", event.img),
                ],
              };
            }),
          },
        ],
      },
    ],
  };
}
