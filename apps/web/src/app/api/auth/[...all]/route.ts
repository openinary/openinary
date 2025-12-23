import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import logger from "@/lib/logger";
import { hasAdminAccount } from "shared/auth";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

// Hardened POST handler: blocks any additional sign-up once an admin/user exists
export async function POST(request: Request) {
  const url = new URL(request.url);

  // All Better Auth routes are mounted under /api/auth
  // We specifically guard the email/password sign-up endpoint
  if (url.pathname.endsWith("/sign-up/email")) {
    try {
      if (hasAdminAccount()) {
        logger.warn("[Auth] Sign-up attempt blocked: admin already exists", {
          pathname: url.pathname,
        });

        return new Response(
          JSON.stringify({
            error:
              "Setup is already completed. Creating additional administrator accounts is disabled.",
          }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    } catch (error) {
      // Fail closed: if we cannot verify, we refuse sign-up
      logger.error("[Auth] Error while checking admin account before sign-up", {
        error,
      });

      return new Response(
        JSON.stringify({
          error:
            "Unable to verify setup status. For security reasons, sign-up is disabled.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  return handler.POST(request);
}

// Add CORS support for OPTIONS requests
export async function OPTIONS(request: Request) {
  // Validate origin against whitelist
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "http://localhost:3001", // Next.js dev
    "http://localhost:3000", // API itself
    process.env.BETTER_AUTH_URL,
  ].filter(Boolean);
  
  // In production, only allow configured origins
  const allowedOrigin = 
    process.env.NODE_ENV === "production"
      ? (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || null)
      : (origin || "http://localhost:3001");
  
  // Log CORS preflight for debugging
  if (process.env.NODE_ENV === "production" && origin && !allowedOrigins.includes(origin)) {
    logger.warn("[Auth CORS] Preflight from non-allowed origin", {
      requestOrigin: origin,
      allowedOrigins: allowedOrigins,
      betterAuthUrl: process.env.BETTER_AUTH_URL,
    });
  }
  
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin || "",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

