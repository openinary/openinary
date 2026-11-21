import { allowedOrigins } from "shared";
import { getAuth } from "shared/auth";
import logger from "@/lib/logger";

// Who may sign up, sign in and with what is decided in shared/auth's hooks,
// for every route at once; this only hands requests over.
export const GET = (request: Request) => getAuth().handler(request);

export const POST = (request: Request) => getAuth().handler(request);

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
