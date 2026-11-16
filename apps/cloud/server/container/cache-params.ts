import { AsyncLocalStorage } from "node:async_hooks";
import {
  legacyCloudKey,
  toLegacyCloudParams,
  type CacheKeyFn,
  type LegacyCloudParams,
} from "@openinary/core/url";

// The container stores derivatives under the key the Worker looks up and
// meters, which is legacyCloudKey over the Worker's params, not over the typed
// params core's transform hands storage:
//   1. Per request, the Worker sends the exact params it keys on
//      (CACHE_PARAMS_HEADER); they are used verbatim.
//   2. Calls made outside a request (VideoWorker uploading a finished job)
//      reuse what the same core params mapped to during the request that
//      enqueued the job (in-memory, per instance).
//   3. Failing both (job survived a container restart), toLegacyCloudParams
//      converts core's params back. Exact except where core's parser is lossy
//      (w_auto, a_auto, t_1, tt_ formatting): those miss once and regenerate.

export const requestCacheParams = new AsyncLocalStorage<LegacyCloudParams | null>();

/** Parses the header; anything malformed is ignored (falls back to 2/3). */
export function parseCacheParamsHeader(
  raw: string | undefined | null,
): LegacyCloudParams | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: LegacyCloudParams = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") return null;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** Order-insensitive, so a store that reorders params still hits the memo. */
function sortedJson(params: object): string {
  const p = params as Record<string, unknown>;
  return JSON.stringify(Object.fromEntries(Object.keys(p).sort().map((k) => [k, p[k]])));
}

const MEMO_LIMIT = 2000;
const memo = new Map<string, LegacyCloudParams>();

/** The container's storage key function (see the header comment). */
export const cloudKeyFor: CacheKeyFn = (originalPath, params) => {
  const memoKey = `${originalPath}\u0000${sortedJson(params)}`;
  const fromRequest = requestCacheParams.getStore();
  if (fromRequest) {
    if (memo.size >= MEMO_LIMIT) {
      const oldest = memo.keys().next().value;
      if (oldest !== undefined) memo.delete(oldest);
    }
    memo.set(memoKey, fromRequest);
  }
  return legacyCloudKey(
    originalPath,
    fromRequest ?? memo.get(memoKey) ?? toLegacyCloudParams(params),
  );
};
