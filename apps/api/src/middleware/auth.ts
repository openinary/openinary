import { Context, Next } from "hono";
import { getDb } from "shared";
import { getAuth } from "shared/auth";
import { logger, serializeError } from "@openinary/core";
import { clientIp } from "../utils/client-ip";

export type AuthVariables = {
  Variables: {
    user: {
      id: string;
      email: string;
      name: string;
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
 * Verifies an API key (Authorization: Bearer) or a session cookie and puts
 * the user on the context. Writes no response: callers decide whether to
 * reject or try another mechanism.
 */
export async function authenticateRequest(
  c: Context<AuthVariables>,
): Promise<boolean> {
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
        c.set("apiKey", { id: result.key.id, name: result.key.name, userId });
        c.set("user", { id: userId, email: "", name: "" });
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
        // Belt and braces against a session outliving its user.
        const userExists = getDb()
          .prepare("SELECT 1 FROM user WHERE id = ?")
          .get(sessionResult.user.id);

        if (userExists) {
          c.set("user", {
            id: sessionResult.user.id,
            email: sessionResult.user.email,
            name: sessionResult.user.name,
          });
          c.set("apiKey", null);
          auditLog(c, "auth.session.success", {
            userId: sessionResult.user.id,
            userEmail: sessionResult.user.email,
          });
          return true;
        }
        auditLog(c, "auth.session.rejected", {
          reason: "user_not_found_in_db",
          userId: sessionResult.user.id,
        });
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

/** Rejects with 401 unless authenticateRequest succeeds. */
export async function apiKeyAuth(c: Context<AuthVariables>, next: Next) {
  if (await authenticateRequest(c)) {
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
