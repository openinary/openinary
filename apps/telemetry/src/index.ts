/**
 * Openinary telemetry proxy.
 *
 * Self-hosted Openinary instances POST anonymous usage pings here instead of
 * talking to PostHog directly. This keeps the PostHog project API key out of
 * the public repo's runtime path, validates every payload against a strict
 * whitelist (so a forged request can't inject arbitrary event names or
 * properties into PostHog), and rate-limits per instance and per IP so a
 * single bad actor can't flood the dataset.
 *
 * Keep EVENT_SCHEMAS in sync with apps/api/src/utils/telemetry.ts.
 */

export interface Env {
  POSTHOG_HOST: string;
  POSTHOG_API_KEY: string;
  PER_INSTANCE_LIMITER: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  PER_IP_LIMITER: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNT_BUCKETS = new Set(["0", "1-10", "11-100", "101-1000", "1000+"]);
const MAX_STRING_LEN = 64;

type Validator = (properties: Record<string, unknown>) => boolean;

function isShortString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_STRING_LEN;
}

// One entry per allowed event. `keys` is the exact, closed set of properties
// accepted for that event — anything else in the payload is rejected outright.
const EVENT_SCHEMAS: Record<string, Validator> = {
  instance_started: (p) => {
    const keys = [
      "version",
      "deployment_mode",
      "storage_backend",
      "os_platform",
      "os_arch",
      "node_version",
    ];
    if (!sameKeys(p, keys)) return false;
    return (
      isShortString(p.version) &&
      isShortString(p.deployment_mode) &&
      (p.storage_backend === "s3" || p.storage_backend === "local") &&
      isShortString(p.os_platform) &&
      isShortString(p.os_arch) &&
      isShortString(p.node_version)
    );
  },
  daily_heartbeat: (p) => {
    const keys = ["version", "deployment_mode", "storage_backend", "video_jobs_bucket"];
    if (!sameKeys(p, keys)) return false;
    return (
      isShortString(p.version) &&
      isShortString(p.deployment_mode) &&
      (p.storage_backend === "s3" || p.storage_backend === "local") &&
      typeof p.video_jobs_bucket === "string" &&
      COUNT_BUCKETS.has(p.video_jobs_bucket)
    );
  },
};

function sameKeys(obj: Record<string, unknown>, allowed: string[]): boolean {
  const objKeys = Object.keys(obj);
  if (objKeys.length !== allowed.length) return false;
  return allowed.every((k) => k in obj);
}

interface TelemetryPayload {
  instance_id: string;
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

function isValidPayload(body: unknown): body is TelemetryPayload {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  if (typeof b.instance_id !== "string" || !UUID_RE.test(b.instance_id)) return false;
  if (typeof b.event !== "string" || !(b.event in EVENT_SCHEMAS)) return false;
  if (typeof b.timestamp !== "string" || Number.isNaN(Date.parse(b.timestamp))) return false;
  if (typeof b.properties !== "object" || b.properties === null) return false;

  const validate = EVENT_SCHEMAS[b.event];
  return validate(b.properties as Record<string, unknown>);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/collect") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      return new Response("Unsupported media type", { status: 415 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!isValidPayload(body)) {
      return new Response("Invalid payload", { status: 400 });
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const [instanceLimit, ipLimit] = await Promise.all([
      env.PER_INSTANCE_LIMITER.limit({ key: body.instance_id }),
      env.PER_IP_LIMITER.limit({ key: ip }),
    ]);

    if (!instanceLimit.success || !ipLimit.success) {
      return new Response("Rate limited", { status: 429 });
    }

    // Forward as an accepted, minimal PostHog capture event. distinct_id is
    // the anonymous instance UUID — never anything tied to a real person.
    const posthogPayload = {
      api_key: env.POSTHOG_API_KEY,
      event: body.event,
      distinct_id: body.instance_id,
      timestamp: body.timestamp,
      properties: {
        ...body.properties,
        $process_person_profile: false, // aggregate only, no per-user profile
        // Without this, PostHog's GeoIP transformation geolocates the request's
        // source IP — which is this Worker's own egress IP, not the reporting
        // instance's. Passing $ip makes it geolocate the real client instead.
        $ip: ip,
      },
    };

    try {
      const res = await fetch(`${env.POSTHOG_HOST}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(posthogPayload),
      });

      if (!res.ok) {
        console.error("PostHog rejected event", res.status, await res.text());
      }
    } catch (error) {
      console.error("Failed to forward event to PostHog", error);
      // Still return 204 — the caller doesn't need to know or retry.
    }

    return new Response(null, { status: 204 });
  },
};
