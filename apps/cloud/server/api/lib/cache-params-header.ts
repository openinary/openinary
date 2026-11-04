// Shared by the Worker (which sets it) and the container (which reads it).
// Kept in its own dependency-free module so the Worker bundle doesn't pull
// in node:async_hooks or @openinary/core.

/**
 * JSON of the params the Worker keys this request's derivative under
 * (worker/index.ts derivativeParams). The container stores the derivative
 * under exactly these instead of what its own (newer) parser produced, so the
 * Worker's R2 cache lookup and UsageMeter's confirmation head find it.
 */
export const CACHE_PARAMS_HEADER = "X-Openinary-Cache-Params";
