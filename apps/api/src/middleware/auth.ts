import { Context, Next } from "hono";
import { auth } from "shared/auth";
import logger from "../utils/logger";

// Define the variables that will be available in the context
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

/**
 * Structured audit logger for security events
 */
function auditLog(event: string, data: Record<string, any>) {
  logger.info({ event, ...data }, "[Audit]");
}

/**
 * Middleware to verify API key OR session cookie
 * Supports both API key authentication and web app session authentication
 * Attaches user and apiKey info to context if valid
 */
export async function apiKeyAuth(c: Context<AuthVariables>, next: Next) {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");

  // Try API key authentication first
  if (authHeader) {
    // Extract token from "Bearer <token>" format
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    if (token) {
      try {
        // Verify the API key using Better Auth
        const result = await auth.api.verifyApiKey({
          body: {
            key: token,
          },
        });

        if (result.valid && result.key) {
          // API key is valid
          c.set("apiKey", {
            id: result.key.id,
            name: result.key.name,
            userId: result.key.userId,
          });

          c.set("user", {
            id: result.key.userId,
            email: "",
            name: "",
          });

          // Audit log: successful API key authentication
          auditLog("auth.api_key.success", {
            userId: result.key.userId,
            apiKeyId: result.key.id,
            apiKeyName: result.key.name,
            path: c.req.path,
            method: c.req.method,
            ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
          });

          await next();
          return;
        } else {
          // Audit log: invalid API key
          auditLog("auth.api_key.failed", {
            reason: "invalid_key",
            tokenPrefix: token.substring(0, 8) + "...",
            path: c.req.path,
            method: c.req.method,
            ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
          });
        }
      } catch (error) {
        // Audit log: API key verification error
        auditLog("auth.api_key.error", {
          error: error instanceof Error ? error.message : "unknown",
          path: c.req.path,
          method: c.req.method,
          ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        });
      }
    }
  }

  // If no valid API key, try session cookie authentication
  try {
    if (cookieHeader) {
      // Better Auth stores session in cookies
      // Try to get session using Better Auth
      const sessionResult = await auth.api.getSession({
        headers: new Headers({
          cookie: cookieHeader,
        }),
      });

      if (sessionResult && sessionResult.session && sessionResult.user) {
        // SECURITY FIX: Verify that the user actually exists in the database
        // Better Auth may return session data from signed cookies without DB validation
        const { db } = await import("shared/auth");
        const userExists = db.prepare("SELECT id FROM user WHERE id = ?").get(sessionResult.user.id);
        
        if (!userExists) {
          // User was deleted from database - reject the session
          auditLog("auth.session.rejected", {
            reason: "user_not_found_in_db",
            userId: sessionResult.user.id,
            path: c.req.path,
            method: c.req.method,
            ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
          });
          
          // Continue to authentication failure below
        } else {
          // Valid session found AND user exists in DB
          c.set("user", {
            id: sessionResult.user.id,
            email: sessionResult.user.email,
            name: sessionResult.user.name,
          });

          c.set("apiKey", null); // No API key, using session

          // Audit log: successful session authentication
          auditLog("auth.session.success", {
            userId: sessionResult.user.id,
            userEmail: sessionResult.user.email,
            path: c.req.path,
            method: c.req.method,
            ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
          });

          await next();
          return;
        }
      }
    }
  } catch (error) {
    logger.error({ error }, "Session verification error");
  }

  // Neither API key nor session is valid
  // Audit log: authentication failed
  auditLog("auth.failed", {
    reason: "no_valid_credentials",
    path: c.req.path,
    method: c.req.method,
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
    hasAuthHeader: !!authHeader,
    hasCookie: !!cookieHeader,
  });
  
  return c.json(
    {
      error: "Authentication required",
      message: "Please provide a valid API key (Authorization: Bearer <key>) or valid session cookie",
    },
    401
  );
}
