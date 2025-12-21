import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;
export const POST = handler.POST;

// Add CORS support for OPTIONS requests
export async function OPTIONS(request: Request) {
  // Validate origin against whitelist
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "http://localhost:3001", // Next.js dev
    "http://localhost:3000", // API itself
    process.env.ALLOWED_ORIGIN,
    process.env.BETTER_AUTH_URL,
  ].filter(Boolean);
  
  // In production, only allow configured origins
  const allowedOrigin = 
    process.env.NODE_ENV === "production"
      ? (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || null)
      : (origin || "http://localhost:3001");
  
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

