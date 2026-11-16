// Presigned upload tokens for the @openinary/file-uploader component.
//
// The self-hosted flow signs just `folder:expires` with a server-global
// API_SECRET, which is unambiguous when there is only one storage root. Here
// tenantRoot is `ugc/{userId}/{bucketId}` (see shared/tenant.ts), so a
// signature over the folder alone would authorize a write without saying
// *whose* storage it lands in - any tenant able to obtain one could target
// another tenant's bucket. The token therefore carries the tenant itself and
// /upload reads the destination from it, never from the request.
//
// Stateless on purpose: minting is on the hot path of every upload, and a DB
// row per signature (or a short-lived better-auth key) would be write traffic
// and cleanup for something that is worthless 5 minutes later anyway.

import { sign, verify } from "@openinary/core/url";

type UploadTokenPayload = {
  /** Owning account - the `u` in tenantRoot. */
  userId: string;
  /** Destination bucket - the `b` in tenantRoot. */
  bucketId: string;
  /** Folder the upload is scoped to, "" for the bucket root. */
  folder: string;
  /** Unix seconds after which the token is refused. */
  expires: number;
};

function secretOrThrow(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  // Reusing the auth secret rather than introducing a second one: it is
  // already required for the Worker to boot at all (lib/auth.ts), so
  // there is no deployment where this is unset but uploads should work.
  if (!secret)
    throw new Error("BETTER_AUTH_SECRET is required to sign upload tokens");
  return secret;
}

export function signUploadToken(p: UploadTokenPayload): string {
  const payload = Buffer.from(
    JSON.stringify({ u: p.userId, b: p.bucketId, f: p.folder, e: p.expires }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secretOrThrow())}`;
}

/** Returns the payload, or null for anything malformed, mis-signed or expired. */
export function verifyUploadToken(
  token: string,
  now = Date.now(),
): UploadTokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  // verify() refuses an unset secret
  if (!verify(token.slice(dot + 1), payload, process.env.BETTER_AUTH_SECRET ?? "")) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object") return null;
  const { u, b: bucketId, f, e } = decoded as Record<string, unknown>;
  if (typeof u !== "string" || !u) return null;
  if (typeof bucketId !== "string" || !bucketId) return null;
  if (typeof f !== "string") return null;
  if (typeof e !== "number" || !Number.isFinite(e)) return null;
  if (e * 1000 <= now) return null;

  return { userId: u, bucketId, folder: f, expires: e };
}
