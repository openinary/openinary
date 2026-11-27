// Verifies an MCP OAuth access token (a JWT minted by the mcp() plugin in
// lib/auth-instance.ts). Loaded lazily, like the auth instance itself: none of
// this runs at Worker startup.

import { MCP_RESOURCE, MCP_SCOPE } from "../config.js";
import { loadAuth } from "../lib/auth.js";

/** What /mcp and the media routes need from a verified token. */
export type McpClaims = {
  /** The signed-in person. */
  sub: string;
  /** The team the consent was given for; null = their own account. */
  org: string | null;
};

/** Cheap shape check, so API keys (oik_...) never reach JWT verification. */
export const looksLikeJwt = (token: string) =>
  /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);

/**
 * The library's own MCP guard, used as a verifier: signature (keys read
 * in-process), issuer, audience = MCP_RESOURCE, expiry and the media scope.
 * Null when any of it fails. `challenge` gets the guard's 401/403 response,
 * which carries the WWW-Authenticate header MCP clients need.
 */
export async function verifyMcpRequest(
  request: Request,
): Promise<{ claims: McpClaims } | { challenge: Response }> {
  const [{ requireMcpAuth }, auth] = await Promise.all([
    import("@better-auth/mcp"),
    loadAuth(),
  ]);
  let claims: McpClaims | undefined;
  let clientId: string | undefined;
  const guard = requireMcpAuth(
    auth,
    (_req, payload) => {
      if (typeof payload.sub === "string") {
        claims = {
          sub: payload.sub,
          org: typeof payload.org === "string" ? payload.org : null,
        };
        clientId = typeof payload.azp === "string" ? payload.azp : undefined;
      }
      return new Response(null, { status: 204 });
    },
    { resource: MCP_RESOURCE, requiredScopes: [MCP_SCOPE] },
  );
  const response = await guard(request);
  if (!claims) return { challenge: response };
  if (clientId && (await stillConnected(claims, clientId))) return { claims };
  // Disconnected from the Home: the JWT is still validly signed, so answer
  // as if no token was sent, which carries the same WWW-Authenticate.
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  return { challenge: await guard(new Request(request.url, { headers })) };
}

/**
 * Access tokens are JWTs checked without a lookup, so disconnecting an agent
 * (rpc/agent.ts deletes its consent) would only bite at expiry. One indexed
 * read per request makes it immediate.
 */
async function stillConnected({ sub, org }: McpClaims, clientId: string) {
  const [{ and, eq, isNull }, { db }, { oauthConsent }] = await Promise.all([
    import("drizzle-orm"),
    import("../../shared/db/index.js"),
    import("../../shared/db/schema/auth.js"),
  ]);
  const [row] = await db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(
      and(
        eq(oauthConsent.userId, sub),
        eq(oauthConsent.clientId, clientId),
        org
          ? eq(oauthConsent.referenceId, org)
          : isNull(oauthConsent.referenceId),
      ),
    )
    .limit(1);
  return !!row;
}
