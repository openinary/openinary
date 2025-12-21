import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

// #region agent log
console.log('[DEBUG:auth-route] Auth API route loaded', {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
  hypothesisId: 'H7,H8'
});
// #endregion

const handler = toNextJsHandler(auth);

// Wrapper to log POST responses (login/signup)
export async function POST(request: NextRequest) {
  // #region agent log
  const url = new URL(request.url);
  console.log('[DEBUG:auth-route] POST request', {
    pathname: url.pathname,
    origin: request.headers.get('origin'),
    cookie: request.headers.get('cookie'),
    hypothesisId: 'H7,H8,H9'
  });
  // #endregion
  
  const response = await handler.POST(request);
  
  // #region agent log
  const setCookieHeader = response.headers.get('set-cookie');
  console.log('[DEBUG:auth-route] POST response', {
    status: response.status,
    hasSetCookie: !!setCookieHeader,
    setCookieValue: setCookieHeader ? setCookieHeader.substring(0, 100) + '...' : 'none',
    allHeaders: Array.from(response.headers.entries()),
    hypothesisId: 'H7,H8,H9'
  });
  // #endregion
  
  return response;
}

export const GET = handler.GET;

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

