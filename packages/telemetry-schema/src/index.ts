/**
 * Every telemetry event an instance may send, as the instance types it
 * (apps/api) and as the proxy checks it (apps/telemetry). Pure: the proxy is
 * a Worker, so nothing here may import Node.
 */

export const COUNT_BUCKETS = ["0", "1-10", "11-100", "101-1000", "1000+"] as const;
export type CountBucket = (typeof COUNT_BUCKETS)[number];

export function bucketCount(n: number): CountBucket {
  if (n <= 0) return "0";
  if (n <= 10) return "1-10";
  if (n <= 100) return "11-100";
  if (n <= 1000) return "101-1000";
  return "1000+";
}

/** Onboarding answers are option ids, never free text. */
export const SLUG = /^[a-z0-9-]{1,40}$/;
export const MAX_USE_CASES = 20;

type StorageBackend = "s3" | "local";

export type TelemetryEvent =
  | {
      event: "instance_started";
      properties: {
        version: string;
        deployment_mode: string;
        storage_backend: StorageBackend;
        os_platform: string;
        os_arch: string;
        node_version: string;
      };
    }
  | {
      event: "daily_heartbeat";
      properties: {
        version: string;
        deployment_mode: string;
        storage_backend: StorageBackend;
        video_jobs_bucket: CountBucket;
      };
    }
  | {
      event: "onboarding_completed";
      properties: {
        role: string;
        use_cases: string[];
        source: string;
      };
    };

const MAX_STRING_LEN = 64;

const shortString = (v: unknown) =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_STRING_LEN;
const slug = (v: unknown) => typeof v === "string" && SLUG.test(v);
const backend = (v: unknown) => v === "s3" || v === "local";

type Properties = Record<string, unknown>;

// The exact, closed set of properties per event: anything else is rejected.
const SCHEMAS: Record<
  TelemetryEvent["event"],
  Record<string, (v: unknown) => boolean>
> = {
  instance_started: {
    version: shortString,
    deployment_mode: shortString,
    storage_backend: backend,
    os_platform: shortString,
    os_arch: shortString,
    node_version: shortString,
  },
  daily_heartbeat: {
    version: shortString,
    deployment_mode: shortString,
    storage_backend: backend,
    video_jobs_bucket: (v) => (COUNT_BUCKETS as readonly unknown[]).includes(v),
  },
  onboarding_completed: {
    role: slug,
    use_cases: (v) =>
      Array.isArray(v) && v.length <= MAX_USE_CASES && v.every(slug),
    source: slug,
  },
};

export function isTelemetryEvent(event: unknown, properties: Properties): boolean {
  if (typeof event !== "string" || !Object.prototype.hasOwnProperty.call(SCHEMAS, event)) return false;
  const schema = SCHEMAS[event as TelemetryEvent["event"]];
  const keys = Object.keys(properties);
  return (
    keys.length === Object.keys(schema).length &&
    Object.entries(schema).every(
      ([key, valid]) => key in properties && valid(properties[key]),
    )
  );
}
