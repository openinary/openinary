import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

// Loopback, RFC 1918, IPv6 ULA and link-local, plain or IPv4-mapped.
const PRIVATE_PEER =
  /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)|^::1$|^f[cd][0-9a-f]{2}:|^fe[89ab][0-9a-f]:/i;

/**
 * The caller's address. X-Forwarded-For / X-Real-IP are only believed from a
 * private peer (the bundled nginx, a proxy on the same network): an API
 * exposed directly would otherwise let any client pick a fresh address per
 * request and walk past the rate limits.
 */
// ponytail: "private peer" stands in for "trusted proxy". Add an explicit
// TRUSTED_PROXIES list if someone fronts this with a proxy on a public address.
export function clientIp(c: Context): string {
  let peer: string | undefined;
  try {
    peer = getConnInfo(c).remote.address;
  } catch {
    // No Node socket, e.g. app.request() in tests.
  }
  if (peer && !PRIVATE_PEER.test(peer)) return peer;
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real;
  return peer || "unknown";
}
