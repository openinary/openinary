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
  const guard = requireMcpAuth(
    auth,
    (_req, payload) => {
      if (typeof payload.sub === "string") {
        claims = {
          sub: payload.sub,
          org: typeof payload.org === "string" ? payload.org : null,
        };
      }
      return new Response(null, { status: 204 });
    },
    { resource: MCP_RESOURCE, requiredScopes: [MCP_SCOPE] },
  );
  const response = await guard(request);
  return claims ? { claims } : { challenge: response };
}
