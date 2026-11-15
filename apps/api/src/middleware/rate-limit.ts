import { Context, Next } from "hono";
import { logger } from "@openinary/core";
import { clientIp } from "../utils/client-ip";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ponytail: per-process memory, so limits reset on restart and are not shared
// between replicas. Move to the database if an instance ever runs several.
const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_MAX = parseInt(process.env.PUBLIC_RATE_LIMIT_MAX || "100", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.PUBLIC_RATE_LIMIT_WINDOW_MS || "60000",
  10,
);

let lastSweep = 0;

function sweepExpired(now: number): void {
  if (now - lastSweep < RATE_LIMIT_WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, entry] of rateLimitStore) {
    if (entry.resetAt < now) rateLimitStore.delete(ip);
  }
}

/**
 * Fixed-window limit per client IP for the public routes (protected routes
 * are limited by Better Auth). Configured by PUBLIC_RATE_LIMIT_MAX and
 * PUBLIC_RATE_LIMIT_WINDOW_MS; reports X-RateLimit-* headers.
 */
export async function publicRateLimit(c: Context, next: Next) {
  const ip = clientIp(c);
  const now = Date.now();
  sweepExpired(now);

  let entry = rateLimitStore.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }
  entry.count++;

  c.header("X-RateLimit-Limit", RATE_LIMIT_MAX.toString());
  c.header(
    "X-RateLimit-Remaining",
    Math.max(0, RATE_LIMIT_MAX - entry.count).toString(),
  );
  c.header("X-RateLimit-Reset", Math.floor(entry.resetAt / 1000).toString());

  if (entry.count > RATE_LIMIT_MAX) {
    logger.warn(
      { ip, path: c.req.path, count: entry.count, limit: RATE_LIMIT_MAX },
      "Rate limit exceeded for public route",
    );
    return c.json(
      {
        error: "Too Many Requests",
        message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds.`,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      },
      429,
    );
  }

  await next();
}
