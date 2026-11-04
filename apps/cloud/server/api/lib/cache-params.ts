import { AsyncLocalStorage } from "node:async_hooks";

// Why this exists
// ---------------
// R2 derivative keys are md5(path + JSON.stringify(params)). The Worker
// recomputes them on its own (worker/transform-cache.ts, a vendored copy of
// core's v1.3.0 parser: every value a string, width/height/resize/crop/
// startOffset/endOffset appended last). Core's overlays release changed its
// parser to typed values (numbers, booleans, no "resize") in URL order, so a
// container built from it would write every existing URL's derivative under a
// new key: a cache miss - and a re-transform, re-billed - for every asset ever
// served, and the Worker would never find any of them again.
//
// So the container keys storage with the Worker's params, not core's:
//   1. Per request, the Worker sends the exact params it will look up under
//      (CACHE_PARAMS_HEADER); the storage wrapper below uses them verbatim.
//   2. Calls made outside a request (VideoWorker uploading a finished job)
//      reuse what the same core params mapped to during the request that
//      enqueued the job (in-memory, per instance).
//   3. Failing both (job survived a container restart), toCloudCacheParams
//      converts core's params back to the Worker's shape. Exact for every
//      parameter except lossy ones core drops (w_auto/h_auto/a_auto,
//      t_1 vs t_true, tt_ formatting): those miss once and get regenerated.

export type CloudCacheParams = Record<string, string>;

const TRAILING_KEYS = [
  "width",
  "height",
  "resize",
  "crop",
  "startOffset",
  "endOffset",
] as const;
const TRAILING = new Set<string>(TRAILING_KEYS);

/** Core (typed) params -> the Worker's legacy all-string shape. */
export function toCloudCacheParams(
  input: object | null | undefined,
): CloudCacheParams {
  const out: CloudCacheParams = {};
  if (!input) return out;
  const params = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || TRAILING.has(key)) continue;
    out[key] = typeof value === "boolean" ? (value ? "true" : "") : String(value);
    if (out[key] === "") delete out[key];
  }
  const width = params.width != null ? String(params.width) : undefined;
  const height = params.height != null ? String(params.height) : undefined;
  if (width) out.width = width;
  if (height) out.height = height;
  if (width && height) out.resize = `${width}x${height}`;
  if (params.crop != null) out.crop = String(params.crop);
  if (params.startOffset != null) out.startOffset = String(params.startOffset);
  if (params.endOffset != null) out.endOffset = String(params.endOffset);
  return out;
}

export const requestCacheParams = new AsyncLocalStorage<CloudCacheParams | null>();

/** Parses the header; anything malformed is ignored (falls back to 2/3). */
export function parseCacheParamsHeader(
  raw: string | undefined | null,
): CloudCacheParams | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: CloudCacheParams = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") return null;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

const MEMO_LIMIT = 2000;

// Storage methods whose second argument feeds KeyGenerator.generateKey.
const KEYED_METHODS = new Set([
  "exists",
  "upload",
  "download",
  "getSignedUrl",
  "getOptimizedMetadata",
]);

/**
 * Wraps a core storage client so every derivative key uses the Worker's
 * params (see the header comment). Originals (no params) pass through.
 */
export function withCloudCacheKeys<T>(storage: T): T {
  if (!storage || typeof storage !== "object") return storage;
  const memo = new Map<string, CloudCacheParams>();
  const resolve = (path: string, params: unknown): unknown => {
    if (!params || typeof params !== "object") return params;
    const memoKey = `${path}\u0000${JSON.stringify(params)}`;
    const fromRequest = requestCacheParams.getStore();
    if (fromRequest) {
      if (memo.size >= MEMO_LIMIT) {
        const oldest = memo.keys().next().value;
        if (oldest !== undefined) memo.delete(oldest);
      }
      memo.set(memoKey, fromRequest);
      return fromRequest;
    }
    return memo.get(memoKey) ?? toCloudCacheParams(params as Record<string, unknown>);
  };
  return new Proxy(storage as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof value !== "function") return value;
      if (!KEYED_METHODS.has(prop)) return value.bind(target);
      return (path: string, params: unknown, ...rest: unknown[]) =>
        value.call(target, path, resolve(path, params), ...rest);
    },
  }) as T;
}
