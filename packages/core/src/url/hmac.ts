import { createHmac, timingSafeEqual } from "node:crypto";

/** Hex characters kept from the HMAC: 64 bits, short enough for a URL. */
export const SIGNATURE_LENGTH = 16;

/** HMAC-SHA256 of `payload`, hex, truncated to SIGNATURE_LENGTH. */
export function sign(payload: string, secret: string): string {
  if (!secret) throw new Error("A secret is required to sign");
  return createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, SIGNATURE_LENGTH);
}

/** Timing-safe check of a signature made by `sign`. */
export function verify(provided: string, payload: string, secret: string): boolean {
  if (!secret || typeof provided !== "string" || provided.length !== SIGNATURE_LENGTH) {
    return false;
  }
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(sign(payload, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}
