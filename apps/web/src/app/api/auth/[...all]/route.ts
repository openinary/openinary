import { allowedOrigins, hasAdmin } from "shared";
import { getAuth } from "shared/auth";
import logger from "@/lib/logger";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET = (request: Request) => getAuth().handler(request);

// No second account once one exists. The database trigger enforces it too;
// this answers with a readable error instead.
export async function POST(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith("/sign-up/email")) {
    try {
      if (hasAdmin()) {
        logger.warn("[Auth] Sign-up attempt blocked: admin already exists", {
          pathname: url.pathname,
        });
        return json(
          {
            error:
              "Setup is already completed. Creating additional administrator accounts is disabled.",
          },
          403,
        );
      }
    } catch (error) {
      // Fail closed: if we cannot verify, we refuse sign-up.
      logger.error("[Auth] Error while checking admin account before sign-up", {
        error,
      });
      return json(
        {
          error:
            "Unable to verify setup status. For security reasons, sign-up is disabled.",
        },
        500,
      );
    }
  }

  return getAuth().handler(request);
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = !!origin && allowedOrigins().includes(origin);

  if (origin && !allowed) {
    logger.warn("[Auth CORS] Preflight from non-allowed origin", {
      requestOrigin: origin,
      allowedOrigins: allowedOrigins(),
    });
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": allowed ? origin : "",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
