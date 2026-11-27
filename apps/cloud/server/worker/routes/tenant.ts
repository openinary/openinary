// Who a media request acts for, and in which bucket.

import type { Context, Hono, Next } from "hono";
import type { CustomerData } from "../../shared/autumn.js";
import { tenantRootFor } from "../../shared/tenant.js";
import { activeBucketFor, resolveAccount } from "../lib/account.js";
import { auth } from "../lib/auth.js";
import { getActiveBucketId } from "../lib/bucket.js";
import { meterFor } from "../lib/meter.js";
import { looksLikeJwt } from "../mcp/token.js";

type TenantVars = {
  tenantRoot: string;
  userId: string;
  bucketId: string;
  customerData: CustomerData;
};
export type AppEnv = { Bindings: Env; Variables: TenantVars };
export type App = Hono<AppEnv>;
export type Ctx = Context<AppEnv>;

/**
 * An API key may arrive as `x-api-key` (the dashboard's own convention) or as
 * `Authorization: Bearer` - the latter is what @openinary/upload-token's
 * signUpload() sends, and it's the shape a self-hosted instance accepts, so
 * supporting both is what lets one integration target either deployment.
 */
export function apiKeyFrom(c: Ctx): string | null {
  const header = c.req.header("x-api-key");
  if (header) return header;
  const authorization = c.req.header("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

/** Sets the tenant variables every media route reads. */
export function setTenant(
  c: Ctx,
  userId: string,
  bucketId: string,
  customerData: CustomerData,
): void {
  c.set("tenantRoot", tenantRootFor(userId, bucketId));
  c.set("bucketId", bucketId);
  c.set("userId", userId);
  c.set("customerData", customerData);
}

/** Meters a change in stored originals against the request's account. */
export function meterStorage(c: Ctx, bytes: number): void {
  c.executionCtx.waitUntil(
    meterFor(c.env.USAGE_METER, c.get("userId")).trackStorage(
      bytes,
      c.get("customerData"),
    ),
  );
}

/**
 * Resolves the caller from either a dashboard session cookie or an API key,
 * and picks the bucket the request operates on. False = unauthenticated.
 *
 * A key created with a bucket scope pins that bucket (its `metadata.bucketId`);
 * an unscoped key - like a session - follows whichever bucket the account has
 * marked active. tenantRoot always embeds the *owner's* userId, so a key can
 * never reach another account's storage even if its metadata were tampered
 * with.
 *
 * The key path deliberately does NOT go through getSession(): better-auth only
 * turns an API key into a session when the plugin's `enableSessionForAPIKeys`
 * is on, and turning that on globally would let a media key act as a full
 * dashboard session on every oRPC procedure too - deleting buckets, minting
 * further keys. verifyApiKey gives us the owner directly, so the key stays
 * scoped to exactly these media routes.
 */
export async function applySessionTenant(c: Ctx): Promise<boolean> {
  const key = apiKeyFrom(c);
  // An MCP agent's OAuth access token (see worker/mcp/). It acts as the
  // person who approved it, on the account they approved it for, with the
  // same membership check a dashboard session gets on every request.
  if (key && looksLikeJwt(key)) {
    const { verifyMcpRequest } = await import("../mcp/token.js");
    const verified = await verifyMcpRequest(c.req.raw);
    if (!("claims" in verified)) return false;
    const account = await resolveAccount({
      user: { id: verified.claims.sub },
      session: { activeOrganizationId: verified.claims.org },
    });
    setTenant(c, account.accountId, await activeBucketFor(account), {});
    return true;
  }
  if (key) {
    const { valid, key: verified } = await auth.api.verifyApiKey({
      body: { key },
    });
    if (!valid || !verified?.referenceId) return false;
    const scoped = (verified.metadata as { bucketId?: unknown } | null)
      ?.bucketId;
    const userId = verified.referenceId;
    const bucketId =
      typeof scoped === "string" ? scoped : await getActiveBucketId(userId);
    // No name/email on a key-authenticated request: the account is long since
    // created in Autumn by the time it can mint keys.
    setTenant(c, userId, bucketId, {});
    return true;
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return false;
  // Any role may work with media, so no permission check: only which account.
  const account = await resolveAccount(session);
  setTenant(
    c,
    account.accountId,
    await activeBucketFor(account),
    // Autumn's customer is the owner's: a member's details stay out of it.
    account.memberId
      ? {}
      : { name: session.user.name, email: session.user.email },
  );
  return true;
}

export async function requireTenant(c: Ctx, next: Next) {
  if (!(await applySessionTenant(c)))
    return c.json({ error: "Unauthorized" }, 401);
  await next();
}
