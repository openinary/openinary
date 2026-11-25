import { Context, Next } from "hono";
import { type Action, can, getUserAccess, isRole, mayAccess, type Role } from "shared";
import { getAuth, getAuthPolicy } from "shared/auth";
import { logger, serializeError } from "@openinary/core";
import { clientIp } from "../utils/client-ip";

export type AuthVariables = {
  Variables: {
    /**
     * Null after a presigned upload: the signature, not a user, authorized it.
     * `role` is read fresh on every request (null for a role this release
     * doesn't know, which can do nothing).
     */
    user: {
      id: string;
      email: string;
      name: string;
      role: Role | null;
    } | null;
    apiKey: {
      id: string;
      name: string | null;
      userId: string;
    } | null;
  };
};

function auditLog(c: Context, event: string, data: Record<string, unknown> = {}) {
  logger.info(
    { event, ...data, path: c.req.path, method: c.req.method, ip: clientIp(c) },
    "[Audit]",
  );
}

/**
 * Loads the user behind a valid key or session and checks they may still get
 * in. Done on every request, so a ban, a role change or a tightened allowlist
 * applies at once, including to API keys (which act with the owner's current
 * role). Returns the rejection to send, or null after putting the user on the
 * context.
 */
function admitUser(
  c: Context<AuthVariables>,
  userId: string,
  via: "api_key" | "session",
): Response | null {
  const access = getUserAccess(userId);
  if (!access) {
    // Belt and braces against a key or session outliving its user.
    auditLog(c, `auth.${via}.rejected`, { reason: "user_not_found_in_db", userId });
    return c.json(
      { error: "Authentication required", code: "USER_NOT_FOUND", message: "This account no longer exists" },
      401,
    );
  }
  if (access.banned) {
    auditLog(c, `auth.${via}.rejected`, { reason: "banned", userId });
    return c.json(
      { error: "Forbidden", code: "BANNED_USER", message: "This account has been banned from this instance" },
      403,
    );
  }
  if (!mayAccess(getAuthPolicy(), access)) {
    auditLog(c, `auth.${via}.rejected`, { reason: "access_revoked", userId });
    return c.json(
      {
        error: "Forbidden",
        code: "ACCESS_REVOKED",
        message: "This account's email domain is no longer allowed on this instance",
      },
      403,
    );
  }
  // A role that can't manage keys can't see or revoke them either, so keys
  // left from an earlier role stop working until the role allows them again.
  if (via === "api_key" && !can(access.role, "apiKeys:manage")) {
    auditLog(c, "auth.api_key.rejected", { reason: "role_without_api_keys", userId });
    return c.json(
      { error: "Forbidden", code: "FORBIDDEN_ROLE", message: "This account's role can't use API keys" },
      403,
    );
  }
  c.set("user", {
    id: access.id,
    email: access.email,
    name: access.name,
    role: isRole(access.role) ? access.role : null,
  });
  return null;
}

/**
 * Verifies an API key (Authorization: Bearer) or a session cookie and puts
 * the user on the context. Returns true when authenticated, false when no
 * valid credentials were sent (callers decide whether to reject or try
 * another mechanism), or a Response when the credentials were valid but the
 * account may not get in: send that as is, never fall back to another
 * mechanism.
 */
export async function authenticateRequest(
  c: Context<AuthVariables>,
): Promise<boolean | Response> {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : authHeader;

  if (token) {
    try {
      const result = await getAuth().api.verifyApiKey({ body: { key: token } });

      if (result.valid && result.key) {
        const userId = result.key.referenceId;
        const denied = admitUser(c, userId, "api_key");
        if (denied) return denied;
        c.set("apiKey", { id: result.key.id, name: result.key.name, userId });
        auditLog(c, "auth.api_key.success", {
          userId,
          apiKeyId: result.key.id,
          apiKeyName: result.key.name,
        });
        return true;
      }
      auditLog(c, "auth.api_key.failed", {
        reason: "invalid_key",
        tokenPrefix: token.substring(0, 8) + "...",
      });
    } catch (error) {
      auditLog(c, "auth.api_key.error", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  try {
    if (cookieHeader) {
      const sessionResult = await getAuth().api.getSession({
        headers: new Headers({ cookie: cookieHeader }),
      });

      if (sessionResult?.session && sessionResult.user) {
        const denied = admitUser(c, sessionResult.user.id, "session");
        if (denied) return denied;
        c.set("apiKey", null);
        auditLog(c, "auth.session.success", {
          userId: sessionResult.user.id,
          userEmail: sessionResult.user.email,
        });
        return true;
      }
    }
  } catch (error) {
    logger.error(
      { error: serializeError(error) },
      "Session verification error",
    );
  }

  auditLog(c, "auth.failed", {
    reason: "no_valid_credentials",
    hasAuthHeader: !!authHeader,
    hasCookie: !!cookieHeader,
  });
  return false;
}

/** Rejects with 401 (or 403 for a banned or locked-out account) unless authenticateRequest succeeds. */
export async function apiKeyAuth(c: Context<AuthVariables>, next: Next) {
  const result = await authenticateRequest(c);
  if (result instanceof Response) return result;
  if (result) {
    await next();
    return;
  }

  return c.json(
    {
      error: "Authentication required",
      message:
        "Please provide a valid API key (Authorization: Bearer <key>) or valid session cookie",
    },
    401,
  );
}

/**
 * 403 unless the authenticated user's role may perform `action` (or the
 * action `action(c)` picks for this request). Goes after apiKeyAuth or
 * presignedOrApiKeyAuth. A presigned upload has no user (null) and passes:
 * the signature is its authorization, and only a member could mint it.
 */
export const requirePermission =
  (action: Action | ((c: Context<AuthVariables>) => Action)) =>
  async (c: Context<AuthVariables>, next: Next) => {
    const user = c.get("user");
    if (user === null) {
      await next();
      return;
    }
    if (!user) {
      return c.json(
        { error: "Authentication required", message: "Please sign in or provide an API key" },
        401,
      );
    }
    const needed = typeof action === "function" ? action(c) : action;
    if (!can(user.role, needed)) {
      auditLog(c, "auth.permission.denied", { userId: user.id, role: user.role, action: needed });
      return c.json(
        {
          error: "Forbidden",
          code: "FORBIDDEN_ROLE",
          action: needed,
          message: `Your role (${user.role ?? "none"}) can't do this: it needs ${needed}.`,
        },
        403,
      );
    }
    await next();
  };
