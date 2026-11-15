import { createHash } from "crypto";
import { isPlaceholderSecret } from "shared";

/**
 * Deterministic, anonymous instance id derived from BETTER_AUTH_SECRET.
 *
 * Salted SHA-256, one-way: the secret never leaves the machine and cannot be
 * recovered from the id. Because the secret lives in the deployment's env
 * (not on disk), the derived id survives a wiped database: restarts,
 * updates, and volume-less redeploys all keep the same instance identity.
 */

const SALT = "openinary-telemetry-v1";

// A placeholder would collide every copy-paste deployment onto one id.
export function canDeriveFrom(secret: string | undefined): secret is string {
  return (
    typeof secret === "string" &&
    secret.length >= 32 &&
    !isPlaceholderSecret(secret)
  );
}

export function deriveInstanceId(secret: string): string {
  const hex = createHash("sha256")
    .update(SALT)
    .update(secret)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
